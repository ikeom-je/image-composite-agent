# カスタムルールプロンプト機能 - 設計書

## 0. 関連ドキュメント

- [requirements.md](requirements.md) — 本機能の要件定義
- [tasks.md](tasks.md) — 実装タスク + 作業フロー別チェックリスト
- [../strands-agent/design.md](../strands-agent/design.md) — Agent基盤設計（前提）

---

## 1. システムアーキテクチャ

```
┌──────────────────────┐      GET/POST/PUT/DELETE /chat/rules     ┌─────────────────────┐
│  Frontend            │  ──────────────────────────────────────► │  Agent Lambda       │
│  - ChatPage.vue      │                                          │  (Python 3.12)      │
│  - SettingsPage.vue  │  ◄────────────────────────────────────── │  agent_handler.py   │
│  (Vue 3 + Pinia)     │      POST /chat (ruleIds / inlineRules)   └────┬──────┬─────────┘
└──────────────────────┘                                                │      │
                                                                        │      │
                                       ┌────────────────────────────────┘      │
                                       ▼                                       ▼
                              ┌────────────────┐                    ┌───────────────────┐
                              │  DynamoDB      │                    │  AWS Bedrock      │
                              │  RulesTable    │                    │  Claude Sonnet 4.5│
                              │  (PK: ruleId)  │                    └───────────────────┘
                              └───────┬────────┘
                                      │  Initial Import (Native)
                                      │
                              ┌─────────────────────┐
                              │  S3 Seed Bucket     │
                              │  jaa-rule.import.   │
                              │  jsonl              │
                              └─────────────────────┘
```

---

## 2. データモデル

### 2.1 RulesTable（DynamoDB）

| 属性 | 型 | 説明 |
|---|---|---|
| `ruleId` (PK) | String | UUID v4 / デフォルトのみ固定 `jaa-subtitle-handbook-v1` |
| `name` | String | 表示名（最大100字） |
| `prompt` | String | Markdown本文（最大10,000字） |
| `isDefault` | Boolean | true=削除不可（無効化のみ可） |
| `isActive` | Boolean | true=ruleIds未指定時のsystem promptに自動注入 |
| `createdAt` | String | ISO8601 |
| `updatedAt` | String | ISO8601 |

- `BillingMode`: `PAY_PER_REQUEST`
- TTL: 設定なし（永続化）
- `removalPolicy`: dev/staging=`DESTROY`、production=`RETAIN`
- 環境別テーブル名: `envName('ImageCompositor-Rules', envConfig)` で生成（既存`ImageCompositor-ChatHistory`命名パターンと統一）。実物理名は `ImageCompositor-Rules-dev` / `ImageCompositor-Rules-staging` / `ImageCompositor-Rules`（production）

### 2.2 シードデータ（2ファイル運用）

DynamoDB Import 用と `aws dynamodb put-item` 用でJSON形式が異なるため、2ファイルで管理する:

```
assets/seed-rules/
├── jaa-rule.import.jsonl   # DynamoDB Native Import 用（ND-JSON形式）
└── jaa-rule.put.json       # scripts/seed-rules.sh の put-item 用（属性のみ）
```

#### `jaa-rule.import.jsonl`（Import用、ND-JSON / JSON Lines）

DynamoDB Import from S3 は **ND-JSON（改行区切りJSON、1行=1Item）** 形式を要求する。1Item = `{"Item": {属性...}}` を1行で記述。複数Itemを増やす場合は改行を追加する:

```jsonl
{"Item":{"ruleId":{"S":"jaa-subtitle-handbook-v1"},"name":{"S":"JAA字幕ハンドブック準拠 配置規定"},"prompt":{"S":"## 字幕・テロップ配置ルール\n（PDFから抽出した規定本文）\n..."},"isDefault":{"BOOL":true},"isActive":{"BOOL":true},"createdAt":{"S":"2026-05-04T00:00:00Z"},"updatedAt":{"S":"2026-05-04T00:00:00Z"}}
```

- 拡張子は `.jsonl`（または `.json` でも動作するが ND-JSON である旨を明示するため `.jsonl` 推奨）
- 本機能は当面1ルール（JAA）のみだが、将来の追加に備えて ND-JSON で記述
- 圧縮（GZIP/ZSTD）は使用しない（1ルールでサイズが小さく、git diff レビューを優先）

