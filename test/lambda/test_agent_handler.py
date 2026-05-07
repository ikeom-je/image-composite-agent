"""
Agent Handler のユニットテスト

テスト対象:
- POST /chat ルーティング
- GET /chat/history ルーティング
- DELETE /chat/history ルーティング
- format_response ヘルパー
- バリデーション（メッセージ長、セッションID）
"""

import unittest
import json
import os
import sys
from unittest.mock import patch, MagicMock, Mock

# Lambda関数のパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from agent_handler import format_response, handler, handle_get_history, handle_delete_history


class TestFormatResponse(unittest.TestCase):
    """レスポンスフォーマットのテスト"""

    def test_json_response(self):
        """JSONレスポンスが正しく生成されること"""
        result = format_response(200, {'key': 'value'})
        self.assertEqual(result['statusCode'], 200)
        self.assertEqual(result['headers']['Content-Type'], 'application/json')
        body = json.loads(result['body'])
        self.assertEqual(body['key'], 'value')

    def test_cors_headers(self):
        """CORSヘッダーが含まれること"""
        result = format_response(200, {})
        self.assertIn('Access-Control-Allow-Origin', result['headers'])
        self.assertEqual(result['headers']['Access-Control-Allow-Origin'], '*')

    def test_error_response(self):
        """エラーレスポンスが正しく生成されること"""
        result = format_response(400, {'error': 'Bad request'})
        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertEqual(body['error'], 'Bad request')


class TestHandlerRouting(unittest.TestCase):
    """ハンドラーのルーティングテスト"""

    def test_options_method(self):
        """OPTIONSリクエストに200を返すこと"""
        event = {'httpMethod': 'OPTIONS', 'resource': '/chat', 'path': '/chat'}
        result = handler(event, None)
        self.assertEqual(result['statusCode'], 200)

    def test_not_found(self):
        """未知のパスに404を返すこと"""
        event = {'httpMethod': 'GET', 'resource': '/unknown', 'path': '/unknown'}
        result = handler(event, None)
        self.assertEqual(result['statusCode'], 404)

    @patch('agent_handler.handle_chat')
    def test_post_chat_routing(self, mock_handle_chat):
        """POST /chat が handle_chat にルーティングされること"""
        mock_handle_chat.return_value = format_response(200, {'test': True})
        event = {'httpMethod': 'POST', 'resource': '/chat', 'path': '/chat'}
        handler(event, None)
        mock_handle_chat.assert_called_once()

    @patch('agent_handler.handle_get_history')
    def test_get_history_routing(self, mock_get_history):
        """GET /chat/history/{id} がルーティングされること"""
        mock_get_history.return_value = format_response(200, {'test': True})
        event = {
            'httpMethod': 'GET',
            'resource': '/chat/history/{sessionId}',
            'path': '/chat/history/test-session',
            'pathParameters': {'sessionId': 'test-session'},
        }
        handler(event, None)
        mock_get_history.assert_called_once()

    @patch('agent_handler.handle_delete_history')
    def test_delete_history_routing(self, mock_delete_history):
        """DELETE /chat/history/{id} がルーティングされること"""
        mock_delete_history.return_value = format_response(200, {'test': True})
        event = {
            'httpMethod': 'DELETE',
            'resource': '/chat/history/{sessionId}',
            'path': '/chat/history/test-session',
            'pathParameters': {'sessionId': 'test-session'},
        }
        handler(event, None)
        mock_delete_history.assert_called_once()


class TestHandleChatValidation(unittest.TestCase):
    """チャットハンドラーのバリデーションテスト"""

    @patch('agent_handler._get_history_manager')
    @patch('agent_handler.create_agent')
    def test_empty_message(self, mock_agent, mock_history):
        """空メッセージで400を返すこと"""
        from agent_handler import handle_chat
        event = {'body': json.dumps({'message': '', 'sessionId': 'test'})}
        result = handle_chat(event, None)
        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertIn('message is required', body['error'])

    @patch('agent_handler._get_history_manager')
    @patch('agent_handler.create_agent')
    def test_long_message(self, mock_agent, mock_history):
        """2000文字超のメッセージで400を返すこと"""
        from agent_handler import handle_chat
        long_msg = 'a' * 2001
        event = {'body': json.dumps({'message': long_msg, 'sessionId': 'test'})}
        result = handle_chat(event, None)
        self.assertEqual(result['statusCode'], 400)
        body = json.loads(result['body'])
        self.assertIn('2000', body['error'])

    def test_invalid_json_body(self):
        """不正なJSONで400を返すこと"""
        from agent_handler import handle_chat
        event = {'body': 'not json'}
        result = handle_chat(event, None)
        self.assertEqual(result['statusCode'], 400)


