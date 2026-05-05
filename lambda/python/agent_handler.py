"""
Strands Agent Lambda ハンドラー

POST /chat                      - エージェントにメッセージ送信
GET /chat/models                - 利用可能モデル一覧取得
GET /chat/history/{sessionId}   - 会話履歴取得
DELETE /chat/history/{sessionId} - 会話履歴削除
"""

import json
import os
import re
import sys
import uuid
import logging
import time
from types import ModuleType
from typing import Dict, Any, Optional

# OpenTelemetry entry_points 問題の回避
# strands-agents が opentelemetry をimportする際、Lambda環境では
# entry_pointsメタデータが正しく解決されずStopIterationが発生する。
# importlib.metadata.entry_points をパッチして回避する。
import importlib.metadata

_original_entry_points = importlib.metadata.entry_points

def _patched_entry_points(**kwargs):
    """entry_points のパッチ版。opentelemetry_context グループの結果が空の場合にフォールバックを提供する。"""
    result = _original_entry_points(**kwargs)
    group = kwargs.get('group', '')
    if group == 'opentelemetry_context':
        items = list(result) if hasattr(result, '__iter__') else []
        if not items:
            class _FakeEntryPoint:
                name = 'contextvars_context'
                def load(self):
                    from opentelemetry.context.contextvars_context import ContextVarsRuntimeContext
                    return ContextVarsRuntimeContext
            return [_FakeEntryPoint()]
    return result

importlib.metadata.entry_points = _patched_entry_points

try:
    import boto3
except ImportError:
    boto3 = None

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

VERSION = os.environ.get('VERSION', '3.1.1')

# 許可モデル一覧（許可リスト方式でインジェクション防止）
ALLOWED_MODELS = {
    'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {
        'name': 'Claude Sonnet 4.5',
        'provider': 'Anthropic',
        'description': '高精度・バランス型',
    },
    'us.anthropic.claude-haiku-4-5-20251001-v1:0': {
        'name': 'Claude Haiku 4.5',
        'provider': 'Anthropic',
        'description': '高速・低コスト',
    },
    'us.amazon.nova-2-lite-v1:0': {
        'name': 'Nova 2 Lite',
        'provider': 'Amazon',
        'description': 'AWS製・低コスト・マルチモーダル',
    },
    'us.amazon.nova-micro-v1:0': {
        'name': 'Nova Micro',
        'provider': 'Amazon',
        'description': 'AWS製・最小コスト',
    },
}

_FALLBACK_MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
_env_model_id = os.environ.get('AGENT_MODEL_ID', _FALLBACK_MODEL_ID)
if _env_model_id not in ALLOWED_MODELS:
    logger.warning(f"AGENT_MODEL_ID '{_env_model_id}' not in ALLOWED_MODELS, falling back to {_FALLBACK_MODEL_ID}")
    _env_model_id = _FALLBACK_MODEL_ID
DEFAULT_MODEL_ID = _env_model_id



def _looks_like_tool_output(text: str) -> bool:
    """レスポンステキストがツール出力を模倣しているかを検出する"""
    import re
    # composite-agent-*.png or composite-video-*.mp4 などのファイル名パターン
    file_patterns = [
        r'composite-agent-\d{8}_\d{6}\.png',
        r'composite-video-.*\.(mp4|mxf|webm|avi)',
    ]
    for pattern in file_patterns:
        if re.search(pattern, text):
            return True
    return False


def format_response(status_code: int, body: Any, headers: Dict[str, str] = None) -> Dict:
    """API Gateway用レスポンス"""
    default_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Amz-Date, Authorization, X-Api-Key',
    }
    if headers:
        default_headers.update(headers)

    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body, ensure_ascii=False, default=str) if isinstance(body, (dict, list)) else body,
    }



def create_agent(model_id: str = None, system_prompt: str = None):
    """Strands Agentを初期化する（AWS Bedrock経由）。system_prompt 未指定時は SYSTEM_PROMPT を使用。"""
    from strands import Agent
    from strands.models.bedrock import BedrockModel
    from agent_tools import compose_images, generate_video, list_uploaded_images, delete_uploaded_image, get_help
    from agent_prompts import SYSTEM_PROMPT

    agent_model_id = model_id or DEFAULT_MODEL_ID
    model = BedrockModel(
        model_id=agent_model_id,
        max_tokens=4096,
        region_name=os.environ.get('BEDROCK_REGION', 'us-east-1'),
    )

    agent = Agent(
        model=model,
        system_prompt=system_prompt or SYSTEM_PROMPT,
        tools=[compose_images, generate_video, list_uploaded_images, delete_uploaded_image, get_help],
    )

    return agent


