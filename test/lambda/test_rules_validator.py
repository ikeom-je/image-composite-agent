"""rules_validator のユニットテスト"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../lambda/python'))

from rules_validator import (
    RuleLimits,
    RuleSizeError,
    RuleCountError,
    validate_single_prompt,
    truncate_combined,
)


class TestRuleLimits(unittest.TestCase):
    def test_from_env_defaults(self):
        """環境変数未設定時、デフォルト値が使われる"""
        limits = RuleLimits.from_env({})
        self.assertEqual(limits.max_prompt_chars, 10000)
        self.assertEqual(limits.max_count, 5)
        self.assertEqual(limits.max_combined_chars, 20000)

    def test_from_env_overrides(self):
        """環境変数で上書きできる"""
        env = {
            'RULES_MAX_PROMPT_CHARS': '500',
            'RULES_MAX_COUNT': '2',
            'RULES_MAX_COMBINED_CHARS': '800',
        }
        limits = RuleLimits.from_env(env)
        self.assertEqual(limits.max_prompt_chars, 500)
        self.assertEqual(limits.max_count, 2)
        self.assertEqual(limits.max_combined_chars, 800)


class TestValidateSinglePrompt(unittest.TestCase):
    def setUp(self):
        self.limits = RuleLimits(max_prompt_chars=100, max_count=5, max_combined_chars=500)

    def test_valid_prompt_passes(self):
        validate_single_prompt('a' * 50, self.limits)  # 例外を投げない

    def test_empty_prompt_raises(self):
        with self.assertRaises(RuleSizeError):
            validate_single_prompt('', self.limits)

    def test_oversized_prompt_raises(self):
        with self.assertRaises(RuleSizeError) as cm:
            validate_single_prompt('a' * 101, self.limits)
        self.assertIn('100', str(cm.exception))

    def test_exact_boundary_prompt_passes(self):
        """上限と等しい文字数は通過する（境界値）"""
        validate_single_prompt('a' * 100, self.limits)  # 例外を投げない


class TestTruncateCombined(unittest.TestCase):
    def setUp(self):
        self.limits = RuleLimits(max_prompt_chars=100, max_count=3, max_combined_chars=200)

    def _rule(self, name, prompt):
        return {'name': name, 'prompt': prompt}

    def test_under_limit_returns_all(self):
        """上限内なら全ルールが採用される"""
        rules = [self._rule('a', 'x' * 50), self._rule('b', 'x' * 50)]
        result, dropped = truncate_combined(rules, self.limits)
        self.assertEqual(len(result), 2)
        self.assertEqual(dropped, 0)

    def test_over_count_raises(self):
        """件数上限を超えたら RuleCountError を投げる"""
        rules = [self._rule(str(i), 'x') for i in range(4)]
        with self.assertRaises(RuleCountError):
            truncate_combined(rules, self.limits)

    def test_over_combined_chars_drops_tail(self):
        """結合文字数が上限を超えたら末尾から切り捨てる"""
        rules = [
            self._rule('a', 'x' * 90),
            self._rule('b', 'x' * 90),
            self._rule('c', 'x' * 90),
        ]
        result, dropped = truncate_combined(rules, self.limits)
        self.assertEqual(len(result), 2)
        self.assertEqual(dropped, 1)
        self.assertEqual(result[0]['name'], 'a')
        self.assertEqual(result[1]['name'], 'b')

    def test_exact_combined_boundary_returns_all(self):
        """結合文字数が上限ぴったりなら全件採用される（境界値）"""
        rules = [self._rule('a', 'x' * 100), self._rule('b', 'x' * 100)]
        result, dropped = truncate_combined(rules, self.limits)
        self.assertEqual(len(result), 2)
        self.assertEqual(dropped, 0)


if __name__ == '__main__':
    unittest.main()
