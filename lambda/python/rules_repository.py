"""DynamoDB RulesTable CRUD ラッパ。"""

import logging
import os
import time
import uuid
from typing import Dict, List, Optional

try:
    import boto3
except ImportError:
    boto3 = None

def _get_default_region() -> str:
    """Lambda では AWS_REGION が設定される。ローカル/テストでは AWS_DEFAULT_REGION を使用。"""
    return os.environ.get('AWS_REGION') or os.environ.get('AWS_DEFAULT_REGION') or 'us-east-1'

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class RuleNotFound(Exception):
    """指定IDのルールが見つからない。"""


class DefaultRuleProtected(Exception):
    """デフォルトルールに対する不許可操作（削除など）。"""


def _now_iso() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


class RulesRepository:
    """RulesTable に対する CRUD 操作を提供する。"""

    def __init__(self, table_name: str, region_name: Optional[str] = None):
        if boto3 is None:
            raise RuntimeError('boto3 is not available')
        self.table_name = table_name
        self._region = region_name or _get_default_region()
        self.table = boto3.resource('dynamodb', region_name=self._region).Table(table_name)

    def list(self) -> List[Dict]:
        resp = self.table.scan()
        return resp.get('Items', [])

    def list_active(self) -> List[Dict]:
        return [r for r in self.list() if r.get('isActive') is True]

    def get(self, rule_id: str) -> Optional[Dict]:
        resp = self.table.get_item(Key={'ruleId': rule_id})
        return resp.get('Item')

    def batch_get(self, rule_ids: List[str]) -> List[Dict]:
        if not rule_ids:
            return []
        keys = [{'ruleId': rid} for rid in rule_ids]
        resp = boto3.resource('dynamodb', region_name=self._region).batch_get_item(
            RequestItems={self.table_name: {'Keys': keys}}
        )
        return resp.get('Responses', {}).get(self.table_name, [])

    def create(self, name: str, prompt: str, is_active: bool = False) -> Dict:
        rule_id = str(uuid.uuid4())
        now = _now_iso()
        item = {
            'ruleId': rule_id,
            'name': name,
            'prompt': prompt,
            'isDefault': False,
            'isActive': is_active,
            'createdAt': now,
            'updatedAt': now,
        }
        self.table.put_item(Item=item)
        return item

    def update(self, rule_id: str, **fields) -> Dict:
        existing = self.get(rule_id)
        if existing is None:
            raise RuleNotFound(rule_id)

        allowed_keys = {'name', 'prompt', 'isActive'}
        update_expr_parts = ['#updatedAt = :updatedAt']
        attr_names = {'#updatedAt': 'updatedAt'}
        attr_values = {':updatedAt': _now_iso()}

        for key, value in fields.items():
            if key not in allowed_keys or value is None:
                continue
            update_expr_parts.append(f'#{key} = :{key}')
            attr_names[f'#{key}'] = key
            attr_values[f':{key}'] = value

        self.table.update_item(
            Key={'ruleId': rule_id},
            UpdateExpression='SET ' + ', '.join(update_expr_parts),
            ExpressionAttributeNames=attr_names,
            ExpressionAttributeValues=attr_values,
        )
        return self.get(rule_id)

    def delete(self, rule_id: str) -> None:
        existing = self.get(rule_id)
        if existing is None:
            raise RuleNotFound(rule_id)
        if existing.get('isDefault') is True:
            raise DefaultRuleProtected(rule_id)
        self.table.delete_item(Key={'ruleId': rule_id})