def handle_chat(event: Dict[str, Any], context: Any) -> Dict:
    """POST /chat - エージェントにメッセージを送信"""
    request_id = str(uuid.uuid4())
    start_time = time.time()

    try:
        # リクエストパース
        body = json.loads(event.get('body', '{}') or '{}')
        session_id = body.get('sessionId', str(uuid.uuid4()))
        message = body.get('message', '').strip()
        model_id = body.get('modelId', '').strip() or DEFAULT_MODEL_ID

        # モデルIDバリデーション（許可リスト方式）
        if model_id not in ALLOWED_MODELS:
            return format_response(400, {
                'error': 'Invalid modelId. Use GET /chat/models to see available models.',
                'requestId': request_id,
            })

        if not message:
            return format_response(400, {
                'error': 'message is required',
                'requestId': request_id,
            })

        # メッセージ長制限
        if len(message) > 2000:
            return format_response(400, {
                'error': 'message must be 2000 characters or less',
                'requestId': request_id,
            })

        # セッションID検証
        uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)
        if not uuid_pattern.match(session_id):
            session_id = str(uuid.uuid4())

        logger.info(f"Chat request: session={session_id}, model={model_id}, message_len={len(message)} [Request ID: {request_id}]")

        # 会話履歴の取得（best-effort）
        history_manager = _get_history_manager()
        conversation_history = []
        if history_manager:
            try:
                raw_history = history_manager.get_history(session_id, limit=20)
                conversation_history = history_manager.to_agent_messages(raw_history)
            except Exception as e:
                logger.warning(f"Failed to load history: {e}")

        # ユーザーメッセージを保存（best-effort）
        if history_manager:
            try:
                history_manager.save_message(session_id, 'user', message, model_id=model_id)
            except Exception as e:
                logger.warning(f"Failed to save user message: {e}")

        # ルール解決（任意フィールド: ruleIds / inlineRules）
        rule_ids = body.get('ruleIds')           # None または list
        inline_rules = body.get('inlineRules') or []

        from rules_validator import RuleSizeError
        try:
            full_system_prompt = _resolve_chat_system_prompt(rule_ids, inline_rules)
        except RuleSizeError as e:
            return format_response(400, {
                'error': str(e),
                'requestId': request_id,
            })

        # Agent実行（メディア結果をリセット）
        import agent_tools
        agent_tools._last_media_result = None
        agent = create_agent(model_id, system_prompt=full_system_prompt)

        # 会話履歴がある場合はメッセージに追加
        if conversation_history:
            agent.messages = conversation_history

        result = agent(message)

        # レスポンスからテキストとメディアを抽出
        response_text = str(result)
        media_data = _extract_media_from_result(result, agent)

        # ツールハルシネーション検出: テキストにファイル名があるのにmediaがない場合リトライ
        if media_data is None and _looks_like_tool_output(response_text):
            logger.warning(f"Tool hallucination detected, retrying with explicit instruction [Request ID: {request_id}]")
            agent_tools._last_media_result = None
            retry_msg = f"前回のリクエストでツールを実行せずにテキストだけで回答しました。必ずツール関数を実際に呼び出してください。元のリクエスト: {message}"
            result = agent(retry_msg)
            response_text = str(result)
            media_data = _extract_media_from_result(result, agent)

        # アシスタントメッセージを保存（best-effort）
        if history_manager:
            try:
                history_manager.save_message(
                    session_id, 'assistant', response_text,
                    media_url=media_data.get('url') if media_data else None,
                    media_type=media_data.get('type') if media_data else None,
                    model_id=model_id,
                )
            except Exception as e:
                logger.warning(f"Failed to save assistant message: {e}")

        processing_time = time.time() - start_time
        logger.info(f"Chat completed in {processing_time:.2f}s [Request ID: {request_id}]")

        model_info = ALLOWED_MODELS.get(model_id, {})
        response_body = {
            'sessionId': session_id,
            'response': {
                'content': response_text,
                'media': media_data,
                'modelId': model_id,
                'modelName': model_info.get('name', model_id),
            },
            'requestId': request_id,
        }

        return format_response(200, response_body)

    except json.JSONDecodeError:
        return format_response(400, {
            'error': 'Invalid JSON in request body',
            'requestId': request_id,
        })
    except Exception as e:
        import traceback
        logger.error(f"Chat error: {type(e).__name__}: {e} [Request ID: {request_id}]")
        logger.error(f"Traceback: {traceback.format_exc()}")

        # AccessDeniedException: モデルアクセスが未有効化
        error_name = type(e).__name__
        error_msg_str = str(e)
        if 'AccessDenied' in error_name or 'AccessDenied' in error_msg_str:
            model_name = ALLOWED_MODELS.get(model_id, {}).get('name', model_id)
            return format_response(403, {
                'error': f'モデル「{model_name}」へのアクセスが許可されていません。Bedrockコンソールでモデルアクセスを有効化してください。',
                'requestId': request_id,
                'modelId': model_id,
            })

        return format_response(500, {
            'error': 'エージェントの処理中にエラーが発生しました。しばらくお待ちください。',
            'requestId': request_id,
        })


