# Issue #8: カスタムルールプロンプトAPI 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strands Agent の system prompt にカスタムルールを動的注入する機能を、ルールCRUD API + DynamoDBテーブル + デフォルトルール自動投入とともに実装する。

**Architecture:** 新規DynamoDBテーブル `ImageCompositor-Rules` をPK `ruleId` で構築。既存`agent_handler.py`に`/chat/rules`系ルーティングを追加。`build_full_prompt()` で system prompt にアクティブルールを連結注入。デフォルトルール（JAA字幕ハンドブック準拠）はDynamoDB Native Import from S3で初回投入、再投入は`scripts/seed-rules.sh`。

**Tech Stack:** Python 3.12 / boto3 / AWS CDK (TypeScript) / DynamoDB / API Gateway / Strands Agents SDK / unittest + moto / Playwright (API E2E)

**Spec参照:**
- [requirements.md](../../../.kiro/specs/custom-rules-prompt/requirements.md) — Req 1〜7, 13（API側）
- [design.md](../../../.kiro/specs/custom-rules-prompt/design.md) — 全体設計
- [tasks.md](../../../.kiro/specs/custom-rules-prompt/tasks.md) — 元タスクリスト + 作業フロー別チェックリスト

---

## File Structure

| ファイル | 役割 | Create/Modify |
|---|---|---|
| `assets/seed-rules/jaa-rule.import.jsonl` | DynamoDB Import用 ND-JSON シード | Create |
| `assets/seed-rules/jaa-rule.put.json` | put-item用 シード（Item属性のみ） | Create |
| `lambda/python/rules_validator.py` | サイズ・件数ガード（純粋ロジック） | Create |
| `lambda/python/rules_repository.py` | RulesTable CRUD（boto3ラッパ） | Create |
| `lambda/python/agent_prompts.py` | `build_full_prompt()` 追加 | Modify |
| `lambda/python/agent_handler.py` | ルール CRUD/preview ルーティング、`handle_chat` 拡張 | Modify |
| `lib/image-processor-api-stack.ts` | RulesTable, SeedBucket, Import, API Gateway, IAM | Modify |
| `scripts/seed-rules.sh` | 既存テーブルへの再投入・リセット | Create |
| `test/lambda/test_rules_validator.py` | ガードユニットテスト | Create |
| `test/lambda/test_rules_repository.py` | リポジトリユニットテスト（mock） | Create |
| `test/lambda/test_agent_prompts.py` | `build_full_prompt` テスト | Create |
| `test/lambda/test_agent_handler.py` | 拡張: ルール系ルート + ruleIds/inlineRules | Modify |
| `test/e2e/rules.api.spec.ts` | API E2E: CRUD + preview | Create |
| `test/e2e/chat-agent.api.spec.ts` | 拡張: inlineRules適用 | Modify |

---

## 事前準備（タスクの外）

```bash
# worktree切り出し（メイン作業ディレクトリは触らない）
cd /home/pi/develop/image-composite-agent
git worktree add ../image-composite-agent-issue8 -b feature/issue8-custom-rules-api dev
cd ../image-composite-agent-issue8

# Python依存（既存venv使い回し / または新規venv）
python3 -m venv .venv && source .venv/bin/activate
pip install boto3 moto
```

---

## Task 1: シードデータディレクトリ作成と JAA デフォルトルール本文起こし

**Files:**
- Create: `assets/seed-rules/jaa-rule.put.json`
- Create: `assets/seed-rules/jaa-rule.import.jsonl`

JAA字幕ハンドブック（https://www.jaa.or.jp/assets/uploads/docs/jimaku_handbook.pdf）から画像合成に関係する規定を要点抽出してMarkdown化する。**スキャンPDFのため、本タスクではPDFを開いて内容を読み、画像合成（テロップ・字幕配置）に関する以下5カテゴリを抽出する**:

1. セーフゾーン（画面端からの安全マージン）
2. テロップ位置の標準パターン（上テロップ、下テロップ、サイドスーパー）
3. 文字サイズの目安（最小可読サイズ、推奨サイズ）
4. テロップ種別ごとの配置ガイド
5. 禁止事項（顔・テロップ重なり等）

PDFが取得困難な場合はAgent経由で公知情報（一般的な放送規格TVセーフ・タイトルセーフ）を要点として記述し、PRレビュー時に編集する旨をコメントに残す。

- [ ] **Step 1: ディレクトリ作成**

```bash
mkdir -p assets/seed-rules
```

- [ ] **Step 2: `jaa-rule.put.json`（put-item用、Item キーで包まない属性ルート）を作成**

```json
{
  "ruleId": { "S": "jaa-subtitle-handbook-v1" },
  "name": { "S": "JAA字幕ハンドブック準拠 配置規定" },
  "prompt": { "S": "## 字幕・テロップ配置ルール（JAA字幕ハンドブック準拠）\n\n### 1. セーフゾーン\n- 画面端から内側に5%以上のマージンを確保し、テキスト・重要オブジェクトを配置すること\n- HD（1920x1080）の場合、上下96px・左右96px以上を空ける\n\n### 2. テロップの標準位置\n- **下テロップ（メインテロップ）**: 画面下端から10〜20%の領域に1〜3行で配置。中央寄せ推奨\n- **上テロップ（サブ情報）**: 画面上端から5〜15%の領域に短く配置\n- **サイドスーパー（人物紹介・場所）**: 画面左下または右下、対象人物の近傍\n\n### 3. 文字サイズの目安\n- HDで最低32px以上を推奨。視聴環境を考慮し、メインテロップは48〜72pxを基本とする\n- 1行あたり全角13〜15文字程度を上限とする\n\n### 4. テロップ種別ガイド\n- **発言テロップ**: 発話者の発言を引用する場合、視認しやすい位置に2〜3秒以上表示\n- **説明テロップ**: 場所・状況を補足する短文。視聴の流れを妨げない位置\n- **ロゴ・ウォーターマーク**: 画面隅、本編コンテンツと重ならない位置に小さく\n\n### 5. 禁止事項・注意点\n- 顔の上に大きなテロップを重ねない（顔認識・表情を妨げない）\n- 背景と同色系のテロップは禁止（白背景に白文字など）\n- 同時に表示するテロップ数は3つまでを目安\n- 動きの激しい背景では半透明のテロップ枠を入れて視認性を確保\n\n以上の規定に従い、テロップ・字幕の配置を判断してください。" },
  "isDefault": { "BOOL": true },
  "isActive": { "BOOL": true },
  "createdAt": { "S": "2026-05-04T00:00:00Z" },
  "updatedAt": { "S": "2026-05-04T00:00:00Z" }
}
```

- [ ] **Step 3: `jaa-rule.import.jsonl`（Import用、ND-JSON形式、1行1Item）を作成**

`jaa-rule.put.json`の内容を `Item` キーで包んだものを **1行に圧縮** して書く（改行区切りJSONなので、内部でリテラル `\n` は許可だが行末以外の改行は禁止）。`jq` で生成すると確実:

```bash
jq -c '{Item: .}' assets/seed-rules/jaa-rule.put.json > assets/seed-rules/jaa-rule.import.jsonl
```

- [ ] **Step 4: 内容確認**

```bash
cat assets/seed-rules/jaa-rule.import.jsonl | python3 -c "import sys, json; [json.loads(l) for l in sys.stdin if l.strip()]; print('valid ND-JSON')"
```

Expected: `valid ND-JSON`

- [ ] **Step 5: コミット**

```bash
git add assets/seed-rules/
git commit -m "feat(seed): JAA字幕ハンドブック準拠デフォルトルールを追加"
```

