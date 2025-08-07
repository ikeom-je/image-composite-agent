# APIテストガイド

## 概要

このドキュメントでは、Image Composition APIの包括的なテストスイートについて説明します。テストは以下の3つのカテゴリに分類されています：

1. **基本API検証テスト** - 画像合成APIの基本機能
2. **アップロードAPI検証テスト** - S3アップロード機能の基本テスト
3. **包括的アップロードテスト** - アップロード機能の詳細テスト

## テストファイル構成

```
test/e2e/
├── api-validation.api.spec.ts              # 基本API検証テスト
├── upload-api-validation.api.spec.ts       # アップロードAPI基本テスト
├── upload-comprehensive.api.spec.ts        # アップロード包括テスト
├── image-selection-comprehensive.api.spec.ts # 画像選択機能テスト
└── integration-e2e.api.spec.ts             # 統合E2Eテスト
```

## 実行方法

### 個別テスト実行

```bash
# 基本API検証テスト
npm run test:api-validation

# アップロードAPI基本テスト
npm run test:upload-api

# アップロード包括テスト
npm run test:upload-comprehensive

# 全APIテスト実行
npm run test:api-all

# 画像選択機能テスト
npm run test:image-selection

# 統合E2Eテスト
npm run test:integration-e2e

# 包括的テスト実行（推奨）
npm run test:api-comprehensive
```

### 環境変数設定

テスト実行前に以下の環境変数を設定してください：

```bash
export API_URL="https://your-api-gateway-url.amazonaws.com/prod"
```

## テストケース詳細

### 1. 基本API検証テスト (api-validation.api.spec.ts)

#### 画像合成機能テスト
- **透明背景での1画像合成** - HTML/PNG両形式
- **AWSロゴ背景での1画像合成** - HTML/PNG両形式
- **2画像合成** - 複数画像の配置テスト
- **3画像合成** - 最大画像数での合成テスト

#### エラーハンドリングテスト
- **必須パラメータ不足** - image1パラメータ省略時の400エラー
- **無効なフォーマット** - 対応していないformat値の400エラー

#### パフォーマンステスト
- **レスポンス時間** - 5秒以内のレスポンス確認
- **キャンバスサイズ検証** - 1920x1080での大画像処理

#### 正解画像比較テスト
- **画像サイズ比較** - 期待値との10%以内の差を許容
- **PNG署名確認** - 正しいPNG形式での出力確認

### 2. アップロードAPI基本テスト (upload-api-validation.api.spec.ts)

#### 署名付きURL生成テスト
- **正常ケース** - 必要なレスポンスフィールドの確認
- **エラーケース** - 必須パラメータ不足、サイズ制限超過、非対応形式

#### 画像一覧取得テスト
- **基本機能** - 画像一覧の構造確認
- **パラメータ検証** - maxKeysパラメータの動作確認

#### 統合テスト
- **S3画像を使用した合成** - アップロード画像での画像合成
- **CORS設定確認** - 適切なCORSヘッダーの確認

### 3. 包括的アップロードテスト (upload-comprehensive.api.spec.ts)

#### 完全ワークフローテスト
- **エンドツーエンドアップロード** - 署名付きURL生成→アップロード→一覧確認
- **サムネイル生成確認** - 自動生成されるサムネイルの検証

#### ファイル形式サポートテスト
- **対応形式** - PNG, JPEG, GIF, WebPの署名付きURL生成
- **非対応形式** - PDF, ZIP, TXT等の適切な拒否

#### ファイルサイズ制限テスト
- **境界値テスト** - 1KB〜10MBの各サイズでの動作確認
- **制限超過テスト** - 10MB超過時の適切なエラー

#### 統合テスト
- **複数画像合成** - アップロード画像を使用した1〜3画像合成
- **混合合成** - S3画像とテスト画像の組み合わせ

#### セキュリティテスト
- **署名付きURL有効期限** - 1時間の有効期限確認
- **URLパラメータ検証** - 適切な署名パラメータの確認

### 4. 画像選択機能テスト (image-selection-comprehensive.api.spec.ts)

#### テスト画像種類確認
- **基本テスト画像** - test, circle, rectangle, triangleの動作確認
- **画像生成確認** - 各タイプでの正常な画像生成

#### S3画像パス形式確認
- **パス形式検証** - s3://bucket/path形式の確認
- **サムネイルURL確認** - 適切なサムネイルURLの生成

#### 動的モード切り替え
- **1画像モード** - 単一画像での合成確認
- **2画像モード** - 2画像での合成確認
- **3画像モード** - 3画像での合成確認

#### 混合画像選択パターン
- **S3画像 + テスト画像** - 異なるソースの組み合わせ
- **複数S3画像** - 複数のアップロード画像使用
- **エラーハンドリング** - 存在しない画像の適切な処理

### 5. 統合E2Eテスト (integration-e2e.api.spec.ts)

#### 完全ワークフローテスト
- **アップロード→選択→合成** - 全機能を通したエンドツーエンドテスト
- **サムネイル生成確認** - アップロード後の自動サムネイル生成
- **複数合成パターン** - 1画像、2画像、3画像合成の連続実行