def handle_get_models(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/models - 利用可能モデル一覧取得"""
    models = []
    for model_id, info in ALLOWED_MODELS.items():
        models.append({
            'id': model_id,
            'name': info['name'],
            'provider': info['provider'],
            'description': info['description'],
        })

    return format_response(200, {
        'models': models,
        'default': DEFAULT_MODEL_ID,
    })


def handle_get_history(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/history/{sessionId} - 会話履歴取得"""
    session_id = event.get('pathParameters', {}).get('sessionId', '')

    if not session_id:
        return format_response(400, {'error': 'sessionId is required'})

    history_manager = _get_history_manager()
    if not history_manager:
        return format_response(500, {'error': 'History service unavailable'})

    try:
        messages = history_manager.get_history(session_id)
        formatted = []
        for msg in messages:
            item = {
                'role': msg.get('role', ''),
                'content': msg.get('content', ''),
                'timestamp': msg.get('timestamp', 0),
            }
            if msg.get('media_url'):
                item['mediaUrl'] = msg['media_url']
            if msg.get('media_type'):
                item['mediaType'] = msg['media_type']
            if msg.get('model_id'):
                item['modelId'] = msg['model_id']
                model_info = ALLOWED_MODELS.get(msg['model_id'], {})
                item['modelName'] = model_info.get('name', msg['model_id'])
            formatted.append(item)

        return format_response(200, {
            'sessionId': session_id,
            'messages': formatted,
        })
    except Exception as e:
        logger.error(f"Get history error: {e}")
        return format_response(500, {'error': str(e)})


def handle_delete_history(event: Dict[str, Any], context: Any) -> Dict:
    """DELETE /chat/history/{sessionId} - 会話履歴削除"""
    session_id = event.get('pathParameters', {}).get('sessionId', '')

    if not session_id:
        return format_response(400, {'error': 'sessionId is required'})

    history_manager = _get_history_manager()
    if not history_manager:
        return format_response(500, {'error': 'History service unavailable'})

    try:
        deleted_count = history_manager.delete_history(session_id)
        return format_response(200, {
            'message': '会話履歴を削除しました',
            'sessionId': session_id,
            'deletedCount': deleted_count,
        })
    except Exception as e:
        logger.error(f"Delete history error: {e}")
        return format_response(500, {'error': str(e)})


def _get_history_manager():
    """ChatHistoryManagerのインスタンスを取得"""
    table_name = os.environ.get('CHAT_HISTORY_TABLE', '')
    if not table_name:
        return None
    try:
        from chat_history import ChatHistoryManager
        return ChatHistoryManager(table_name)
    except Exception as e:
        logger.warning(f"Failed to initialize ChatHistoryManager: {e}")
        return None


def _enrich_image_list(images: list) -> list:
    """画像一覧にS3署名付きURLを付与する（フロントエンド表示用）"""
    try:
        upload_bucket = os.environ.get('S3_UPLOAD_BUCKET', os.environ.get('UPLOAD_BUCKET', ''))
        if not upload_bucket or boto3 is None:
            return images

        s3_client = boto3.client('s3')
        for img in images:
            if 'thumbnail_url' not in img and img.get('key'):
                try:
                    img['thumbnail_url'] = s3_client.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': upload_bucket, 'Key': img['key']},
                        ExpiresIn=3600,
                    )
                except Exception:
                    pass
    except Exception as e:
        logger.warning(f"Failed to enrich image list: {e}")
    return images