class TestHandleGetHistory(unittest.TestCase):
    """履歴取得のテスト"""

    def test_missing_session_id(self):
        """セッションIDなしで400を返すこと"""
        event = {'pathParameters': {}}
        result = handle_get_history(event, None)
        self.assertEqual(result['statusCode'], 400)

    @patch('agent_handler._get_history_manager')
    def test_successful_get(self, mock_get_manager):
        """正常に履歴を取得できること"""
        mock_manager = MagicMock()
        mock_manager.get_history.return_value = [
            {'role': 'user', 'content': 'test', 'timestamp': 1000},
        ]
        mock_get_manager.return_value = mock_manager

        event = {'pathParameters': {'sessionId': 'test-session'}}
        result = handle_get_history(event, None)
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertEqual(body['sessionId'], 'test-session')
        self.assertEqual(len(body['messages']), 1)


class TestHandleDeleteHistory(unittest.TestCase):
    """履歴削除のテスト"""

    def test_missing_session_id(self):
        """セッションIDなしで400を返すこと"""
        event = {'pathParameters': {}}
        result = handle_delete_history(event, None)
        self.assertEqual(result['statusCode'], 400)

    @patch('agent_handler._get_history_manager')
    def test_successful_delete(self, mock_get_manager):
        """正常に履歴を削除できること"""
        mock_manager = MagicMock()
        mock_manager.delete_history.return_value = 5
        mock_get_manager.return_value = mock_manager

        event = {'pathParameters': {'sessionId': 'test-session'}}
        result = handle_delete_history(event, None)
        self.assertEqual(result['statusCode'], 200)
        body = json.loads(result['body'])
        self.assertEqual(body['deletedCount'], 5)


if __name__ == '__main__':
    unittest.main()


# === Task 5/6: Rules CRUD handler tests ===

import json as _json_for_rules

try:
    import boto3 as _boto3_for_rules
    from moto import mock_aws
    _MOTO_AVAILABLE = True
except ImportError:
    _MOTO_AVAILABLE = False


