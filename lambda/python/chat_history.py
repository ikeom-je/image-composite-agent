"""
DynamoDB 会話履歴管理 - Strands Agent チャットエージェント

テーブル設計:
  PK: sessionId (String)
  SK: timestamp (Number) - Unix timestamp (ms)
  Attributes:
    - role: "user" | "assistant"
    - content: メッセージ内容
    - media_url: 画像/動画URL (optional)
    - media_type: "image" | "video" (optional)
    - ttl: TTLタイムスタンプ (Number) - 7日後
"""

import time
import logging
import json
from typing import Dict, Any, List, Optional

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

TTL_DAYS = 7


class ChatHistoryManager:
    """DynamoDB会話履歴管理クラス"""

    def __init__(self, table_name: str):
        if boto3 is None:
            raise RuntimeError("boto3 is not available")
        self.table_name = table_name
        self.dynamodb = boto3.resource('dynamodb')
        self.table = self.dynamodb.Table(table_name)

    def save_message(
        self,
        session_id: str,
        role: str,
        content: str,
        media_url: Optional[str] = None,
        media_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """メッセージを保存する"""
        timestamp_ms = int(time.time() * 1000)
        ttl_value = int(time.time()) + (TTL_DAYS * 24 * 60 * 60)

        item = {
            'sessionId': session_id,
            'timestamp': timestamp_ms,
            'role': role,
            'content': content,
            'ttl': ttl_value,
        }

        if media_url:
            item['media_url'] = media_url
        if media_type:
            item['media_type'] = media_type

        try:
            self.table.put_item(Item=item)
            logger.info(f"Saved message: session={session_id}, role={role}")
            return item
        except Exception as e:
            logger.error(f"Failed to save message: {e}")
            raise

    def get_history(self, session_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        """会話履歴を取得する（古い順）"""
        try:
            response = self.table.query(
                KeyConditionExpression='sessionId = :sid',
                ExpressionAttributeValues={':sid': session_id},
                ScanIndexForward=True,
                Limit=limit,
            )
            messages = response.get('Items', [])
            logger.info(f"Retrieved {len(messages)} messages for session={session_id}")
            return messages
        except Exception as e:
            logger.error(f"Failed to get history: {e}")
            raise

    def delete_history(self, session_id: str) -> int:
        """会話履歴を削除する"""
        try:
            response = self.table.query(
                KeyConditionExpression='sessionId = :sid',
                ExpressionAttributeValues={':sid': session_id},
                ProjectionExpression='sessionId, #ts',
                ExpressionAttributeNames={'#ts': 'timestamp'},
            )
            items = response.get('Items', [])

            if not items:
                return 0

            with self.table.batch_writer() as batch:
                for item in items:
                    batch.delete_item(
                        Key={
                            'sessionId': item['sessionId'],
                            'timestamp': item['timestamp'],
                        }
                    )

            logger.info(f"Deleted {len(items)} messages for session={session_id}")
            return len(items)
        except Exception as e:
            logger.error(f"Failed to delete history: {e}")
            raise

    def to_agent_messages(self, history: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """DynamoDB履歴をStrands Agentのメッセージ形式に変換する

        Strands Agentは {"role": "user"/"assistant", "content": [...]} 形式を期待する
        """
        messages = []
        for item in history:
            role = item.get('role', 'user')
            content = item.get('content', '')

            if role in ('user', 'assistant'):
                messages.append({
                    'role': role,
                    'content': [{'text': content}],
                })

        return messages