#### `jaa-rule.put.json`（put-item用、属性のみ）

`aws dynamodb put-item --item file://...` は **`Item` キーで包まないルートに属性を直接置く**形式を要求する。Import用と内容を二重管理する代わりに、ビルドスクリプトで `jq '.Item'` を使って動的生成する手もあるが、明示的に2ファイル持つことでレビュー容易性を優先する:

```json
{
  "ruleId": { "S": "jaa-subtitle-handbook-v1" },
  "name": { "S": "JAA字幕ハンドブック準拠 配置規定" },
  "prompt": { "S": "## 字幕・テロップ配置ルール\n（PDFから抽出した規定本文）\n..." },
  "isDefault": { "BOOL": true },
  "isActive": { "BOOL": true },
  "createdAt": { "S": "2026-05-04T00:00:00Z" },
  "updatedAt": { "S": "2026-05-04T00:00:00Z" }
}
```

- 2ファイル間の整合性は `scripts/build-seed-rules.sh`（任意）または PR レビューで担保する
- 本文 (`prompt`) はPDFから画像合成に関連する規定（Req 6.3 参照）を抽出してMarkdownで記述

---

## 3. API設計

### 3.1 GET /chat/rules — 一覧取得

**Response**:
```json
{
  "rules": [
    {
      "ruleId": "jaa-subtitle-handbook-v1",
      "name": "JAA字幕ハンドブック準拠 配置規定",
      "prompt": "## 字幕・テロップ配置ルール\n...",
      "isDefault": true,
      "isActive": true,
      "createdAt": "2026-05-04T00:00:00Z",
      "updatedAt": "2026-05-04T00:00:00Z"
    }
  ]
}
```

### 3.2 GET /chat/rules/{ruleId} — 個別取得

**Response (200)**: `{ "rule": Rule }`
**Response (404)**: `{ "error": "Rule not found" }`

### 3.3 POST /chat/rules — 新規作成

**Request**:
```json
{
  "name": "案件Aの配置規定",
  "prompt": "## 配置\n左下20%以内...",
  "isActive": false
}
```

**Response (201)**: `{ "rule": Rule }`（`ruleId` は UUID v4 自動採番、`isDefault=false`、`createdAt/updatedAt` は現在時刻）

**バリデーション**:
- `name` 必須、1〜100字
- `prompt` 必須、1〜`RULES_MAX_PROMPT_CHARS` (default 10,000) 字
- `isActive` 任意、デフォルト `false`

### 3.4 PUT /chat/rules/{ruleId} — 更新

**Request**: `{ "name"?, "prompt"?, "isActive"? }`（部分更新）
**Response (200)**: `{ "rule": Rule }`（`updatedAt` は現在時刻に更新）
**Response (404)**: `{ "error": "Rule not found" }`

### 3.5 DELETE /chat/rules/{ruleId} — 削除

**Response (204)**: No Content
**Response (403)**: `{ "error": "Default rule cannot be deleted" }`（`isDefault=true` の場合）
**Response (404)**: `{ "error": "Rule not found" }`

### 3.6 GET /chat/rules/preview — 結合済みプロンプトプレビュー

**Query**: `?ruleIds=id1,id2`（任意。未指定時は `isActive=true` のルールを対象）

**Response (200)**:
```json
{
  "fullPrompt": "<base SYSTEM_PROMPT + 結合ルール>",
  "appliedRules": [
    { "ruleId": "...", "name": "...", "chars": 2300 }
  ],
  "totalChars": 8421,
  "ruleCount": 2,
  "limits": {
    "maxPromptChars": 10000,
    "maxCount": 5,
    "maxCombinedChars": 20000
  }
}
```

### 3.7 POST /chat — 既存エンドポイントの拡張

**Request（追加フィールド）**:
```json
{
  "sessionId": "uuid-v4",
  "message": "テロップを下部に配置して",
  "ruleIds": ["jaa-subtitle-handbook-v1"],         // 任意
  "inlineRules": [{ "name": "draft", "prompt": "..." }]  // 任意（テスト送信用）
}
```

- `ruleIds` 未指定: アクティブルール全件適用
- `ruleIds` 指定: 指定IDのみ（アクティブ無視）
- `inlineRules` は永続ルールと結合可
- ガード超過時は400（後述）