@unittest.skipIf(not _MOTO_AVAILABLE, "moto/boto3 not installed")
@mock_aws
class TestRulesHandler(unittest.TestCase):
    """ルールCRUDハンドラのテスト（moto使用）"""

    TABLE_NAME = 'TestRulesTable'

    def setUp(self):
        os.environ['RULES_TABLE'] = self.TABLE_NAME
        self.dynamodb = _boto3_for_rules.resource('dynamodb', region_name='us-east-1')
        self.dynamodb.create_table(
            TableName=self.TABLE_NAME,
            KeySchema=[{'AttributeName': 'ruleId', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'ruleId', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST',
        )

    def tearDown(self):
        os.environ.pop('RULES_TABLE', None)

    def _event(self, method, resource, body=None, path_params=None):
        return {
            'httpMethod': method,
            'resource': resource,
            'path': resource.replace('{ruleId}', path_params.get('ruleId', 'X')) if path_params else resource,
            'pathParameters': path_params or {},
            'queryStringParameters': None,
            'body': _json_for_rules.dumps(body) if body else None,
        }

    def test_list_empty(self):
        """ルールなし時に空配列を返す"""
        from agent_handler import handler
        resp = handler(self._event('GET', '/chat/rules'), None)
        self.assertEqual(resp['statusCode'], 200)
        body = _json_for_rules.loads(resp['body'])
        self.assertEqual(body['rules'], [])

    def test_create_returns_201(self):
        """POST /chat/rules で 201 と作成済みルールを返す"""
        from agent_handler import handler
        resp = handler(
            self._event('POST', '/chat/rules', body={'name': 'test', 'prompt': 'hello'}),
            None
        )
        self.assertEqual(resp['statusCode'], 201)
        body = _json_for_rules.loads(resp['body'])
        self.assertEqual(body['rule']['name'], 'test')
        self.assertFalse(body['rule']['isActive'])
        self.assertFalse(body['rule']['isDefault'])

    def test_create_oversize_prompt_returns_400(self):
        """promptが上限超過なら 400"""
        from agent_handler import handler
        os.environ['RULES_MAX_PROMPT_CHARS'] = '50'
        try:
            resp = handler(
                self._event('POST', '/chat/rules', body={'name': 'x', 'prompt': 'a' * 100}),
                None
            )
            self.assertEqual(resp['statusCode'], 400)
        finally:
            del os.environ['RULES_MAX_PROMPT_CHARS']

    def test_create_missing_name_returns_400(self):
        """nameなしリクエストは 400"""
        from agent_handler import handler
        resp = handler(
            self._event('POST', '/chat/rules', body={'prompt': 'p'}),
            None
        )
        self.assertEqual(resp['statusCode'], 400)

    def test_get_missing_returns_404(self):
        """存在しないIDは 404"""
        from agent_handler import handler
        resp = handler(
            self._event('GET', '/chat/rules/{ruleId}', path_params={'ruleId': 'nope'}),
            None
        )
        self.assertEqual(resp['statusCode'], 404)

    def test_get_existing_returns_200(self):
        """存在するルールを取得できる"""
        from agent_handler import handler
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME, region_name='us-east-1')
        created = repo.create(name='r', prompt='p', is_active=True)

        resp = handler(
            self._event('GET', '/chat/rules/{ruleId}', path_params={'ruleId': created['ruleId']}),
            None
        )
        self.assertEqual(resp['statusCode'], 200)
        body = _json_for_rules.loads(resp['body'])
        self.assertEqual(body['rule']['ruleId'], created['ruleId'])

    def test_update_partial(self):
        """部分更新ができる"""
        from agent_handler import handler
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME, region_name='us-east-1')
        created = repo.create(name='r', prompt='p', is_active=False)

        resp = handler(
            self._event('PUT', '/chat/rules/{ruleId}',
                       body={'isActive': True},
                       path_params={'ruleId': created['ruleId']}),
            None
        )
        self.assertEqual(resp['statusCode'], 200)
        body = _json_for_rules.loads(resp['body'])
        self.assertTrue(body['rule']['isActive'])

    def test_delete_returns_204(self):
        """通常ルールの削除は 204"""
        from agent_handler import handler
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME, region_name='us-east-1')
        created = repo.create(name='r', prompt='p', is_active=False)

        resp = handler(
            self._event('DELETE', '/chat/rules/{ruleId}', path_params={'ruleId': created['ruleId']}),
            None
        )
        self.assertEqual(resp['statusCode'], 204)

    def test_delete_default_returns_403(self):
        """デフォルトルールの削除は 403"""
        from agent_handler import handler
        self.dynamodb.Table(self.TABLE_NAME).put_item(Item={
            'ruleId': 'jaa-subtitle-handbook-v1',
            'name': 'JAA',
            'prompt': 'p',
            'isDefault': True,
            'isActive': True,
            'createdAt': '2026-05-04T00:00:00Z',
            'updatedAt': '2026-05-04T00:00:00Z',
        })
        resp = handler(
            self._event('DELETE', '/chat/rules/{ruleId}',
                       path_params={'ruleId': 'jaa-subtitle-handbook-v1'}),
            None
        )
        self.assertEqual(resp['statusCode'], 403)

    def test_ruleid_preview_rejected(self):
        """{ruleId}=preview は400で防御（パス優先順位の保険）"""
        from agent_handler import handler
        resp = handler(
            self._event('GET', '/chat/rules/{ruleId}', path_params={'ruleId': 'preview'}),
            None
        )
        self.assertEqual(resp['statusCode'], 400)

    def test_ruleid_preview_rejected_put(self):
        """{ruleId}=preview に対する PUT も400で防御"""
        from agent_handler import handler
        resp = handler(
            self._event('PUT', '/chat/rules/{ruleId}',
                       body={'name': 'x'},
                       path_params={'ruleId': 'preview'}),
            None
        )
        self.assertEqual(resp['statusCode'], 400)

    def test_ruleid_preview_rejected_delete(self):
        """{ruleId}=preview に対する DELETE も400で防御"""
        from agent_handler import handler
        resp = handler(
            self._event('DELETE', '/chat/rules/{ruleId}',
                       path_params={'ruleId': 'preview'}),
            None
        )
        self.assertEqual(resp['statusCode'], 400)

    def test_preview_no_rules(self):
        """ルールなしでもbase prompt + メタ情報を返す"""
        from agent_handler import handler
        resp = handler(self._event('GET', '/chat/rules/preview'), None)
        self.assertEqual(resp['statusCode'], 200)
        body = _json_for_rules.loads(resp['body'])
        self.assertIn('fullPrompt', body)
        self.assertEqual(body['ruleCount'], 0)
        self.assertEqual(body['appliedRules'], [])
        self.assertIn('limits', body)

    def test_preview_with_active_rules(self):
        """アクティブルールのみが反映される"""
        from agent_handler import handler
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME, region_name='us-east-1')
        repo.create(name='active1', prompt='本文1', is_active=True)
        repo.create(name='inactive', prompt='本文2', is_active=False)

        resp = handler(self._event('GET', '/chat/rules/preview'), None)
        self.assertEqual(resp['statusCode'], 200)
        body = _json_for_rules.loads(resp['body'])
        self.assertEqual(body['ruleCount'], 1)
        self.assertIn('### active1', body['fullPrompt'])
        self.assertNotIn('### inactive', body['fullPrompt'])

    def test_preview_with_ruleids_query(self):
        """ruleIds クエリで指定ルールのみ反映"""
        from agent_handler import handler
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME, region_name='us-east-1')
        a = repo.create(name='only-a', prompt='p1', is_active=False)
        b = repo.create(name='only-b', prompt='p2', is_active=True)

        event = self._event('GET', '/chat/rules/preview')
        event['queryStringParameters'] = {'ruleIds': a['ruleId']}
        resp = handler(event, None)
        self.assertEqual(resp['statusCode'], 200)
        body = _json_for_rules.loads(resp['body'])
        self.assertEqual(body['ruleCount'], 1)
        self.assertIn('### only-a', body['fullPrompt'])
        self.assertNotIn('### only-b', body['fullPrompt'])

    def test_chat_resolve_prompt_with_rule_ids(self):
        """_resolve_chat_system_prompt: ruleIds 指定でルール本文が含まれる"""
        from agent_handler import _resolve_chat_system_prompt
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME, region_name='us-east-1')
        rule = repo.create(name='テストルール', prompt='テスト本文', is_active=False)

        full_prompt = _resolve_chat_system_prompt(
            rule_ids=[rule['ruleId']],
            inline_rules=[],
        )
        self.assertIn('テストルール', full_prompt)
        self.assertIn('テスト本文', full_prompt)

    def test_chat_resolve_prompt_with_inline_rules(self):
        """_resolve_chat_system_prompt: inline rules が含まれる"""
        from agent_handler import _resolve_chat_system_prompt
        full_prompt = _resolve_chat_system_prompt(
            rule_ids=None,
            inline_rules=[{'name': 'ドラフト', 'prompt': 'ドラフト本文'}],
        )
        self.assertIn('### ドラフト', full_prompt)
        self.assertIn('ドラフト本文', full_prompt)

    def test_chat_resolve_prompt_combines_persisted_and_inline(self):
        """_resolve_chat_system_prompt: 永続+inline 両方が含まれる"""
        from agent_handler import _resolve_chat_system_prompt
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME, region_name='us-east-1')
        rule = repo.create(name='永続', prompt='永続本文', is_active=False)

        full_prompt = _resolve_chat_system_prompt(
            rule_ids=[rule['ruleId']],
            inline_rules=[{'name': 'ドラフト', 'prompt': 'ドラフト本文'}],
        )
        self.assertIn('### 永続', full_prompt)
        self.assertIn('### ドラフト', full_prompt)

    def test_chat_resolve_prompt_no_rules_returns_base(self):
        """_resolve_chat_system_prompt: 何も指定なし & アクティブ無し は base SYSTEM_PROMPT のみ"""
        from agent_handler import _resolve_chat_system_prompt
        from agent_prompts import SYSTEM_PROMPT
        full_prompt = _resolve_chat_system_prompt(rule_ids=None, inline_rules=[])
        self.assertEqual(full_prompt, SYSTEM_PROMPT)

    def test_chat_oversize_inline_rule_rejected(self):
        """POST /chat: inlineRules の本文サイズ超過は 400"""
        from agent_handler import handler
        os.environ['RULES_MAX_PROMPT_CHARS'] = '20'
        try:
            body = {
                'sessionId': '12345678-1234-1234-1234-123456789012',
                'message': 'test',
                'inlineRules': [{'name': 'd', 'prompt': 'a' * 100}],
            }
            resp = handler(self._event('POST', '/chat', body=body), None)
            self.assertEqual(resp['statusCode'], 400)
        finally:
            del os.environ['RULES_MAX_PROMPT_CHARS']
