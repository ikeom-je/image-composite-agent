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
