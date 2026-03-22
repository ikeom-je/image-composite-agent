"""
ChatHistoryManager のユニットテスト

テスト対象:
- メッセージ保存
- 履歴取得
- 履歴削除
- Agent形式変換
- TTL計算
"""

import unittest
import os
import sys
import time
from unittest.mock import Mock, patch, MagicMock
from decimal import Decimal

# Lambda関数のパスを追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from chat_history import ChatHistoryManager, TTL_DAYS


class TestChatHistoryManager(unittest.TestCase):

    def setUp(self):
        """テストセットアップ"""
        self.table_name = 'test-chat-history'

        # DynamoDB Tableのモック
        self.mock_table = MagicMock()
        self.mock_dynamodb = MagicMock()
        self.mock_dynamodb.Table.return_value = self.mock_table

        with patch('chat_history.boto3') as mock_boto3:
            mock_boto3.resource.return_value = self.mock_dynamodb
            self.manager = ChatHistoryManager(self.table_name)

    def test_save_message_user(self):
        """ユーザーメッセージを保存できること"""
        self.mock_table.put_item.return_value = {}

        result = self.manager.save_message('session-1', 'user', 'テスト画像を合成して')

        self.assertEqual(result['sessionId'], 'session-1')
        self.assertEqual(result['role'], 'user')
        self.assertEqual(result['content'], 'テスト画像を合成して')
        self.assertIn('timestamp', result)
        self.assertIn('ttl', result)
        self.mock_table.put_item.assert_called_once()

    def test_save_message_with_media(self):
        """メディア付きメッセージを保存できること"""
        self.mock_table.put_item.return_value = {}

        result = self.manager.save_message(
            'session-1', 'assistant', '合成しました',
            media_url='https://example.com/image.png',
            media_type='image',
        )

        self.assertEqual(result['media_url'], 'https://example.com/image.png')
        self.assertEqual(result['media_type'], 'image')

    def test_save_message_ttl(self):
        """TTLが7日後に設定されること"""
        self.mock_table.put_item.return_value = {}

        before = int(time.time())
        result = self.manager.save_message('session-1', 'user', 'test')
        after = int(time.time())

        expected_min = before + (TTL_DAYS * 24 * 60 * 60)
        expected_max = after + (TTL_DAYS * 24 * 60 * 60)
        self.assertGreaterEqual(result['ttl'], expected_min)
        self.assertLessEqual(result['ttl'], expected_max)

    def test_get_history(self):
        """会話履歴を取得できること"""
        self.mock_table.query.return_value = {
            'Items': [
                {'sessionId': 's1', 'timestamp': 1000, 'role': 'user', 'content': 'hello'},
                {'sessionId': 's1', 'timestamp': 2000, 'role': 'assistant', 'content': 'hi'},
            ]
        }

        result = self.manager.get_history('s1')
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['role'], 'user')
        self.assertEqual(result[1]['role'], 'assistant')

    def test_get_history_empty(self):
        """空の履歴を取得できること"""
        self.mock_table.query.return_value = {'Items': []}

        result = self.manager.get_history('nonexistent')
        self.assertEqual(len(result), 0)

    def test_delete_history(self):
        """会話履歴を削除できること"""
        self.mock_table.query.return_value = {
            'Items': [
                {'sessionId': 's1', 'timestamp': 1000},
                {'sessionId': 's1', 'timestamp': 2000},
            ]
        }

        mock_batch_writer = MagicMock()
        self.mock_table.batch_writer.return_value.__enter__ = Mock(return_value=mock_batch_writer)
        self.mock_table.batch_writer.return_value.__exit__ = Mock(return_value=False)

        result = self.manager.delete_history('s1')
        self.assertEqual(result, 2)
        self.assertEqual(mock_batch_writer.delete_item.call_count, 2)

    def test_delete_history_empty(self):
        """空の履歴削除で0が返ること"""
        self.mock_table.query.return_value = {'Items': []}

        result = self.manager.delete_history('nonexistent')
        self.assertEqual(result, 0)

    def test_to_agent_messages(self):
        """DynamoDB履歴をAgent形式に変換できること"""
        history = [
            {'role': 'user', 'content': 'テスト'},
            {'role': 'assistant', 'content': '了解です'},
        ]

        result = self.manager.to_agent_messages(history)
        self.assertEqual(len(result), 2)
        self.assertEqual(result[0]['role'], 'user')
        self.assertEqual(result[0]['content'], [{'text': 'テスト'}])
        self.assertEqual(result[1]['role'], 'assistant')
        self.assertEqual(result[1]['content'], [{'text': '了解です'}])

    def test_to_agent_messages_filters_non_user_assistant(self):
        """user/assistant以外のロールがフィルタされること"""
        history = [
            {'role': 'user', 'content': 'test'},
            {'role': 'system', 'content': 'system msg'},
            {'role': 'assistant', 'content': 'reply'},
        ]

        result = self.manager.to_agent_messages(history)
        self.assertEqual(len(result), 2)


if __name__ == '__main__':
    unittest.main()