---

## Task 2: rules_validator.py（サイズ・件数ガード）

**Files:**
- Create: `lambda/python/rules_validator.py`
- Create: `test/lambda/test_rules_validator.py`

純粋ロジック。boto3に依存しない（テストしやすい）。

- [ ] **Step 1: 失敗するテストを書く（test_rules_validator.py）**

```python
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


class TestTruncateCombined(unittest.TestCase):
    def setUp(self):
        self.limits = RuleLimits(max_prompt_chars=100, max_count=3, max_combined_chars=200)

    def _rule(self, name, prompt):
        return {'name': name, 'prompt': prompt}

    def test_under_limit_returns_all(self):
        rules = [self._rule('a', 'x' * 50), self._rule('b', 'x' * 50)]
        result, dropped = truncate_combined(rules, self.limits)
        self.assertEqual(len(result), 2)
        self.assertEqual(dropped, 0)

    def test_over_count_raises(self):
        rules = [self._rule(str(i), 'x') for i in range(4)]
        with self.assertRaises(RuleCountError):
            truncate_combined(rules, self.limits)

    def test_over_combined_chars_drops_tail(self):
        rules = [
            self._rule('a', 'x' * 90),
            self._rule('b', 'x' * 90),
            self._rule('c', 'x' * 90),  # 結合超過の予定
        ]
        result, dropped = truncate_combined(rules, self.limits)
        self.assertEqual(len(result), 2)
        self.assertEqual(dropped, 1)
        self.assertEqual(result[0]['name'], 'a')
        self.assertEqual(result[1]['name'], 'b')


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: テストを走らせて失敗を確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_rules_validator -v
```

Expected: ImportError（`rules_validator` モジュールが存在しない）

- [ ] **Step 3: rules_validator.py を実装**

```python
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
    if not prompt or len(prompt) == 0:
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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_rules_validator -v
```

Expected: `Ran 7 tests in 0.00Xs / OK`

- [ ] **Step 5: コミット**

```bash
git add lambda/python/rules_validator.py test/lambda/test_rules_validator.py
git commit -m "feat(api): ルールプロンプトのサイズ・件数ガードを追加"
```

---

## Task 3: agent_prompts.py に build_full_prompt() を追加

**Files:**
- Modify: `lambda/python/agent_prompts.py`
- Create: `test/lambda/test_agent_prompts.py`

- [ ] **Step 1: 失敗するテストを書く（test_agent_prompts.py）**

```python
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
        self.assertNotIn('### c', result)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: テストを走らせて失敗を確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_prompts -v
```

Expected: ImportError（`build_full_prompt` 未定義）

- [ ] **Step 3: agent_prompts.py に build_full_prompt を追加**

ファイル末尾に追加（既存の `SYSTEM_PROMPT` 定義の下）:

```python
from typing import Dict, List

from rules_validator import RuleLimits, truncate_combined


def build_full_prompt(
    rules: List[Dict],
    inline_rules: List[Dict[str, str]],
    limits: RuleLimits,
) -> str:
    """
    基本SYSTEM_PROMPTにルール本文を連結して最終プロンプトを生成する。

    rules: DynamoDB由来の永続ルール（dict形式: ruleId/name/prompt等を含む）
    inline_rules: テスト送信用の一時ルール（dict形式: nameとpromptのみ）
    limits: サイズ・件数ガード
    """
    combined = list(rules) + list(inline_rules)
    if not combined:
        return SYSTEM_PROMPT

    accepted, _dropped = truncate_combined(combined, limits)
    if not accepted:
        return SYSTEM_PROMPT

    section = '\n\n## 表現規定ルール\n以下のルールを必ず遵守して画像を配置してください:\n\n'
    section += '\n\n'.join(f"### {r['name']}\n{r['prompt']}" for r in accepted)
    return SYSTEM_PROMPT + section
```

- [ ] **Step 4: テストが通ることを確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_prompts -v
```

Expected: `Ran 4 tests in 0.00Xs / OK`

- [ ] **Step 5: コミット**

```bash
git add lambda/python/agent_prompts.py test/lambda/test_agent_prompts.py
git commit -m "feat(agent): system promptへのルール注入ヘルパーbuild_full_promptを追加"
```

---

## Task 4: rules_repository.py（DynamoDB CRUD）

**Files:**
- Create: `lambda/python/rules_repository.py`
- Create: `test/lambda/test_rules_repository.py`

`moto` ライブラリでDynamoDBをモックしてテスト。

- [ ] **Step 1: テストを書く（test_rules_repository.py）**

```python
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
        rule = self.repo.create(name='test', prompt='本文', is_active=False)
        self.assertEqual(rule['name'], 'test')
        self.assertEqual(rule['prompt'], '本文')
        self.assertFalse(rule['isActive'])
        self.assertFalse(rule['isDefault'])
        self.assertIn('-', rule['ruleId'])  # UUID形式
        self.assertIn('createdAt', rule)
        self.assertIn('updatedAt', rule)

    def test_get_existing_rule(self):
        created = self.repo.create(name='r', prompt='p', is_active=True)
        got = self.repo.get(created['ruleId'])
        self.assertEqual(got['ruleId'], created['ruleId'])

    def test_get_missing_rule_returns_none(self):
        self.assertIsNone(self.repo.get('nonexistent'))

    def test_list_returns_all(self):
        self.repo.create(name='a', prompt='p1', is_active=True)
        self.repo.create(name='b', prompt='p2', is_active=False)
        rules = self.repo.list()
        self.assertEqual(len(rules), 2)

    def test_list_active_filters(self):
        self.repo.create(name='a', prompt='p1', is_active=True)
        self.repo.create(name='b', prompt='p2', is_active=False)
        active = self.repo.list_active()
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]['name'], 'a')

    def test_update_partial(self):
        created = self.repo.create(name='r', prompt='p', is_active=False)
        original_updated_at = created['updatedAt']
        # updatedAtを変えるため少し待つ代わりに、固定時刻を上書きしないので別の方法で検証
        updated = self.repo.update(created['ruleId'], name='renamed')
        self.assertEqual(updated['name'], 'renamed')
        self.assertEqual(updated['prompt'], 'p')  # 部分更新
        self.assertFalse(updated['isActive'])

    def test_update_missing_raises(self):
        with self.assertRaises(RuleNotFound):
            self.repo.update('nonexistent', name='x')

    def test_delete_normal_rule(self):
        created = self.repo.create(name='r', prompt='p', is_active=False)
        self.repo.delete(created['ruleId'])
        self.assertIsNone(self.repo.get(created['ruleId']))

    def test_delete_default_rule_raises(self):
        # デフォルトルールを直接put（リポジトリのcreateはisDefault=Falseで作るため）
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
        with self.assertRaises(RuleNotFound):
            self.repo.delete('nonexistent')

    def test_batch_get_existing(self):
        a = self.repo.create(name='a', prompt='p1', is_active=True)
        b = self.repo.create(name='b', prompt='p2', is_active=True)
        results = self.repo.batch_get([a['ruleId'], b['ruleId']])
        names = sorted(r['name'] for r in results)
        self.assertEqual(names, ['a', 'b'])

    def test_batch_get_skips_missing(self):
        a = self.repo.create(name='a', prompt='p1', is_active=True)
        results = self.repo.batch_get([a['ruleId'], 'nonexistent'])
        self.assertEqual(len(results), 1)


if __name__ == '__main__':
    unittest.main()
