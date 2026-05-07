"""rules_repository のユニットテスト（moto でDynamoDBをモック）"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

import boto3
from moto import mock_aws

from rules_repository import RulesRepository, DefaultRuleProtected, RuleNotFound

TABLE_NAME = 'TestRulesTable'


@mock_aws
class TestRulesRepository(unittest.TestCase):
    def setUp(self):
        self.dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        self.dynamodb.create_table(
            TableName=TABLE_NAME,
            KeySchema=[{'AttributeName': 'ruleId', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'ruleId', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST',
        )
        self.repo = RulesRepository(TABLE_NAME)

    def test_create_assigns_uuid_and_defaults(self):
        """create はUUIDを採番し、isDefault=False/タイムスタンプを付与する"""
        rule = self.repo.create(name='test', prompt='本文', is_active=False)
        self.assertEqual(rule['name'], 'test')
        self.assertEqual(rule['prompt'], '本文')
        self.assertFalse(rule['isActive'])
        self.assertFalse(rule['isDefault'])
        self.assertIn('-', rule['ruleId'])  # UUID形式
        self.assertIn('createdAt', rule)
        self.assertIn('updatedAt', rule)

    def test_get_existing_rule(self):
        """既存ルールを取得できる"""
        created = self.repo.create(name='r', prompt='p', is_active=True)
        got = self.repo.get(created['ruleId'])
        self.assertEqual(got['ruleId'], created['ruleId'])

    def test_get_missing_rule_returns_none(self):
        """存在しないIDは None を返す"""
        self.assertIsNone(self.repo.get('nonexistent'))

    def test_list_returns_all(self):
        """list は全件を返す"""
        self.repo.create(name='a', prompt='p1', is_active=True)
        self.repo.create(name='b', prompt='p2', is_active=False)
        rules = self.repo.list()
        self.assertEqual(len(rules), 2)

    def test_list_active_filters(self):
        """list_active はisActive=Trueのみ返す"""
        self.repo.create(name='a', prompt='p1', is_active=True)
        self.repo.create(name='b', prompt='p2', is_active=False)
        active = self.repo.list_active()
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]['name'], 'a')

    def test_update_partial(self):
        """部分更新が機能する"""
        created = self.repo.create(name='r', prompt='p', is_active=False)
        updated = self.repo.update(created['ruleId'], name='renamed')
        self.assertEqual(updated['name'], 'renamed')
        self.assertEqual(updated['prompt'], 'p')  # 部分更新で他属性は維持
        self.assertFalse(updated['isActive'])

    def test_update_missing_raises(self):
        """存在しないIDの更新は RuleNotFound"""
        with self.assertRaises(RuleNotFound):
            self.repo.update('nonexistent', name='x')

    def test_delete_normal_rule(self):
        """通常のルールは削除できる"""
        created = self.repo.create(name='r', prompt='p', is_active=False)
        self.repo.delete(created['ruleId'])
        self.assertIsNone(self.repo.get(created['ruleId']))

    def test_delete_default_rule_raises(self):
        """デフォルトルールは DefaultRuleProtected で保護される"""
        self.dynamodb.Table(TABLE_NAME).put_item(Item={
            'ruleId': 'jaa-subtitle-handbook-v1',
            'name': 'JAA',
            'prompt': 'p',
            'isDefault': True,
            'isActive': True,
            'createdAt': '2026-05-04T00:00:00Z',
            'updatedAt': '2026-05-04T00:00:00Z',
        })
        with self.assertRaises(DefaultRuleProtected):
            self.repo.delete('jaa-subtitle-handbook-v1')

    def test_delete_missing_raises(self):
        """存在しないIDの削除は RuleNotFound"""
        with self.assertRaises(RuleNotFound):
            self.repo.delete('nonexistent')

    def test_batch_get_existing(self):
        """batch_get で複数ID取得できる"""
        a = self.repo.create(name='a', prompt='p1', is_active=True)
        b = self.repo.create(name='b', prompt='p2', is_active=True)
        results = self.repo.batch_get([a['ruleId'], b['ruleId']])
        names = sorted(r['name'] for r in results)
        self.assertEqual(names, ['a', 'b'])

    def test_batch_get_skips_missing(self):
        """batch_get は存在しないIDをスキップする"""
        a = self.repo.create(name='a', prompt='p1', is_active=True)
        results = self.repo.batch_get([a['ruleId'], 'nonexistent'])
        self.assertEqual(len(results), 1)


if __name__ == '__main__':
    unittest.main()