#### 既存機能互換性テスト
- **後方互換性** - 従来のテスト画像のみでの合成確認
- **レガシーパラメータ** - 既存のAPIパラメータ形式での動作確認

#### エラーシナリオテスト
- **存在しないS3画像** - 無効なS3パスでの適切なエラー処理
- **混合エラー** - 正常画像と異常画像の組み合わせ処理
- **無効パス形式** - 不正なS3パス形式での処理

#### パフォーマンステスト
- **統合ワークフロー** - 全体処理時間の測定
- **同時実行** - 複数リクエストの並行処理確認
- **大量データ** - 多数の画像での処理確認

#### 完全ワークフローテスト
- **エンドツーエンドアップロード** - 署名付きURL生成→アップロード→一覧確認
- **サムネイル生成確認** - 自動生成されるサムネイルの検証

#### ファイル形式サポートテスト
- **対応形式** - PNG, JPEG, GIF, WebPの署名付きURL生成
- **非対応形式** - PDF, ZIP, TXT等の適切な拒否

#### ファイルサイズ制限テスト
- **境界値テスト** - 1KB〜10MBの各サイズでの動作確認
- **制限超過テスト** - 10MB超過時の適切なエラー

#### 統合テスト
- **複数画像合成** - アップロード画像を使用した1〜3画像合成
- **混合合成** - S3画像とテスト画像の組み合わせ

#### セキュリティテスト
- **署名付きURL有効期限** - 1時間の有効期限確認
- **URLパラメータ検証** - 適切な署名パラメータの確認

## テスト結果の解釈

### 成功基準

1. **レスポンス時間**
   - 画像合成API: 5秒以内
   - アップロードAPI: 3秒以内
   - 画像一覧API: 5秒以内

2. **画像品質**
   - PNG署名の正確性
   - 期待サイズとの10%以内の差

3. **エラーハンドリング**
   - 適切なHTTPステータスコード
   - 分かりやすいエラーメッセージ

### よくある問題と対処法

#### 1. テスト画像が見つからない
```
Error: expected-aws-logo-base.png not found
```
**対処法**: テスト用正解画像を生成
```bash
npm run update-test-assets
```

#### 2. API URLが設定されていない
```
Error: API_URL environment variable not set
```
**対処法**: 環境変数を設定
```bash
export API_URL="https://your-api-url.amazonaws.com/prod"
```

#### 3. S3画像が存在しない
```
No uploaded images found, skipping S3 image composition test
```
**対処法**: テスト用画像をアップロード
```bash
# フロントエンドからテスト画像をアップロード
# または、AWS CLIでS3に直接アップロード
```

## CI/CD統合

### GitHub Actions設定例

```yaml
name: API Tests
on: [push, pull_request]

jobs:
  api-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Install Playwright
        run: npx playwright install
      
      - name: Run API tests
        env:
          API_URL: ${{ secrets.API_URL }}
        run: npm run test:api-all
      
      - name: Upload test results
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

## テストデータ管理

### 正解画像の更新

APIの実装が変更された場合、正解画像を更新する必要があります：

```bash
# 全ての正解画像を更新
npm run update-test-assets

# 特定の画像のみ更新
curl -s "${API_URL}/images/composite?baseImage=transparent&image1=test&image1X=100&image1Y=100&image1Width=400&image1Height=300&canvasWidth=1920&canvasHeight=1080&format=png" \
  --output test/test-assets/expected-transparent-base.png
```

### テスト用S3画像の準備

包括的テストを実行するには、S3にテスト用画像をアップロードしておく必要があります：

1. フロントエンドアプリケーションを使用してテスト画像をアップロード
2. AWS CLIを使用して直接アップロード
3. 自動テストスクリプトでのアップロード

## パフォーマンス監視

### メトリクス収集

テスト実行時に以下のメトリクスが収集されます：

- **レスポンス時間**: 各APIエンドポイントの応答時間
- **画像サイズ**: 生成される画像のファイルサイズ
- **エラー率**: 失敗したリクエストの割合

### アラート設定

以下の条件でアラートを設定することを推奨します：

- レスポンス時間が閾値を超過
- エラー率が5%を超過
- 画像サイズが期待値から大きく乖離

## トラブルシューティング

### デバッグモード

詳細なログを出力するには：

```bash
DEBUG=1 npm run test:api-all
```

### ネットワーク問題

タイムアウトエラーが発生する場合：

```bash
# タイムアウト時間を延長
PLAYWRIGHT_TIMEOUT=30000 npm run test:api-all
```

### 認証問題

API Gatewayの認証設定を確認：

1. CORS設定の確認
2. APIキーの設定確認
3. IAMロールの権限確認

## 今後の拡張予定

1. **負荷テスト** - 大量リクエストでの性能テスト
2. **セキュリティテスト** - 脆弱性スキャン
3. **モニタリング統合** - CloudWatchメトリクスとの連携
4. **自動回復テスト** - 障害時の自動復旧確認