```

- [ ] **Step 2: テストを走らせて失敗を確認**

```bash
pip install moto
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_rules_repository -v
```

Expected: ImportError（`rules_repository`未定義）

- [ ] **Step 3: rules_repository.py を実装**

```python
"""DynamoDB RulesTable CRUD ラッパ。"""

import logging
import time
import uuid
from typing import Dict, List, Optional

try:
    import boto3
    from botocore.exceptions import ClientError
except ImportError:
    boto3 = None

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


class RuleNotFound(Exception):
    """指定IDのルールが見つからない。"""


class DefaultRuleProtected(Exception):
    """デフォルトルールに対する不許可操作（削除など）。"""


def _now_iso() -> str:
    return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


class RulesRepository:
    def __init__(self, table_name: str):
        if boto3 is None:
            raise RuntimeError('boto3 is not available')
        self.table_name = table_name
        self.table = boto3.resource('dynamodb').Table(table_name)

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
        # DynamoDB BatchGetItem 上限100件、本機能は最大5件想定
        keys = [{'ruleId': rid} for rid in rule_ids]
        resp = boto3.resource('dynamodb').batch_get_item(
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
```

- [ ] **Step 4: テストが通ることを確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_rules_repository -v
```

Expected: `Ran 11 tests / OK`

- [ ] **Step 5: コミット**

```bash
git add lambda/python/rules_repository.py test/lambda/test_rules_repository.py
git commit -m "feat(api): RulesRepositoryでDynamoDB CRUDを追加"
```

---

## Task 5: agent_handler.py に CRUD ハンドラを追加

**Files:**
- Modify: `lambda/python/agent_handler.py`
- Modify: `test/lambda/test_agent_handler.py`

5つのハンドラを追加:
- `handle_rules_list` (GET /chat/rules)
- `handle_rules_create` (POST /chat/rules)
- `handle_rules_get` (GET /chat/rules/{ruleId})
- `handle_rules_update` (PUT /chat/rules/{ruleId})
- `handle_rules_delete` (DELETE /chat/rules/{ruleId})

ルーティングは既存の `handler()` 関数を拡張。`ruleId == 'preview'` は400で reject（防御）。

- [ ] **Step 1: 既存 test_agent_handler.py の構造を確認**

```bash
head -50 test/lambda/test_agent_handler.py
```

- [ ] **Step 2: 新しいテストクラスを test_agent_handler.py 末尾に追加**

```python
# 既存のテストクラスは保持。以下を末尾に追加。

import json as _json_for_rules

@mock_aws
class TestRulesHandler(unittest.TestCase):
    """ルールCRUDハンドラのテスト"""

    TABLE_NAME = 'TestRulesTable'

    def setUp(self):
        os.environ['RULES_TABLE'] = self.TABLE_NAME
        self.dynamodb = boto3.resource('dynamodb', region_name='us-east-1')
        self.dynamodb.create_table(
            TableName=self.TABLE_NAME,
            KeySchema=[{'AttributeName': 'ruleId', 'KeyType': 'HASH'}],
            AttributeDefinitions=[{'AttributeName': 'ruleId', 'AttributeType': 'S'}],
            BillingMode='PAY_PER_REQUEST',
        )

    def _event(self, method, path, body=None, path_params=None):
        return {
            'httpMethod': method,
            'resource': path,
            'path': path,
            'pathParameters': path_params or {},
            'queryStringParameters': None,
            'body': _json_for_rules.dumps(body) if body else None,
        }

    def test_list_empty(self):
        from agent_handler import handler
        resp = handler(self._event('GET', '/chat/rules'), None)
        self.assertEqual(resp['statusCode'], 200)
        body = _json_for_rules.loads(resp['body'])
        self.assertEqual(body['rules'], [])

    def test_create_returns_201(self):
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
        from agent_handler import handler
        resp = handler(
            self._event('POST', '/chat/rules', body={'prompt': 'p'}),
            None
        )
        self.assertEqual(resp['statusCode'], 400)

    def test_get_missing_returns_404(self):
        from agent_handler import handler
        resp = handler(
            self._event('GET', '/chat/rules/{ruleId}', path_params={'ruleId': 'nope'}),
            None
        )
        self.assertEqual(resp['statusCode'], 404)

    def test_get_existing_returns_200(self):
        from agent_handler import handler
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME)
        created = repo.create(name='r', prompt='p', is_active=True)

        resp = handler(
            self._event('GET', '/chat/rules/{ruleId}', path_params={'ruleId': created['ruleId']}),
            None
        )
        self.assertEqual(resp['statusCode'], 200)
        body = _json_for_rules.loads(resp['body'])
        self.assertEqual(body['rule']['ruleId'], created['ruleId'])

    def test_update_partial(self):
        from agent_handler import handler
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME)
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
        from agent_handler import handler
        from rules_repository import RulesRepository
        repo = RulesRepository(self.TABLE_NAME)
        created = repo.create(name='r', prompt='p', is_active=False)

        resp = handler(
            self._event('DELETE', '/chat/rules/{ruleId}', path_params={'ruleId': created['ruleId']}),
            None
        )
        self.assertEqual(resp['statusCode'], 204)

    def test_delete_default_returns_403(self):
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
        """{ruleId}=preview は400で防御"""
        from agent_handler import handler
        resp = handler(
            self._event('GET', '/chat/rules/{ruleId}', path_params={'ruleId': 'preview'}),
            None
        )
        self.assertEqual(resp['statusCode'], 400)
```

ファイル先頭のimportに以下を追加:

```python
import boto3
from moto import mock_aws
```

- [ ] **Step 3: テストを走らせて失敗を確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_handler.TestRulesHandler -v
```

Expected: 何らかのFAIL（ハンドラ未実装、ルーティング未対応）

- [ ] **Step 4: agent_handler.py にハンドラを追加**

ファイルのhandler関数より前に以下を追加:

```python
# === ルール CRUD ハンドラ ===

def _get_rules_repository():
    """RulesRepository をDIフックを介して取得"""
    from rules_repository import RulesRepository
    table_name = os.environ.get('RULES_TABLE')
    if not table_name:
        return None
    return RulesRepository(table_name)


def _get_rule_limits():
    from rules_validator import RuleLimits
    return RuleLimits.from_env(os.environ)


def handle_rules_list(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/rules"""
    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})
    rules = repo.list()
    return format_response(200, {'rules': rules})


def handle_rules_create(event: Dict[str, Any], context: Any) -> Dict:
    """POST /chat/rules"""
    from rules_validator import validate_single_prompt, RuleSizeError
    try:
        body = json.loads(event.get('body', '{}') or '{}')
    except json.JSONDecodeError:
        return format_response(400, {'error': 'Invalid JSON'})

    name = (body.get('name') or '').strip()
    prompt = body.get('prompt') or ''
    is_active = bool(body.get('isActive', False))

    if not name or len(name) > 100:
        return format_response(400, {'error': 'name is required (1-100 chars)'})

    limits = _get_rule_limits()
    try:
        validate_single_prompt(prompt, limits)
    except RuleSizeError as e:
        return format_response(400, {'error': str(e)})

    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})
    rule = repo.create(name=name, prompt=prompt, is_active=is_active)
    return format_response(201, {'rule': rule})


def handle_rules_get(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/rules/{ruleId}"""
    rule_id = event.get('pathParameters', {}).get('ruleId', '')
    if rule_id == 'preview':
        return format_response(400, {'error': 'ruleId "preview" is reserved'})
    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})
    rule = repo.get(rule_id)
    if rule is None:
        return format_response(404, {'error': 'Rule not found'})
    return format_response(200, {'rule': rule})


