"""agent_prompts.build_full_prompt のユニットテスト"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from agent_prompts import SYSTEM_PROMPT, build_full_prompt
from rules_validator import RuleLimits


class TestBuildFullPrompt(unittest.TestCase):
    def setUp(self):
        self.limits = RuleLimits(max_prompt_chars=1000, max_count=5, max_combined_chars=5000)

    def _rule(self, name, prompt, rule_id='r1', is_active=True, is_default=False):
        return {
            'ruleId': rule_id, 'name': name, 'prompt': prompt,
            'isActive': is_active, 'isDefault': is_default,
            'createdAt': '2026-05-04T00:00:00Z', 'updatedAt': '2026-05-04T00:00:00Z',
        }

    def test_no_rules_returns_base_prompt(self):
        """ルール0件なら基本SYSTEM_PROMPTのみを返す"""
        result = build_full_prompt([], [], self.limits)
        self.assertEqual(result, SYSTEM_PROMPT)

    def test_single_rule_appended(self):
        """1ルールが見出し付きで連結される"""
        rules = [self._rule('JAA配置', '左下に配置')]
        result = build_full_prompt(rules, [], self.limits)
        self.assertIn(SYSTEM_PROMPT, result)
        self.assertIn('## 表現規定ルール', result)
        self.assertIn('### JAA配置', result)
        self.assertIn('左下に配置', result)

    def test_inline_rule_combined(self):
        """永続+inlineが両方注入される"""
        rules = [self._rule('永続', '永続本文')]
        inline = [{'name': 'ドラフト', 'prompt': 'ドラフト本文'}]
        result = build_full_prompt(rules, inline, self.limits)
        self.assertIn('### 永続', result)
        self.assertIn('### ドラフト', result)

    def test_combined_oversize_drops_tail(self):
        """結合超過時、末尾ルールが除外される"""
        small_limits = RuleLimits(max_prompt_chars=1000, max_count=5, max_combined_chars=200)
        rules = [
            self._rule('a', 'x' * 100, rule_id='r1'),
            self._rule('b', 'x' * 100, rule_id='r2'),
            self._rule('c', 'x' * 100, rule_id='r3'),  # 切り捨てられる
        ]
        result = build_full_prompt(rules, [], small_limits)
        self.assertIn('### a', result)
        self.assertIn('### b', result)
        self.assertNotIn('### c\n', result)

    def test_inline_only_no_persisted(self):
        """永続0件・inlineのみでも注入される"""
        inline = [{'name': 'ドラフトのみ', 'prompt': '内容'}]
        result = build_full_prompt([], inline, self.limits)
        self.assertIn('### ドラフトのみ', result)
        self.assertIn('内容', result)


if __name__ == '__main__':
    unittest.main()