def _extract_media_from_result(result, agent) -> Optional[Dict]:
    """Agentの実行結果からメディアデータを抽出する"""
    try:
        # agent_tools._last_media_result から直接取得（コンテキスト超過対策）
        from agent_tools import _last_media_result
        if _last_media_result:
            media = _last_media_result.copy()
            # image_listの場合は署名付きURLを付与
            if media.get('type') == 'image_list' and media.get('images') is not None:
                media['images'] = _enrich_image_list(media['images'])
                media.setdefault('count', len(media['images']))
            return media
    except Exception as e:
        logger.warning(f"Failed to extract media from _last_media_result: {e}")

    return None


# === ルール CRUD ハンドラ ===

# 注: rules_validator / rules_repository は handler 関数内で遅延 import している。
# Lambda コールドスタート時の不要なロードを避けつつ、テスト環境で部分的にモジュールが
# 不在でも他のハンドラが動作可能にするため。
def _get_rules_repository():
    """RulesRepository を取得。RULES_TABLE 未設定時は None。"""
    from rules_repository import RulesRepository
    table_name = os.environ.get('RULES_TABLE')
    if not table_name:
        return None
    return RulesRepository(table_name)


def _get_rule_limits():
    """環境変数から RuleLimits（サイズ・件数ガード設定）を取得する。"""
    from rules_validator import RuleLimits
    return RuleLimits.from_env(os.environ)


def _resolve_chat_system_prompt(
    rule_ids,
    inline_rules,
) -> str:
    """POST /chat 用にAgentのsystem_promptを解決する。

    rule_ids: None または list[str]
      - None: アクティブルール全件を適用
      - list: 指定IDのみ適用（アクティブ無視）
    inline_rules: list[dict] (永続化しない一時ルール、name/prompt)

    inlineRulesの単体サイズ違反は RuleSizeError を投げる（呼び出し側が400に変換）。
    """
    from agent_prompts import build_full_prompt
    from rules_validator import validate_single_prompt

    limits = _get_rule_limits()
    repo = _get_rules_repository()

    # inlineRulesの単体サイズ検証（呼び出し元で400に変換すべき例外）
    for r in inline_rules:
        validate_single_prompt(r.get('prompt', ''), limits)

    if repo is None:
        return build_full_prompt([], inline_rules, limits)

    try:
        if rule_ids is not None:
            persisted = repo.batch_get(rule_ids) if rule_ids else []
        else:
            persisted = repo.list_active()
    except Exception as e:
        logger.warning(f"Failed to load rules, falling back to no rules: {e}")
        persisted = []

    return build_full_prompt(persisted, inline_rules, limits)


def handle_rules_list(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/rules"""
    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})
    rules = repo.list()
    return format_response(200, {'rules': rules})


def handle_rules_create(event: Dict[str, Any], context: Any) -> Dict:
    """POST /chat/rules"""
    from rules_validator import validate_single_prompt, RuleSizeError
    try:
        body = json.loads(event.get('body', '{}') or '{}')
    except json.JSONDecodeError:
        return format_response(400, {'error': 'Invalid JSON'})

    name = (body.get('name') or '').strip()
    prompt = body.get('prompt') or ''
    is_active = bool(body.get('isActive', False))

    if not name or len(name) > 100:
        return format_response(400, {'error': 'name is required (1-100 chars)'})

    limits = _get_rule_limits()
    try:
        validate_single_prompt(prompt, limits)
    except RuleSizeError as e:
        return format_response(400, {'error': str(e)})

    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})
    rule = repo.create(name=name, prompt=prompt, is_active=is_active)
    return format_response(201, {'rule': rule})


def handle_rules_get(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/rules/{ruleId}"""
    rule_id = event.get('pathParameters', {}).get('ruleId', '')
    if rule_id == 'preview':
        return format_response(400, {'error': 'ruleId "preview" is reserved'})
    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})
    rule = repo.get(rule_id)
    if rule is None:
        return format_response(404, {'error': 'Rule not found'})
    return format_response(200, {'rule': rule})