def handle_rules_update(event: Dict[str, Any], context: Any) -> Dict:
    """PUT /chat/rules/{ruleId}"""
    from rules_validator import validate_single_prompt, RuleSizeError
    from rules_repository import RuleNotFound

    rule_id = event.get('pathParameters', {}).get('ruleId', '')
    if rule_id == 'preview':
        return format_response(400, {'error': 'ruleId "preview" is reserved'})

    try:
        body = json.loads(event.get('body', '{}') or '{}')
    except json.JSONDecodeError:
        return format_response(400, {'error': 'Invalid JSON'})

    fields = {}
    if 'name' in body:
        n = (body.get('name') or '').strip()
        if not n or len(n) > 100:
            return format_response(400, {'error': 'name must be 1-100 chars'})
        fields['name'] = n
    if 'prompt' in body:
        prompt = body.get('prompt') or ''
        try:
            validate_single_prompt(prompt, _get_rule_limits())
        except RuleSizeError as e:
            return format_response(400, {'error': str(e)})
        fields['prompt'] = prompt
    if 'isActive' in body:
        fields['isActive'] = bool(body['isActive'])

    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})

    try:
        rule = repo.update(rule_id, **fields)
    except RuleNotFound:
        return format_response(404, {'error': 'Rule not found'})
    return format_response(200, {'rule': rule})


def handle_rules_delete(event: Dict[str, Any], context: Any) -> Dict:
    """DELETE /chat/rules/{ruleId}"""
    from rules_repository import RuleNotFound, DefaultRuleProtected

    rule_id = event.get('pathParameters', {}).get('ruleId', '')
    if rule_id == 'preview':
        return format_response(400, {'error': 'ruleId "preview" is reserved'})

    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})

    try:
        repo.delete(rule_id)
    except RuleNotFound:
        return format_response(404, {'error': 'Rule not found'})
    except DefaultRuleProtected:
        return format_response(403, {'error': 'Default rule cannot be deleted'})
    return format_response(204, {})
```

`handler()` 関数のルーティングを拡張（既存ロジックの後ろに追加）:

```python
def handler(event: Dict[str, Any], context: Any) -> Dict:
    """メインハンドラー関数"""
    try:
        http_method = event.get('httpMethod', '').upper()
        resource = event.get('resource', '')
        path = event.get('path', '')

        logger.info(f"Agent handler: {http_method} {resource} ({path})")

        # 既存のチャット系ルート（/chat/rules以外を先に判定する）
        is_rules_path = '/chat/rules' in path

        if not is_rules_path:
            if http_method == 'POST' and '/chat' in path and '/history' not in path and '/models' not in path:
                return handle_chat(event, context)
            elif http_method == 'GET' and '/models' in path:
                return handle_get_models(event, context)
            elif http_method == 'GET' and '/history/' in path:
                return handle_get_history(event, context)
            elif http_method == 'DELETE' and '/history/' in path:
                return handle_delete_history(event, context)

        # 新規: ルール系ルート（resource で静的/動的を判別）
        if resource == '/chat/rules':
            if http_method == 'GET': return handle_rules_list(event, context)
            if http_method == 'POST': return handle_rules_create(event, context)
        if resource == '/chat/rules/preview' and http_method == 'GET':
            return handle_rules_preview(event, context)  # 次タスクで実装
        if resource == '/chat/rules/{ruleId}':
            if http_method == 'GET': return handle_rules_get(event, context)
            if http_method == 'PUT': return handle_rules_update(event, context)
            if http_method == 'DELETE': return handle_rules_delete(event, context)

        if http_method == 'OPTIONS':
            return format_response(200, {})

        return format_response(404, {'error': 'Not found'})

    except Exception as e:
        logger.error(f"Handler error: {e}")
        return format_response(500, {'error': str(e)})