レスポンス形式は既存と同一（変更なし）。

---

## 4. Agent Lambda 実装設計

### 4.1 ファイル構成（追加・変更）

```
lambda/python/
├── agent_handler.py        # 拡張: /chat/rules ルーティング、/chat の ruleIds/inlineRules ハンドリング
├── agent_prompts.py        # 拡張: build_full_prompt() 追加
├── rules_repository.py     # 新規: RulesTable CRUD
├── rules_validator.py      # 新規: サイズ・件数ガード
└── ...
```

### 4.2 rules_repository.py

```python
"""
RulesTable CRUD ラッパ。
"""

class RulesRepository:
    def __init__(self, table_name: str): ...
    def list(self) -> list[Rule]: ...
    def get(self, rule_id: str) -> Rule | None: ...
    def create(self, name: str, prompt: str, is_active: bool) -> Rule: ...
    def update(self, rule_id: str, **fields) -> Rule: ...
    def delete(self, rule_id: str) -> None: ...   # default rule なら raise DefaultRuleProtected
    def list_active(self) -> list[Rule]: ...      # isActive=true のみ
```

### 4.3 rules_validator.py

```python
"""
サイズ・件数ガード。環境変数で上書き可能。
"""

@dataclass
class RuleLimits:
    max_prompt_chars: int        # RULES_MAX_PROMPT_CHARS, default 10000
    max_count: int               # RULES_MAX_COUNT, default 5
    max_combined_chars: int      # RULES_MAX_COMBINED_CHARS, default 20000

def validate_single(prompt: str, limits: RuleLimits) -> None: ...
def truncate_combined(rules: list[Rule], limits: RuleLimits) -> list[Rule]: ...
```

### 4.4 agent_prompts.py（拡張）

```python
def build_full_prompt(
    rules: list[Rule],
    inline_rules: list[InlineRule],
    limits: RuleLimits,
) -> str:
    combined = rules + inline_rules
    combined = truncate_combined(combined, limits)
    if not combined:
        return SYSTEM_PROMPT

    section = "\n\n## 表現規定ルール\n以下のルールを必ず遵守して画像を配置してください:\n\n"
    section += "\n\n".join(f"### {r.name}\n{r.prompt}" for r in combined)
    return SYSTEM_PROMPT + section
```

### 4.5 agent_handler.py（拡張）

```python
def handler(event, context):
    method = event["httpMethod"]
    path = event["resource"]   # API Gatewayリソースパス

    # 既存ルート
    if path == "/chat" and method == "POST":      return handle_chat(event)
    if path == "/chat/history/{sessionId}":       return handle_history(event)

    # 新規ルート
    if path == "/chat/rules" and method == "GET": return handle_rules_list(event)
    if path == "/chat/rules" and method == "POST":return handle_rules_create(event)
    if path == "/chat/rules/{ruleId}":            return handle_rules_item(event)  # GET/PUT/DELETE
    if path == "/chat/rules/preview":             return handle_rules_preview(event)
    ...

def handle_chat(event):
    body = json.loads(event["body"])
    rule_ids   = body.get("ruleIds")
    inline     = body.get("inlineRules", [])

    repo = RulesRepository(os.environ["RULES_TABLE"])
    rules = repo.batch_get(rule_ids) if rule_ids else repo.list_active()
    inline_rules = [InlineRule(**r) for r in inline]

    full_prompt = build_full_prompt(rules, inline_rules, get_limits())

    agent = create_agent(system_prompt=full_prompt)
    ...
```

### 4.6 ルール取得キャッシュ

- Lambdaインスタンス内グローバル変数 `_rules_cache: dict[str, tuple[float, list[Rule]]]` で保持
- TTL 10秒（短く設定し、編集後の即時反映を許容）
- キーは「アクティブ全件」: `"__active__"`、「ID指定」: ソート済み `","` 連結

---

## 5. CDKインフラストラクチャ

### 5.1 RulesTable 定義

```typescript
const rulesTable = new dynamodb.Table(this, 'RulesTable', {
  tableName: envName('ImageCompositor-Rules', envConfig),
  partitionKey: { name: 'ruleId', type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: envConfig.isProduction
    ? cdk.RemovalPolicy.RETAIN
    : cdk.RemovalPolicy.DESTROY,
  importSource: {
    inputFormat: dynamodb.InputFormat.dynamoDBJson(),
    bucket: seedBucket,
    keyPrefix: 'rules/',
  },
});
```

