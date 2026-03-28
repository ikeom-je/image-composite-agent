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
