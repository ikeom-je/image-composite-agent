"""ルールプロンプトのサイズ・件数ガード（純粋ロジック）。"""

from dataclasses import dataclass
from typing import Dict, List, Mapping, Tuple


class RuleSizeError(ValueError):
    """単一ルール本文がサイズ上限を超過した。"""


class RuleCountError(ValueError):
    """適用ルール数が上限を超過した。"""


@dataclass(frozen=True)
class RuleLimits:
    max_prompt_chars: int
    max_count: int
    max_combined_chars: int

    @classmethod
    def from_env(cls, env: Mapping[str, str]) -> 'RuleLimits':
        return cls(
            max_prompt_chars=int(env.get('RULES_MAX_PROMPT_CHARS', '10000')),
            max_count=int(env.get('RULES_MAX_COUNT', '5')),
            max_combined_chars=int(env.get('RULES_MAX_COMBINED_CHARS', '20000')),
        )


def validate_single_prompt(prompt: str, limits: RuleLimits) -> None:
    """単一ルール本文のサイズを検証する。空文字または上限超過で RuleSizeError を投げる。"""
    if not prompt:
        raise RuleSizeError('prompt must not be empty')
    if len(prompt) > limits.max_prompt_chars:
        raise RuleSizeError(
            f'prompt exceeds {limits.max_prompt_chars} chars (got {len(prompt)})'
        )


def truncate_combined(
    rules: List[Dict[str, str]],
    limits: RuleLimits,
) -> Tuple[List[Dict[str, str]], int]:
    """
    結合後の総文字数が上限を超える場合、末尾から除外する。
    件数上限を超える場合は RuleCountError を投げる（呼び出し側で400に変換）。
    返り値: (採用されたルール, 切り捨てた件数)
    """
    if len(rules) > limits.max_count:
        raise RuleCountError(
            f'too many rules: {len(rules)} > {limits.max_count}'
        )

    accumulated_chars = 0
    accepted: List[Dict[str, str]] = []
    for rule in rules:
        prompt_len = len(rule.get('prompt', ''))
        if accumulated_chars + prompt_len > limits.max_combined_chars:
            break
        accepted.append(rule)
        accumulated_chars += prompt_len

    dropped = len(rules) - len(accepted)
    return accepted, dropped