### 5.2 BucketDeployment（シードJSON配置）

```typescript
const seedBucket = new s3.Bucket(this, 'RulesSeedBucket', {
  removalPolicy: RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});

// Import用の .jsonl のみ配置（put-item用 .put.json は配置しない）
new s3deploy.BucketDeployment(this, 'DeployRulesSeed', {
  sources: [s3deploy.Source.asset('assets/seed-rules', {
    exclude: ['*.put.json'],
  })],
  destinationBucket: seedBucket,
  destinationKeyPrefix: 'rules',
});
```

> 注意: `BucketDeployment` は内部的にCustom Resource（カスタムLambda）を使用するが、CDK標準提供のため独自Lambdaコンテナビルドは発生しない。

### 5.3 API Gateway リソース追加

```
/chat
  /history
    /{sessionId}     [GET, DELETE]
  /rules             [GET, POST]            ← 新規
    /preview         [GET]                  ← 新規（{ruleId}より先に定義）
    /{ruleId}        [GET, PUT, DELETE]     ← 新規
```

> ⚠️ **パス優先順位の注意**: API Gatewayは静的パス（`preview`）をパスパラメータ（`{ruleId}`）より優先するが、CDKでは**親リソースに `addResource('preview')` を `addResource('{ruleId}')` より先に呼ぶこと**で意図を明示する。順序を逆にすると誤って `{ruleId}=preview` でハンドラに到達するパターンを作り得る（アプリ側でも `ruleId == "preview"` をrejectする防御を入れる）。

全て `AuthorizationType.NONE`、CORS設定は既存と統一。

### 5.4 IAMポリシー（最小権限）

Agent Lambda のロールに以下を追加:

```typescript
agentFunction.addToRolePolicy(new iam.PolicyStatement({
  actions: [
    'dynamodb:GetItem',
    'dynamodb:PutItem',
    'dynamodb:UpdateItem',
    'dynamodb:DeleteItem',
    'dynamodb:Scan',
    'dynamodb:BatchGetItem',
  ],
  resources: [rulesTable.tableArn],
}));
```

### 5.5 環境変数

`agentFunction` に追加:
- `RULES_TABLE`: テーブル名
- `RULES_MAX_PROMPT_CHARS`: 10000
- `RULES_MAX_COUNT`: 5
- `RULES_MAX_COMBINED_CHARS`: 20000

---

## 6. 初期データ投入（A+B ハイブリッド）

### A: DynamoDB Native Import from S3（初回のみ）

- `BucketDeployment` で `assets/seed-rules/` を S3 へ配置
- `Table` の `importSource` で初回テーブル作成時に DynamoDB がS3からimport
- **コンテナビルド不要、デプロイ速度に影響なし**

### B: scripts/seed-rules.sh（再投入・リセット用）

put-item用の `*.put.json` を読み込んで投入する:

```bash
#!/bin/bash
set -euo pipefail
# 既存テーブルへのデフォルトルール再投入・リセット
# Usage: ENVIRONMENT=dev ./scripts/seed-rules.sh [--overwrite]

ENV="${ENVIRONMENT:-dev}"
# 既存命名規則 envName('ImageCompositor-Rules', envConfig) と一致させる
# production → suffix無し、それ以外 → -<env>
case "$ENV" in
  production) TABLE="ImageCompositor-Rules" ;;
  *)          TABLE="ImageCompositor-Rules-${ENV}" ;;
esac

OVERWRITE="false"
if [ "${1:-}" = "--overwrite" ]; then
  OVERWRITE="true"
fi

for SEED_FILE in assets/seed-rules/*.put.json; do
  echo "Seeding: $SEED_FILE → $TABLE"
  if [ "$OVERWRITE" = "true" ]; then
    aws dynamodb put-item --table-name "$TABLE" --item file://"$SEED_FILE"
  else
    # 冪等: 既存があれば挿入しない
    aws dynamodb put-item \
      --table-name "$TABLE" \
      --item file://"$SEED_FILE" \
      --condition-expression 'attribute_not_exists(ruleId)' \
      || echo "  → skipped (already exists)"
  fi
done
```