```

> 注意: `handle_rules_preview` はTask 6で実装する。本タスクでは未定義のため `handler()` 内でNameErrorになる。Task 6を続けて実行するか、本タスクで仮スタブ `def handle_rules_preview(event, context): return format_response(501, {})` を入れる。**仮スタブ案で進める**:

```python
def handle_rules_preview(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/rules/preview - Task 6で本実装"""
    return format_response(501, {'error': 'Not implemented yet'})
```

- [ ] **Step 5: テストが通ることを確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_handler.TestRulesHandler -v
```

Expected: `Ran 10 tests / OK`

- [ ] **Step 6: コミット**

```bash
git add lambda/python/agent_handler.py test/lambda/test_agent_handler.py
git commit -m "feat(api): /chat/rules CRUDハンドラを追加（preview仮スタブ）"
```

---

## Task 6: handle_rules_preview の本実装

**Files:**
- Modify: `lambda/python/agent_handler.py`
- Modify: `test/lambda/test_agent_handler.py`

クエリ `?ruleIds=id1,id2` 任意。未指定時はアクティブルールのみ。

- [ ] **Step 1: テストを追加（test_agent_handler.py の TestRulesHandler クラスに）**

```python
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
    """アクティブルールが反映される"""
    from agent_handler import handler
    from rules_repository import RulesRepository
    repo = RulesRepository(self.TABLE_NAME)
    repo.create(name='active1', prompt='本文1', is_active=True)
    repo.create(name='inactive', prompt='本文2', is_active=False)

    resp = handler(self._event('GET', '/chat/rules/preview'), None)
    self.assertEqual(resp['statusCode'], 200)
    body = _json_for_rules.loads(resp['body'])
    self.assertEqual(body['ruleCount'], 1)
    self.assertIn('active1', body['fullPrompt'])
    self.assertNotIn('inactive', body['fullPrompt'])

def test_preview_with_ruleids_query(self):
    """ruleIdsクエリで指定ルールのみ反映"""
    from agent_handler import handler
    from rules_repository import RulesRepository
    repo = RulesRepository(self.TABLE_NAME)
    a = repo.create(name='a', prompt='p1', is_active=False)
    b = repo.create(name='b', prompt='p2', is_active=True)

    event = self._event('GET', '/chat/rules/preview')
    event['queryStringParameters'] = {'ruleIds': a['ruleId']}
    resp = handler(event, None)
    self.assertEqual(resp['statusCode'], 200)
    body = _json_for_rules.loads(resp['body'])
    self.assertEqual(body['ruleCount'], 1)
    self.assertIn('a', body['fullPrompt'])
    self.assertNotIn('### b', body['fullPrompt'])
```

- [ ] **Step 2: テストを走らせて失敗を確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_handler.TestRulesHandler.test_preview_no_rules -v
```

Expected: FAIL（501 Not implemented）

- [ ] **Step 3: handle_rules_preview を本実装**

`handle_rules_preview` の仮スタブを置き換え:

```python
def handle_rules_preview(event: Dict[str, Any], context: Any) -> Dict:
    """GET /chat/rules/preview - 結合済み system prompt のプレビュー"""
    from agent_prompts import build_full_prompt

    repo = _get_rules_repository()
    if repo is None:
        return format_response(500, {'error': 'RULES_TABLE not configured'})

    qs = event.get('queryStringParameters') or {}
    rule_ids_param = qs.get('ruleIds') or ''
    rule_ids = [r.strip() for r in rule_ids_param.split(',') if r.strip()]

    if rule_ids:
        rules = repo.batch_get(rule_ids)
    else:
        rules = repo.list_active()

    limits = _get_rule_limits()
    full_prompt = build_full_prompt(rules, [], limits)

    applied = [
        {'ruleId': r['ruleId'], 'name': r['name'], 'chars': len(r.get('prompt', ''))}
        for r in rules
    ]
    return format_response(200, {
        'fullPrompt': full_prompt,
        'appliedRules': applied,
        'totalChars': len(full_prompt),
        'ruleCount': len(rules),
        'limits': {
            'maxPromptChars': limits.max_prompt_chars,
            'maxCount': limits.max_count,
            'maxCombinedChars': limits.max_combined_chars,
        },
    })
```

- [ ] **Step 4: テストが通ることを確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_handler.TestRulesHandler -v
```

Expected: `Ran 13 tests / OK`

- [ ] **Step 5: コミット**

```bash
git add lambda/python/agent_handler.py test/lambda/test_agent_handler.py
git commit -m "feat(api): GET /chat/rules/preview で結合済みsystem promptを返す"
```

---

## Task 7: handle_chat に ruleIds / inlineRules サポートを追加

**Files:**
- Modify: `lambda/python/agent_handler.py`
- Modify: `test/lambda/test_agent_handler.py`

既存の `handle_chat` を最小変更で拡張。`create_agent` に `system_prompt` 引数を追加するためにシグネチャを変更する。

- [ ] **Step 1: 既存のテストが壊れないことを確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_handler -v
```

Expected: 既存テストは PASS

- [ ] **Step 2: 新しいテストを TestRulesHandler 末尾に追加**

```python
def test_chat_with_rule_ids(self):
    """POST /chat に ruleIds を含めると指定ルールが注入される（モック動作確認）"""
    from agent_handler import handler
    from rules_repository import RulesRepository
    repo = RulesRepository(self.TABLE_NAME)
    rule = repo.create(name='テストルール', prompt='テスト本文', is_active=False)

    # Bedrockをmockする必要があるため、create_agentレベルで動作確認する代替テスト
    # ここでは build_full_prompt が正しく呼ばれることのみ確認する単体結合テスト
    from agent_handler import _resolve_chat_system_prompt
    full_prompt = _resolve_chat_system_prompt(
        rule_ids=[rule['ruleId']],
        inline_rules=[],
    )
    self.assertIn('テストルール', full_prompt)
    self.assertIn('テスト本文', full_prompt)

def test_chat_with_inline_rules(self):
    """inlineRulesで保存前のドラフトが注入される"""
    from agent_handler import _resolve_chat_system_prompt
    full_prompt = _resolve_chat_system_prompt(
        rule_ids=None,
        inline_rules=[{'name': 'ドラフト', 'prompt': 'ドラフト本文'}],
    )
    self.assertIn('ドラフト', full_prompt)
    self.assertIn('ドラフト本文', full_prompt)

def test_chat_combines_rule_ids_and_inline(self):
    """ruleIdsとinlineRulesが両方注入される"""
    from agent_handler import _resolve_chat_system_prompt
    from rules_repository import RulesRepository
    repo = RulesRepository(self.TABLE_NAME)
    rule = repo.create(name='永続', prompt='永続本文', is_active=False)

    full_prompt = _resolve_chat_system_prompt(
        rule_ids=[rule['ruleId']],
        inline_rules=[{'name': 'ドラフト', 'prompt': 'ドラフト本文'}],
    )
    self.assertIn('永続', full_prompt)
    self.assertIn('ドラフト', full_prompt)

def test_chat_no_rules_returns_base_prompt(self):
    """ruleIds/inlineRules共に未指定でアクティブルールが0件のとき、base promptを返す"""
    from agent_handler import _resolve_chat_system_prompt
    from agent_prompts import SYSTEM_PROMPT
    full_prompt = _resolve_chat_system_prompt(rule_ids=None, inline_rules=[])
    self.assertEqual(full_prompt, SYSTEM_PROMPT)

def test_chat_oversize_inline_rule_rejected(self):
    """inlineRulesの本文が上限を超える場合は400を返す"""
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
```

- [ ] **Step 3: テストを走らせて失敗を確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_handler.TestRulesHandler.test_chat_with_rule_ids -v
```

Expected: `_resolve_chat_system_prompt` が未定義のためエラー

- [ ] **Step 4: agent_handler.py を拡張**

`create_agent` のシグネチャを変更（既存の呼び出しは互換維持）:

```python
def create_agent(model_id: str = None, system_prompt: str = None):
    """Strands Agentを初期化する（AWS Bedrock経由）"""
    from strands import Agent
    from strands.models.bedrock import BedrockModel
    from agent_tools import compose_images, generate_video, list_uploaded_images, delete_uploaded_image, get_help
    from agent_prompts import SYSTEM_PROMPT

    agent_model_id = model_id or DEFAULT_MODEL_ID
    model = BedrockModel(
        model_id=agent_model_id,
        max_tokens=4096,
        region_name=os.environ.get('BEDROCK_REGION', 'us-east-1'),
    )

    agent = Agent(
        model=model,
        system_prompt=system_prompt or SYSTEM_PROMPT,
        tools=[compose_images, generate_video, list_uploaded_images, delete_uploaded_image, get_help],
    )

    return agent
```

ヘルパー関数を追加（`handle_chat` の上に）:

```python
def _resolve_chat_system_prompt(
    rule_ids: Optional[list],
    inline_rules: list,
) -> str:
    """
    /chat 用に system_prompt を解決する。

    rule_ids: None または list of str
      - None: アクティブルール全件を適用
      - list: 指定IDのみ適用
    inline_rules: list of {name, prompt}
    """
    from agent_prompts import build_full_prompt
    from rules_validator import validate_single_prompt

    repo = _get_rules_repository()
    limits = _get_rule_limits()

    # inlineRulesの単体サイズ検証（呼び出し元で400に変換すべき例外を投げる）
    for r in inline_rules:
        validate_single_prompt(r.get('prompt', ''), limits)

    if repo is None:
        # RULES_TABLE未設定: ルールなしで動作
        return build_full_prompt([], inline_rules, limits)

    try:
        if rule_ids is not None:
            persisted = repo.batch_get(rule_ids) if rule_ids else []
        else:
            persisted = repo.list_active()
    except Exception as e:
        logger.warning(f"Failed to load rules, falling back to no rules: {e}")
        persisted = []

    return build_full_prompt(persisted, inline_rules, limits)
```

`handle_chat` の `create_agent(model_id)` 呼び出し前にルール解決ロジックを追加:

既存の以下:
```python
        # Agent実行（メディア結果をリセット）
        import agent_tools
        agent_tools._last_media_result = None
        agent = create_agent(model_id)
```

を以下に置換:
```python
        # ルール解決（任意フィールド）
        rule_ids = body.get('ruleIds')   # None or list
        inline_rules = body.get('inlineRules') or []

        # inlineRulesのバリデーション
        from rules_validator import RuleSizeError
        try:
            full_system_prompt = _resolve_chat_system_prompt(rule_ids, inline_rules)
        except RuleSizeError as e:
            return format_response(400, {
                'error': str(e),
                'requestId': request_id,
            })

        # Agent実行（メディア結果をリセット）
        import agent_tools
        agent_tools._last_media_result = None
        agent = create_agent(model_id, system_prompt=full_system_prompt)
```

- [ ] **Step 5: テストが通ることを確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest test.lambda.test_agent_handler -v
```

Expected: 全テスト PASS

- [ ] **Step 6: コミット**

```bash
git add lambda/python/agent_handler.py test/lambda/test_agent_handler.py
git commit -m "feat(api): POST /chatにruleIds/inlineRulesサポートを追加"
```

---

## Task 8: CDK - RulesTable / SeedBucket / Import の追加

**Files:**
- Modify: `lib/image-processor-api-stack.ts`

`ChatHistoryTable` 定義の直後に追加する。

- [ ] **Step 1: 必要なimport（既にあるかチェック）**

`lib/image-processor-api-stack.ts` の先頭を確認し、以下が無い場合は追加:

```typescript
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
```

`s3` は既存のはず。`s3deploy` は無ければ追加:

```bash
grep "s3-deployment" lib/image-processor-api-stack.ts || echo "ADD: s3deploy import needed"
```

- [ ] **Step 2: RulesTable 定義を追加**

`chatHistoryTable` 定義の直後（例: line 597 付近）に追加:

```typescript
    // DynamoDB テーブル（カスタムルールプロンプト）
    // S3 シードバケット（DynamoDB Native Import用）
    const rulesSeedBucket = new s3.Bucket(this, 'RulesSeedBucket', {
      bucketName: envName('imagecompositor-rules-seed', envConfig).toLowerCase(),
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    new s3deploy.BucketDeployment(this, 'DeployRulesSeed', {
      sources: [s3deploy.Source.asset('assets/seed-rules', {
        exclude: ['*.put.json'],  // put-item用ファイルはS3配置不要
      })],
      destinationBucket: rulesSeedBucket,
      destinationKeyPrefix: 'rules',
    });

    const rulesTable = new dynamodb.Table(this, 'RulesTable', {
      tableName: envName('ImageCompositor-Rules', envConfig),
      partitionKey: { name: 'ruleId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: envConfig.isProduction
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
      importSource: {
        compressionType: dynamodb.InputCompressionType.NONE,
        inputFormat: dynamodb.InputFormat.dynamoDBJson(),
        bucket: rulesSeedBucket,
        keyPrefix: 'rules/',
      },
    });
```

- [ ] **Step 3: agentFunction の environment に環境変数を追加**

`environment: {` ブロック内（CHAT_HISTORY_TABLE の隣）に追加:

```typescript
        RULES_TABLE: rulesTable.tableName,
        RULES_MAX_PROMPT_CHARS: '10000',
        RULES_MAX_COUNT: '5',
        RULES_MAX_COMBINED_CHARS: '20000',
```

- [ ] **Step 4: IAMポリシーを追加**

`chatHistoryTable.grantReadWriteData(agentFunction);` の直後に追加:

```typescript
    // RulesTable CRUD権限（最小権限）
    rulesTable.grantReadWriteData(agentFunction);
```

- [ ] **Step 5: cdk synth で構文確認**

```bash
ENVIRONMENT=dev npx cdk synth --context environment=dev > /tmp/cdk-synth.txt 2>&1
echo "Exit code: $?"
grep -E "(Error|RulesTable|RulesSeedBucket)" /tmp/cdk-synth.txt | head -10
```

Expected: エラーなし、`RulesTable` / `RulesSeedBucket` が出力される

- [ ] **Step 6: コミット**

```bash
git add lib/image-processor-api-stack.ts
git commit -m "feat(cdk): RulesTableとシードバケット・自動Importを追加"
```

---

## Task 9: CDK - API Gateway リソースとルート追加

**Files:**
- Modify: `lib/image-processor-api-stack.ts`

既存の `chatResource` の下に `/rules`, `/rules/preview`, `/rules/{ruleId}` を追加。

- [ ] **Step 1: chatResource 定義の下に rules リソースを追加**

`chatHistoryResource` の後ろ（API Gateway設定の最後の方）に追加:

```typescript
    // /chat/rules
    const rulesResource = chatResource.addResource('rules', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    rulesResource.addMethod('GET', agentLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        { statusCode: '200', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
        { statusCode: '500', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
      ],
    });

    rulesResource.addMethod('POST', agentLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        { statusCode: '201', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
        { statusCode: '400', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
        { statusCode: '500', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
      ],
    });

    // /chat/rules/preview （静的パスを {ruleId} より先に定義）
    const rulesPreviewResource = rulesResource.addResource('preview', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });
    rulesPreviewResource.addMethod('GET', agentLambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        { statusCode: '200', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
      ],
    });

    // /chat/rules/{ruleId}
    const ruleItemResource = rulesResource.addResource('{ruleId}', {
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'PUT', 'DELETE', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });
    for (const method of ['GET', 'PUT', 'DELETE'] as const) {
      ruleItemResource.addMethod(method, agentLambdaIntegration, {
        authorizationType: apigateway.AuthorizationType.NONE,
        methodResponses: [
          { statusCode: '200', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
          { statusCode: '204', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
          { statusCode: '400', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
          { statusCode: '403', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
          { statusCode: '404', responseParameters: { 'method.response.header.Access-Control-Allow-Origin': true } },
        ],
      });
    }
```

- [ ] **Step 2: cdk synth で確認**

```bash
ENVIRONMENT=dev npx cdk synth --context environment=dev > /tmp/cdk-synth.txt 2>&1
echo "Exit code: $?"
grep -E "(Error|chat/rules)" /tmp/cdk-synth.txt | head -20
```

Expected: エラーなし、`/chat/rules`, `/chat/rules/preview`, `/chat/rules/{ruleId}` が出力される

- [ ] **Step 3: コミット**

```bash
git add lib/image-processor-api-stack.ts
git commit -m "feat(cdk): /chat/rules系API Gatewayリソースを追加"
```

---

## Task 10: scripts/seed-rules.sh の作成

**Files:**
- Create: `scripts/seed-rules.sh`

- [ ] **Step 1: スクリプトを作成**

```bash
cat > scripts/seed-rules.sh <<'EOF'
#!/bin/bash
set -euo pipefail
# 既存テーブルへのデフォルトルール再投入・リセット
# Usage: ENVIRONMENT=dev ./scripts/seed-rules.sh [--overwrite]

ENV="${ENVIRONMENT:-dev}"

case "$ENV" in
  production) TABLE="ImageCompositor-Rules" ;;
  *)          TABLE="ImageCompositor-Rules-${ENV}" ;;
esac

OVERWRITE="false"
if [ "${1:-}" = "--overwrite" ]; then
  OVERWRITE="true"
fi

SEED_DIR="$(dirname "$0")/../assets/seed-rules"

if ! ls "$SEED_DIR"/*.put.json >/dev/null 2>&1; then
  echo "No *.put.json files in $SEED_DIR"
  exit 1
fi

for SEED_FILE in "$SEED_DIR"/*.put.json; do
  echo "Seeding: $SEED_FILE → $TABLE"
  if [ "$OVERWRITE" = "true" ]; then
    aws dynamodb put-item --table-name "$TABLE" --item file://"$SEED_FILE"
    echo "  → wrote (overwrite)"
  else
    if aws dynamodb put-item \
        --table-name "$TABLE" \
        --item file://"$SEED_FILE" \
        --condition-expression 'attribute_not_exists(ruleId)' 2>/dev/null; then
      echo "  → wrote (new)"
    else
      echo "  → skipped (already exists)"
    fi
  fi
done

echo "Done."
EOF
chmod +x scripts/seed-rules.sh
```

- [ ] **Step 2: 構文確認（dry-run、ENVIRONMENT=dev で AWSへは投入しない）**

```bash
bash -n scripts/seed-rules.sh && echo "Syntax OK"
```

Expected: `Syntax OK`

- [ ] **Step 3: コミット**

```bash
git add scripts/seed-rules.sh
git commit -m "feat(scripts): デフォルトルール再投入スクリプトを追加"
```

---

## Task 11: dev環境デプロイ・動作確認

**Files:** なし（環境への適用）

- [ ] **Step 1: dev環境にデプロイ**

```bash
source .env.local
ENVIRONMENT=dev ./scripts/deploy.sh
```

Expected: スタック更新成功（差分: RulesTable, RulesSeedBucket, /chat/rules系リソース）

- [ ] **Step 2: デフォルトルールがDynamoDBに自動投入されたことを確認**

```bash
aws dynamodb scan --table-name ImageCompositor-Rules-dev --query 'Items[].ruleId.S'
```

Expected: `["jaa-subtitle-handbook-v1"]` を含む

> もし投入されなかった場合（既にテーブルが存在しimportが走らない場合）:
> ```bash
> ENVIRONMENT=dev ./scripts/seed-rules.sh
> ```

- [ ] **Step 3: API Gateway URLを取得**

```bash
API_URL=$(aws cloudformation describe-stacks \
  --stack-name ImageProcessorApiStack-Dev \
  --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)
echo "API_URL=$API_URL"
```

- [ ] **Step 4: GET /chat/rules で一覧取得**

```bash
curl -s "$API_URL/chat/rules" | jq '.rules | length, .rules[0].ruleId'
```

Expected: `1` と `"jaa-subtitle-handbook-v1"`

- [ ] **Step 5: POST /chat/rules で新規作成**

```bash
curl -s -X POST "$API_URL/chat/rules" \
  -H 'Content-Type: application/json' \
  -d '{"name":"テストルール","prompt":"テスト本文","isActive":false}' | jq
```

Expected: `{"rule": {"ruleId": "<uuid>", "name": "テストルール", ...}}`

- [ ] **Step 6: GET /chat/rules/preview を確認**

```bash
curl -s "$API_URL/chat/rules/preview" | jq '.ruleCount, .totalChars'
```

Expected: `1`（JAAアクティブ）と数値

- [ ] **Step 7: DELETE がデフォルトルールでは403になることを確認**

```bash
curl -s -X DELETE "$API_URL/chat/rules/jaa-subtitle-handbook-v1" -w "\nHTTP %{http_code}\n"
```

Expected: `HTTP 403`

- [ ] **Step 8: コミットなし（環境への変更のみ、確認結果を次タスクのE2Eテスト整備に活用）**

---

## Task 12: API E2E テスト rules.api.spec.ts

**Files:**
- Create: `test/e2e/rules.api.spec.ts`

既存 `chat-agent.api.spec.ts` を参考に Playwright API テストを作成。

- [ ] **Step 1: 既存パターンを参照**

```bash
head -40 test/e2e/chat-agent.api.spec.ts
```

- [ ] **Step 2: rules.api.spec.ts を作成**

```typescript
import { test, expect } from '@playwright/test';

const API_URL = process.env.CHAT_API_URL || process.env.API_URL || '';
if (!API_URL) {
  throw new Error('CHAT_API_URL or API_URL env var is required');
}

const BASE = API_URL.replace(/\/$/, '');

test.describe('Rules API', () => {
  let createdRuleId: string;

  test('GET /chat/rules でデフォルトルールが返る', async ({ request }) => {
    const resp = await request.get(`${BASE}/chat/rules`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.rules.length).toBeGreaterThan(0);
    const jaa = body.rules.find((r: any) => r.ruleId === 'jaa-subtitle-handbook-v1');
    expect(jaa).toBeDefined();
    expect(jaa.isDefault).toBe(true);
  });

  test('POST /chat/rules で新規作成できる', async ({ request }) => {
    const resp = await request.post(`${BASE}/chat/rules`, {
      data: { name: `e2e-${Date.now()}`, prompt: 'E2E本文', isActive: false },
    });
    expect(resp.status()).toBe(201);
    const body = await resp.json();
    expect(body.rule.name).toMatch(/^e2e-/);
    expect(body.rule.isDefault).toBe(false);
    createdRuleId = body.rule.ruleId;
  });

  test('GET /chat/rules/{ruleId} で取得できる', async ({ request }) => {
    const resp = await request.get(`${BASE}/chat/rules/${createdRuleId}`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.rule.ruleId).toBe(createdRuleId);
  });

  test('PUT /chat/rules/{ruleId} で更新できる', async ({ request }) => {
    const resp = await request.put(`${BASE}/chat/rules/${createdRuleId}`, {
      data: { isActive: true },
    });
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.rule.isActive).toBe(true);
  });

  test('GET /chat/rules/preview で結合プロンプトが取得できる', async ({ request }) => {
    const resp = await request.get(`${BASE}/chat/rules/preview`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body).toHaveProperty('fullPrompt');
    expect(body).toHaveProperty('appliedRules');
    expect(body).toHaveProperty('totalChars');
    expect(body).toHaveProperty('limits');
    expect(body.limits.maxPromptChars).toBeGreaterThan(0);
  });

  test('GET /chat/rules/preview?ruleIds=xxx で指定ルールのみ反映', async ({ request }) => {
    const resp = await request.get(`${BASE}/chat/rules/preview?ruleIds=${createdRuleId}`);
    expect(resp.status()).toBe(200);
    const body = await resp.json();
    expect(body.appliedRules.length).toBe(1);
    expect(body.appliedRules[0].ruleId).toBe(createdRuleId);
  });

  test('POST /chat/rules で本文超過は400', async ({ request }) => {
    const resp = await request.post(`${BASE}/chat/rules`, {
      data: { name: 'oversize', prompt: 'a'.repeat(20000) },
    });
    expect(resp.status()).toBe(400);
  });

  test('DELETE デフォルトルールは403', async ({ request }) => {
    const resp = await request.delete(`${BASE}/chat/rules/jaa-subtitle-handbook-v1`);
    expect(resp.status()).toBe(403);
  });

  test('GET /chat/rules/{ruleId} で存在しないIDは404', async ({ request }) => {
    const resp = await request.get(`${BASE}/chat/rules/nonexistent-uuid`);
    expect(resp.status()).toBe(404);
  });

  test('DELETE 作成したルールは204', async ({ request }) => {
    const resp = await request.delete(`${BASE}/chat/rules/${createdRuleId}`);
    expect(resp.status()).toBe(204);
  });
});
```

- [ ] **Step 3: テストを実行**

```bash
CHAT_API_URL="$API_URL" npx playwright test --config=test/playwright-api.config.ts test/e2e/rules.api.spec.ts
```

Expected: 全テスト PASS

- [ ] **Step 4: コミット**

```bash
git add test/e2e/rules.api.spec.ts
git commit -m "test(api): /chat/rules E2Eテストを追加"
```

---

## Task 13: chat-agent.api.spec.ts に inlineRules テストを追加

**Files:**
- Modify: `test/e2e/chat-agent.api.spec.ts`

実Bedrockを叩くためコストがかかる。**1ケースに絞り**、リクエストが400/200で正しく分岐することのみ確認する（応答内容の検証は行わない）。

- [ ] **Step 1: 既存ファイルを確認**

```bash
tail -30 test/e2e/chat-agent.api.spec.ts
```

- [ ] **Step 2: 末尾に追加**

```typescript
test.describe('POST /chat - inlineRules support', () => {
  test('inlineRules付きリクエストが200で受理される（簡易確認）', async ({ request }) => {
    const resp = await request.post(`${BASE}/chat`, {
      data: {
        sessionId: '12345678-1234-1234-1234-123456789012',
        message: 'Hello',
        inlineRules: [{ name: 'test-draft', prompt: 'シンプルなテストルール本文' }],
      },
    });
    expect(resp.status()).toBe(200);
  });

  test('inlineRulesの本文超過は400', async ({ request }) => {
    const resp = await request.post(`${BASE}/chat`, {
      data: {
        sessionId: '12345678-1234-1234-1234-123456789012',
        message: 'Hello',
        inlineRules: [{ name: 'oversize', prompt: 'a'.repeat(20000) }],
      },
    });
    expect(resp.status()).toBe(400);
  });
});
```

> 注意: 既存テストの `BASE` 変数名・import文を確認し、衝突しないよう調整する。

- [ ] **Step 3: テストを実行**

```bash
CHAT_API_URL="$API_URL" npx playwright test --config=test/playwright-api.config.ts \
  --grep "inlineRules support"
```

Expected: 2 passed

- [ ] **Step 4: コミット**

```bash
git add test/e2e/chat-agent.api.spec.ts
git commit -m "test(api): inlineRulesサポートのE2Eテストを追加"
```

---

## Task 14: tasks.md のチェックボックス更新 + PR作成

**Files:**
- Modify: `.kiro/specs/custom-rules-prompt/tasks.md`

- [ ] **Step 1: tasks.md のIssue #8 タスク（タスク1〜11）のチェックボックスを `[x]` に更新**

タスク1.1〜11.4まで全て `[x]` に。`sed -i 's/- \[ \]/- [x]/g'` は他セクションも書き換えるため、Issue #8セクションのみ編集する:

```bash
# 手動で .kiro/specs/custom-rules-prompt/tasks.md を編集
# タスク12〜21（Issue #9）は触らない
```

- [ ] **Step 2: 全ローカルテストが通ることを最終確認**

```bash
PYTHONPATH=lambda/python python3 -m unittest discover -s test/lambda
```

Expected: 全PASS

- [ ] **Step 3: PR用の差分概要を確認**

```bash
git log --oneline dev..HEAD
git diff --stat dev..HEAD
```

- [ ] **Step 4: ブランチをpush**

```bash
git push -u origin feature/issue8-custom-rules-api
```

- [ ] **Step 5: PR作成**

```bash
gh pr create --base dev --title "feat(api): カスタムルールプロンプト対応 — system promptへの表現規定注入 (#8)" --body "$(cat <<'EOF'
## 概要

issue #8 を解決。Strands Agent の system prompt にカスタムルールを動的注入する機能を追加する。

仕様: [.kiro/specs/custom-rules-prompt/](../tree/feature/issue8-custom-rules-api/.kiro/specs/custom-rules-prompt/)

## 主な変更

- DynamoDB `ImageCompositor-Rules` テーブル新設（PK: ruleId、PAY_PER_REQUEST）
- DynamoDB Native Import から S3 のシードでデフォルトルール（JAA字幕ハンドブック準拠）を自動投入
- `/chat/rules` CRUD API（GET/POST/PUT/DELETE）+ `/chat/rules/preview` 追加
- `POST /chat` に `ruleIds` / `inlineRules` 任意フィールドを追加（後方互換）
- サイズ・件数ガード（環境変数で上書き可: `RULES_MAX_PROMPT_CHARS=10000`, `RULES_MAX_COUNT=5`, `RULES_MAX_COMBINED_CHARS=20000`）
- 補助スクリプト `scripts/seed-rules.sh`（既存テーブルへの再投入・リセット用）

## 受入基準（requirements.md Req 1-7, 13）

- [x] AC 1.1〜1.5: RulesTable定義
- [x] AC 2.1〜2.8: CRUD API
- [x] AC 3.1〜3.5: system prompt注入
- [x] AC 4.1〜4.4: inlineRules
- [x] AC 5.1〜5.4: サイズ・件数ガード
- [x] AC 6.1〜6.6: デフォルトルール（JAA）
- [x] AC 7.1〜7.6: CDK
- [x] AC 13.1〜13.4, 13.6: テスト

## テスト計画

### Lambda単体（moto）
- `test/lambda/test_rules_validator.py`: ガード
- `test/lambda/test_rules_repository.py`: CRUD・デフォルト保護・UUID
- `test/lambda/test_agent_prompts.py`: build_full_prompt
- `test/lambda/test_agent_handler.py`: ハンドラ・ルーティング・preview reject

### API E2E
- `test/e2e/rules.api.spec.ts`: CRUD・preview・バリデーション・デフォルト保護
- `test/e2e/chat-agent.api.spec.ts`: inlineRules適用

### 動作確認
- dev環境にデプロイ済み、デフォルトルールが自動投入されることを確認
- curl で全エンドポイント疎通確認

## 後続

issue #9（管理画面UI）が本PRに依存。本PRマージ後に着手予定。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL が出力される

- [ ] **Step 6: PRレビュー対応**

レビュー指摘事項があれば対応してコミット。マージ後、Task 11.3 (worktree削除) を実行:

```bash
cd /home/pi/develop/image-composite-agent
git worktree remove ../image-composite-agent-issue8
```

---

## Self-Review チェック

### 1. Spec coverage（requirements.md の各Reqと対応するタスク）

| Req | 受入基準 | 対応タスク |
|---|---|---|
| Req 1 | DynamoDBテーブル属性 | Task 8 |
| Req 2 | CRUD API 6種 | Task 5, 6 |
| Req 3 | system prompt注入 | Task 3, 7 |
| Req 4 | inlineRules | Task 7 |
| Req 5 | サイズ・件数ガード | Task 2, 5, 7 |
| Req 6 | JAAデフォルトルール | Task 1, 8, 10 |
| Req 7 | CDK定義 | Task 8, 9 |
| Req 13 | テスト | Task 2-7（ユニット）、Task 12-13（E2E） |

✅ 全Req カバー

### 2. Placeholder scan

- [x] "TBD/TODO/implement later" — 含まない
- [x] "Add appropriate error handling" — 全ての例外処理を具体的に記述
- [x] "Write tests for the above" — 全テストコードを具体的に提示
- [x] "Similar to Task N" — 全タスクで完結したコードを再記述

### 3. Type/identifier consistency

- `RulesRepository` クラス名: Task 4で定義、Task 5/6/7/12 で使用 ✅
- `build_full_prompt(rules, inline_rules, limits)` シグネチャ: Task 3で定義、Task 6/7 で使用 ✅
- `_resolve_chat_system_prompt(rule_ids, inline_rules)`: Task 7 で定義・使用 ✅
- `RuleLimits.from_env(env)` クラスメソッド: Task 2 で定義、Task 5/6/7 で `_get_rule_limits()` 経由で使用 ✅
- 環境変数名 `RULES_TABLE`, `RULES_MAX_PROMPT_CHARS` 等: 全ファイルで一致 ✅
- テーブル名 `ImageCompositor-Rules-{env}`: Task 8 (CDK) と Task 10 (シードスクリプト) で一致 ✅
- API path `/chat/rules`, `/chat/rules/preview`, `/chat/rules/{ruleId}`: Task 5/6/7 (Lambda)、Task 9 (CDK)、Task 12 (E2E) で一致 ✅

### 4. 注意点

- Task 5の `handle_rules_preview` は仮スタブで開始し、Task 6で本実装。スタブ存在中もハンドラのテスト全体は通るよう設計済み
- `moto` インストールが既存環境に無い場合、Task 4のStep 2に `pip install moto` を含めている
- `scripts/seed-rules.sh` は実際に動かすのは Task 11 で（環境次第）

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-issue8-custom-rules-api.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 各タスクごとに新しいsubagentをdispatch、タスク間でレビュー、迅速な反復

**2. Inline Execution** - 本セッション内で executing-plans を使って一括実行、チェックポイントでレビュー

**どちらで進めますか？**
