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

- テスト画像: `lambda/python/images/`
- 期待される出力: `test/test-assets/expected-*.png`
- 再生成: `npm run regenerate-expected-images`

## ベストプラクティス

- 1つのテストで1つのことをテスト
- 説明的なテスト名を使用
- テスト後にリソースをクリーンアップ
- ユニットテストでは外部サービスをモック
- 統合テストでは実際のサービスを使用
- テストを高速かつ独立に保つ
- 実装の詳細をテストしない