- 入力ファイルは `*.put.json`（`Item` キーで包まない属性ルートのファイル）
- デフォルト動作: 既存があれば挿入しない（冪等）
- `--overwrite` オプション: 既存を上書き（デフォルトリセット）
- 環境別テーブル名は CDK の命名規則と一致させる（`RulesTable-{Dev|Staging}` / `RulesTable`）

---

## 7. フロントエンド設計

### 7.1 ファイル構成

```
frontend/src/
├── pages/
│   └── SettingsPage.vue              # 新規: 設定画面メイン
├── components/settings/
│   ├── RuleList.vue                  # 新規: ルール一覧（カード）
│   ├── RuleListItem.vue              # 新規: ルール1件カード
│   ├── RuleEditor.vue                # 新規: 編集フォーム（モーダル/ドロワー）
│   ├── PromptPreview.vue             # 新規: 結合済みプロンプト表示
│   └── DraftBanner.vue               # 新規: ChatPage表示用ドラフト適用バナー
├── types/
│   └── rules.ts                      # 新規: Rule / InlineRule / RulesPreview の型定義
├── stores/
│   └── rules.ts                      # 新規: Pinia store
├── composables/
│   └── useRulesApi.ts                # 新規: API ラッパ
├── components/AppShell.vue           # 変更: ナビゲーションにSettingsタブ追加
├── pages/ChatPage.vue                # 変更: ドラフトバナー表示・inlineRules送信
└── router/index.ts                   # 変更: /settings ルート追加
```

#### types/rules.ts（型定義）

API契約と1:1対応する型をここに集約し、`stores/rules.ts` / `composables/useRulesApi.ts` / 各コンポーネントから import する:

```typescript
export interface Rule {
  ruleId: string;
  name: string;
  prompt: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;  // ISO8601
  updatedAt: string;  // ISO8601
}

export interface InlineRule {
  name: string;
  prompt: string;
}

export interface RulesPreviewResponse {
  fullPrompt: string;
  appliedRules: { ruleId: string; name: string; chars: number }[];
  totalChars: number;
  ruleCount: number;
  limits: { maxPromptChars: number; maxCount: number; maxCombinedChars: number };
}

export interface RuleDraft {
  name: string;
  prompt: string;
}
```

### 7.2 stores/rules.ts（Pinia）

```typescript
export const useRulesStore = defineStore('rules', {
  state: () => ({
    rules: [] as Rule[],
    loading: false,
    error: null as string | null,
    selectedId: null as string | null,
    draftDirty: false,
  }),
  actions: {
    async fetchAll() { ... },
    async create(input) { ... },
    async update(id, patch) { ... },
    async remove(id) { ... },
    async fetchPreview(ruleIds?: string[]) { ... },
  },
});
```

### 7.3 SettingsPage 構成（テキストワイヤフレーム）