def handle_rules_update(event: Dict[str, Any], context: Any) -> Dict:
    """PUT /chat/rules/{ruleId}"""
    from rules_validator import validate_single_prompt, RuleSizeError
    from rules_repository import RuleNotFound

    rule_id = event.get('pathParameters', {}).get('ruleId', '')
    if rule_id == 'preview':
        return format_response(400, {'error': 'ruleId "preview" is reserved'})

    try:
        body = json.loads(event.get('body', '{}') or '{}')
    except json.JSONDecodeError:
        return format_response(400, {'error': 'Invalid JSON'})

    fields = {}
    if 'name' in body:
        n = (body.get('name') or '').strip()
        if not n or len(n) > 100:
            return format_response(400, {'error': 'name must be 1-100 chars'})
        fields['name'] = n
    if 'prompt' in body:
        prompt = body.get('prompt') or ''
        try:
            validate_single_prompt(prompt, _get_rule_limits())
        except RuleSizeError as e:
            return format_response(400, {'error': str(e)})
        fields['prompt'] = prompt
    if 'isActive' in body:
        fields['isActive'] = bool(body['isActive'])

    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})

    try:
        rule = repo.update(rule_id, **fields)
    except RuleNotFound:
        return format_response(404, {'error': 'Rule not found'})
    return format_response(200, {'rule': rule})


def handle_rules_delete(event: Dict[str, Any], context: Any) -> Dict:
    """DELETE /chat/rules/{ruleId}"""
    from rules_repository import RuleNotFound, DefaultRuleProtected

    rule_id = event.get('pathParameters', {}).get('ruleId', '')
    if rule_id == 'preview':
        return format_response(400, {'error': 'ruleId "preview" is reserved'})

    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})

    try:
        repo.delete(rule_id)
    except RuleNotFound:
        return format_response(404, {'error': 'Rule not found'})
    except DefaultRuleProtected:
        return format_response(403, {'error': 'Default rule cannot be deleted'})
    return format_response(204, {})


def handle_rules_preview(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/rules/preview - 結合済み system prompt のプレビュー"""
    from agent_prompts import build_full_prompt

    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})

    qs = event.get('queryStringParameters') or {}
    rule_ids_param = qs.get('ruleIds') or ''
    rule_ids = [r.strip() for r in rule_ids_param.split(',') if r.strip()]

    if rule_ids:
        rules = repo.batch_get(rule_ids)
    else:
        rules = repo.list_active()

    limits = _get_rule_limits()
    full_prompt = build_full_prompt(rules, [], limits)

    applied = [
        {'ruleId': r['ruleId'], 'name': r['name'], 'chars': len(r.get('prompt', ''))}
        for r in rules
    ]
    return format_response(200, {
        'fullPrompt': full_prompt,
        'appliedRules': applied,
        'totalChars': len(full_prompt),
        'ruleCount': len(rules),
        'limits': {
            'maxPromptChars': limits.max_prompt_chars,
            'maxCount': limits.max_count,
            'maxCombinedChars': limits.max_combined_chars,
        },
    })


def handler(event: Dict[str, Any], context: Any) -> Dict:
    """メインハンドラー関数"""
    try:
        http_method = event.get('httpMethod', '').upper()
        resource = event.get('resource', '')
        path = event.get('path', '')

        logger.info(f"Agent handler: {http_method} {resource} ({path})")

        # === ルール系ルーティング（resource ベース、静的パス優先） ===
        if resource == '/chat/rules':
            if http_method == 'GET': return handle_rules_list(event, context)
            if http_method == 'POST': return handle_rules_create(event, context)
        if resource == '/chat/rules/preview' and http_method == 'GET':
            return handle_rules_preview(event, context)
        if resource == '/chat/rules/{ruleId}':
            if http_method == 'GET': return handle_rules_get(event, context)
            if http_method == 'PUT': return handle_rules_update(event, context)
            if http_method == 'DELETE': return handle_rules_delete(event, context)

        # === 既存のチャット系ルーティング（pathベース、後方互換） ===
        if http_method == 'POST' and '/chat' in path and '/history' not in path and '/models' not in path and '/rules' not in path:
            return handle_chat(event, context)
        elif http_method == 'GET' and '/models' in path:
            return handle_get_models(event, context)
        elif http_method == 'GET' and '/history/' in path:
            return handle_get_history(event, context)
        elif http_method == 'DELETE' and '/history/' in path:
            return handle_delete_history(event, context)
        elif http_method == 'OPTIONS':
            return format_response(200, {})

        return format_response(404, {'error': 'Not found'})

    except Exception as e:
        logger.error(f"Handler error: {e}")
        return format_response(500, {'error': str(e)})
