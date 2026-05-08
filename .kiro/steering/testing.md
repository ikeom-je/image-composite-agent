---
inclusion: auto
---

# テストルール

## テストピラミッド

```
        E2Eテスト (Playwright)
       /                    \
    APIテスト (Playwright)
   /                        \
ユニットテスト (Python unittest)
```

## テストタイプ

### ユニットテスト（Lambda関数）
- 場所: `test/lambda/`
- フレームワーク: Python unittest
- 実行: `npm run test:lambda`
- カバレッジ: 個別関数、エラーハンドリング、エッジケース
- モック: 外部依存関係（S3、boto3）

### API統合テスト
- 場所: `test/e2e/*.api.spec.ts`
- フレームワーク: Playwright
- 実行: `npm run test:api`
- カバレッジ: APIエンドポイント、リクエスト/レスポンス検証、エラーコード
- 実環境: API Gateway + Lambda（デプロイ済み）

### E2Eテスト
- 場所: `test/e2e/*.spec.ts`
- フレームワーク: Playwright
- 実行: `npm run test:all-e2e`
- カバレッジ: 完全なユーザーワークフロー、UI操作
- 実環境: 完全なデプロイ済みスタック

## デプロイ後の検証フロー

バックエンドとフロントエンドを段階的にデプロイし、各段階でe2eテストを実施する。

```
1. バックエンドデプロイ  →  2. APIテスト(e2e)
       ↓ (API_URL取得)
3. フロントエンドビルド  →  4. フロントエンドデプロイ  →  5. フロントエンドE2Eテスト
```

### ローカル実行手順

```bash
# 1. バックエンドデプロイ
source .env.local
npm run build
npx cdk deploy ImageProcessorApiStack --require-approval never

# 2. API e2eテスト（バックエンド単体の動作確認）
export API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
npm run test:api

# 3. フロントエンドビルド + デプロイ
cd frontend && npm run build && cd ..
npx cdk deploy FrontendStack --require-approval never

# 4. フロントエンドE2Eテスト
export FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name FrontendStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text)
npm run test:all-e2e
```

### GitHub Actions

- CI/CDパイプライン（`deploy.yml`）がデプロイ後に `e2e-test.yml` を自動呼び出し
- 手動トリガー: Actions → E2E Test → Run workflow → 環境・テストスイート選択

## テストコマンド

```bash
npm run test:comprehensive    # すべてのテスト
npm run test:lambda          # ユニットテストのみ
npm run test:api             # APIテストのみ
npm run test:upload          # アップロードE2E
npm run test:selection       # 画像選択E2E
npm run test:integration     # 統合E2E
```

## テスト用環境変数

テスト実行時にCloudFormation出力から取得して設定する。各環境（dev/staging/production）でスタック名サフィックスが異なる点に注意。

| 環境変数 | 用途 | CDK出力キー | 備考 |
|---------|------|----------|------|
| `API_URL` | 画像合成APIエンドポイント。`/images/composite` を含む完全URL。Playwright設定では末尾を除去してbaseURLに使用 | `ApiUrl` (ImageProcessorApiStack) | 例: `.../prod/images/composite` |
| `CHAT_API_URL` | Chat Agent APIのベースURL（末尾 `/chat` を含む）。`POST /chat`、`GET /chat/models`、`GET/DELETE /chat/history/{sessionId}` で使用 | `ChatApiUrl` (ImageProcessorApiStack) | 例: `.../prod/chat` |
| `FRONTEND_URL` | フロントエンドURL（CloudFrontドメイン）。E2EテストのbaseURL | `FrontendUrl` (FrontendStack) | - |

### CHAT_API_URL のフォールバック

`test/e2e/chat-agent.api.spec.ts` は以下の順で URL を解決する:

```typescript
chatApiUrl: process.env.CHAT_API_URL
         || process.env.API_URL?.replace(/\/images\/composite$/, '/chat')
         || ''
```

`CHAT_API_URL` 未設定時は `API_URL` の末尾 `/images/composite` を `/chat` に置換して導出する。CI/手動テストでは明示的に指定するのが望ましい。

### 取得方法（環境別）

```bash
# production
export CHAT_API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack \
  --query "Stacks[0].Outputs[?OutputKey=='ChatApiUrl'].OutputValue" --output text)

# staging / dev は -Staging / -Dev サフィックス
export CHAT_API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack-Dev \
  --query "Stacks[0].Outputs[?OutputKey=='ChatApiUrl'].OutputValue" --output text)
```

## Chat Agent テストでのセッションID管理

Chat AgentテストはDynamoDB会話履歴の影響を受けるため、セッションIDの扱いに注意が必要。

### セッションID生成パターン

| パターン | 用途 | 実装例 |
|---------|------|-------|
| テストスイートごとに固定UUID | フロー全体で会話履歴を共有・累積したい場合（E2E安定化） | `test.beforeAll` で `randomUUID()` を生成し describe 全体で共有 |
| テストごとに新規UUID | 履歴の影響を受けたくない独立テスト | 各 `test()` 内で `randomUUID()` を呼ぶ |
| エラーケース用 | バリデーションテスト等 | data に直接 `randomUUID()` を渡す |

### 履歴クリーンアップ

会話履歴を蓄積しないため、テスト終了時に `DELETE /chat/history/{sessionId}` で削除する:

```typescript
test.afterAll(async ({ request }) => {
  await request.delete(`${TEST_CONFIG.chatApiUrl}/history/${sessionId}`).catch(() => {})
})
```

### DynamoDB ConsistentRead

Chat履歴の取得は `ConsistentRead=True` で実行されるが、書き込み直後（数十ms以内）の取得は競合することがある。`POST /chat` 直後に `GET /chat/history` するテストでは小さな待機を入れるかリトライを実装する。

## テストの書き方

### ユニットテスト構造
```python
class TestImageProcessor(unittest.TestCase):
    def setUp(self):
        # テストフィクスチャのセットアップ
        pass
    
    def test_specific_behavior(self):
        # Arrange（準備）
        # Act（実行）
        # Assert（検証）
        pass
```

### APIテスト構造
```typescript
test.describe('機能', () => {
  test('何かをするべき', async ({ request }) => {
    // Arrange（準備）
    const payload = {...}
    
    // Act（実行）
    const response = await request.get(url)
    
    // Assert（検証）
    expect(response.status()).toBe(200)
  })
})
```

## テストデータ

### テスト用画像の分類

| 種類 | 場所 | 用途 |
|------|------|------|
| 基本テスト画像 | `lambda/python/images/` | `circle_red.png`, `rectangle_blue.png`, `triangle_green.png`, `default-base.png` |
| 期待値画像 | `test/test-assets/expected-*.png` | APIテストのレスポンス比較用。正しいPNG形式で管理 |
| テスト出力 | `test/test-results/` | テスト実行時の一時ファイル。.gitignoreで除外済み |

### 期待値画像の管理

- 必ず正しいPNG画像形式で保存（base64テキストファイルは不可）
- 確認: `file test/test-assets/expected-*.png` → "PNG image data" と表示されること
- 修正: `npm run fix-test-assets`
- 再生成: `npm run regenerate-expected-images`

## ベストプラクティス

- 1つのテストで1つのことをテスト
- 説明的なテスト名を使用
- テスト後にリソースをクリーンアップ
- ユニットテストでは外部サービスをモック
- 統合テストでは実際のサービスを使用
- テストを高速かつ独立に保つ
- 実装の詳細をテストしない