```
┌─────────────────────────────────────────────────────────────────┐
│ Settings                                            [+ 新規作成]│
├──────────────────────────────────┬──────────────────────────────┤
│ ルール一覧                       │ 編集中: 案件Aの配置規定      │
│                                  │                              │
│ ┌──────────────────────────────┐ │ 名前: [____________________] │
│ │ ✅ JAA字幕ハンドブック準拠   │ │                              │
│ │ [デフォルト] [Active: ON]    │ │ 本文 [プレビュー]            │
│ │ 更新: 2026-05-04             │ │ ┌──────────────────────────┐ │
│ │ ## 字幕・テロップ配置ルール..│ │ │ ## 字幕配置...           │ │
│ └──────────────────────────────┘ │ │                          │ │
│                                  │ │                          │ │
│ ┌──────────────────────────────┐ │ │                          │ │
│ │ 案件Aの配置規定              │ │ └──────────────────────────┘ │
│ │ [Active: OFF]                │ │ 文字数: 2,341 / 10,000       │
│ │ 更新: 2026-05-03             │ │                              │
│ │ ## 配置\n左下20%以内...      │ │ [テスト送信] [削除] [保存]   │
│ └──────────────────────────────┘ │                              │
│                                  │                              │
├──────────────────────────────────┴──────────────────────────────┤
│ 現在のSystem Prompt（基本 + アクティブルール結合）              │
│ ルール数: 1, 文字数: 5,234                                       │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ あなたは画像合成アシスタントです...                         │ │
│ │ ## 表現規定ルール                                           │ │
│ │ ### JAA字幕ハンドブック準拠 配置規定                        │ │
│ │ ## 字幕・テロップ配置ルール...                              │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 7.4 テスト送信フロー

1. ユーザーが RuleEditor で本文編集
2. 「テスト送信」ボタン押下 → `localStorage.setItem('__rule_draft__', JSON.stringify({name, prompt}))` → `router.push('/chat-agent')`
3. ChatPage は mounted で localStorage を読み、`DraftBanner.vue` を表示
4. ChatPage の `useChatAgent.ts` は送信時にlocalStorageから読み込んで `inlineRules` に詰める
5. 「解除」ボタン or 会話リセットで `localStorage.removeItem('__rule_draft__')`

### 7.5 未保存変更の警告

```typescript
// RuleEditor.vue
onBeforeRouteLeave((to, from, next) => {
  if (rulesStore.draftDirty && !confirm('未保存の変更があります。破棄して移動しますか？')) {
    next(false);
  } else {
    next();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (rulesStore.draftDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
```

### 7.6 Markdownレンダラ

- `marked` を使用（軽量、依存薄）
- XSS対策: `marked` の `breaks: true, gfm: true` + `DOMPurify.sanitize()` でサニタイズしてから `v-html` で挿入

---

## 8. テスト方針

### 8.1 Lambda 単体テスト

| ファイル | テストケース |
|---|---|
| `test/lambda/test_rules_repository.py` | CRUD全パス、デフォルト保護、UUID採番 |
| `test/lambda/test_rules_validator.py` | 単一サイズ超過、件数超過、結合超過時の切り詰め |
| `test/lambda/test_agent_prompts.py`（拡張） | build_full_prompt: 0件/1件/上限超過/inline混在 |
| `test/lambda/test_agent_handler.py`（拡張） | /chat/rules 各メソッド、/chat の ruleIds/inlineRules 適用 |

### 8.2 API E2E テスト

| ファイル | テストケース |
|---|---|
| `test/e2e/rules.api.spec.ts` | CRUD、デフォルト削除拒否、preview、バリデーションエラー |
| `test/e2e/chat-agent.api.spec.ts`（拡張） | inlineRules適用時のシステムプロンプト挙動（メタ確認） |

### 8.3 フロントE2Eテスト

| ファイル | テストケース |
|---|---|
| `test/e2e/settings.spec.ts` | ナビ表示、一覧、編集、保存、トグル、削除確認、デフォルト保護、プレビュー表示、テスト送信→ChatPageバナー表示 |

---

## 9. デプロイ・運用

### 9.1 デプロイ手順

```bash
source .env.local

# dev 環境（手動）
ENVIRONMENT=dev ./scripts/deploy.sh
# 初回: DynamoDB Native Import で JAA ルールが自動投入される

# 既存テーブルにデフォルトルールを再投入したい場合
ENVIRONMENT=dev ./scripts/seed-rules.sh             # 既存があれば skip
ENVIRONMENT=dev ./scripts/seed-rules.sh --overwrite # 強制上書き
```

### 9.2 監視・ログ

- 既存の構造化ログに以下のキーを追加: `ruleIds`, `inlineRulesCount`, `combinedPromptChars`
- ガード超過警告: `WARN` レベルで「N件のルールを末尾から除外」と出力

### 9.3 ロールバック

- DynamoDB のデータは削除しない方針（dev/staging では新規テーブル作成時のみ）
- API/UIの不具合時は CloudFormation rollback で前バージョンへ戻す
- デフォルトルールが破損した場合は `seed-rules.sh --overwrite` でリセット

---

## 10. 実装上の注意

- **既存POST /chat の後方互換性**: `ruleIds` / `inlineRules` を含まない既存リクエストは既存動作と完全一致すること
- **デフォルトルール本文の入手**: PDFはスキャン画像のため、画像合成に関連する規定（セーフゾーン、テロップ位置、文字サイズ目安、テロップ種別ガイド、禁止事項）を要点抽出してMarkdown化する。実装時の本文ドラフトはレビュー対象とする
- **Lambdaパッケージサイズ**: `marked` などフロント側ライブラリはLambdaに含めない
- **管理画面のCloudFront配信**: 既存のフロントS3 + CloudFront配信に追加されるルートとして`/settings`が動作すること（SPAのfallback設定確認）
