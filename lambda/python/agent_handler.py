"""
Strands Agent Lambda ハンドラー

POST /chat                      - エージェントにメッセージ送信
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

VERSION = os.environ.get('VERSION', '2.9.0')

# APIキーキャッシュ（コールドスタート間で再利用）



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



def create_agent():
    """Strands Agentを初期化する（AWS Bedrock経由）"""
    from strands import Agent
    from strands.models.bedrock import BedrockModel
    from agent_tools import compose_images, generate_video, list_uploaded_images, delete_uploaded_image, get_help
    from agent_prompts import SYSTEM_PROMPT

    agent_model_id = os.environ.get('AGENT_MODEL_ID', 'us.anthropic.claude-sonnet-4-5-20250929-v1:0')
    model = BedrockModel(
        model_id=agent_model_id,
        max_tokens=4096,
        region_name="us-east-1",
    )

    agent = Agent(
        model=model,
        system_prompt=SYSTEM_PROMPT,
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

        logger.info(f"Chat request: session={session_id}, message_len={len(message)} [Request ID: {request_id}]")

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
                history_manager.save_message(session_id, 'user', message)
            except Exception as e:
                logger.warning(f"Failed to save user message: {e}")

        # Agent実行
        agent = create_agent()

        # 会話履歴がある場合はメッセージに追加
        if conversation_history:
            agent.messages = conversation_history

        result = agent(message)

        # レスポンスからテキストとメディアを抽出
        response_text = str(result)
        media_data = _extract_media_from_result(result, agent)

        # アシスタントメッセージを保存（best-effort）
        if history_manager:
            try:
                history_manager.save_message(
                    session_id, 'assistant', response_text,
                    media_url=media_data.get('url') if media_data else None,
                    media_type=media_data.get('type') if media_data else None,
                )
            except Exception as e:
                logger.warning(f"Failed to save assistant message: {e}")

        processing_time = time.time() - start_time
        logger.info(f"Chat completed in {processing_time:.2f}s [Request ID: {request_id}]")

        response_body = {
            'sessionId': session_id,
            'response': {
                'content': response_text,
                'media': media_data,
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
        return format_response(500, {
            'error': 'エージェントの処理中にエラーが発生しました。しばらくお待ちください。',
            'requestId': request_id,
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


def _extract_media_from_result(result, agent) -> Optional[Dict]:
    """Agentの実行結果からメディアデータを抽出する"""
    # Agentのメッセージ履歴からツール結果を検索
    try:
        if hasattr(agent, 'messages') and agent.messages:
            for msg in reversed(agent.messages):
                if msg.get('role') == 'user' and isinstance(msg.get('content'), list):
                    for block in msg['content']:
                        if isinstance(block, dict) and block.get('toolResult'):
                            tool_result = block['toolResult']
                            content = tool_result.get('content', [])
                            for item in content:
                                if isinstance(item, dict) and 'text' in item:
                                    try:
                                        data = json.loads(item['text'])
                                        if isinstance(data, dict):
                                            # 画像結果
                                            if data.get('image_base64'):
                                                return {
                                                    'type': 'image',
                                                    'data': data['image_base64'],
                                                    'url': None,
                                                }
                                            # 動画結果
                                            if data.get('video_url'):
                                                return {
                                                    'type': 'video',
                                                    'data': None,
                                                    'url': data['video_url'],
                                                }
                                    except (json.JSONDecodeError, TypeError):
                                        continue
    except Exception as e:
        logger.warning(f"Failed to extract media: {e}")

    return None


def handler(event: Dict[str, Any], context: Any) -> Dict:
    """メインハンドラー関数"""
    try:
        http_method = event.get('httpMethod', '').upper()
        resource = event.get('resource', '')
        path = event.get('path', '')

        logger.info(f"Agent handler: {http_method} {resource} ({path})")

        if http_method == 'POST' and '/chat' in path and '/history' not in path:
            return handle_chat(event, context)
        elif http_method == 'GET' and '/history/' in path:
            return handle_get_history(event, context)
        elif http_method == 'DELETE' and '/history/' in path:
            return handle_delete_history(event, context)
        elif http_method == 'OPTIONS':
            return format_response(200, {})
        else:
            return format_response(404, {'error': 'Not found'})

    except Exception as e:
        logger.error(f"Handler error: {e}")
        return format_response(500, {'error': str(e)})
