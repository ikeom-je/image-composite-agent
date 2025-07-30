# 画像合成REST APIシステム - 実装計画

## 実装タスク

- [x] 1. CDKインフラストラクチャの基盤を構築する
  - AWS CDKプロジェクトの初期化とスタック定義を作成する
  - S3バケット（リソース、テスト画像、フロントエンド）を定義する
  - IAM権限とセキュリティ設定を実装する
  - Lambda関数の基本設定を実装する
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 2. テスト画像リソースを生成・準備する
  - 円形画像（circle_red.png）を生成する
  - 四角形画像（rectangle_blue.png）を生成する
  - 三角形画像（triangle_green.png）を生成する
  - AWS Logo画像（aws-logo.png）を準備する
  - 全ての画像をアルファチャンネル対応のPNG形式で保存する
  - _Requirements: 8.1, 8.2_

- [x] 3. テスト画像をS3にアップロードする
  - S3テストバケットに画像をアップロードするスクリプトを作成する
  - 画像アクセス権限を適切に設定する
  - アップロード後の動作確認を実行する
  - _Requirements: 8.3, 8.4_

- [x] 4. Lambda関数の画像取得エンジンを実装する
  - S3からの画像取得機能（boto3使用）を実装する
  - HTTP/HTTPS URLからの画像取得機能を実装する
  - テスト画像の自動選択機能を実装する（3画像対応）
  - 並列画像取得による高速化を実装する
  - エラーハンドリングとログ出力を実装する
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Lambda関数の画像合成エンジンを実装する
  - Pillowライブラリを使用した高品質画像合成を実装する
  - アルファチャンネル（透過情報）対応の合成処理を実装する
  - 2画像合成機能を実装する
  - 3画像合成機能を実装する（後方互換性保持）
  - 画像の位置・サイズ調整機能を実装する
  - RGBA変換とLANCOS補間による品質保持を実装する
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 6. Lambda関数のパラメータ処理を実装する
  - クエリパラメータの解析処理を実装する
  - 必須パラメータ（image1, image2）の検証を実装する
  - オプションパラメータ（image3, baseImage）の処理を実装する
  - 位置・サイズパラメータのデフォルト値設定を実装する
  - パラメータバリデーションとエラーハンドリングを実装する
  - _Requirements: 2.3, 2.4_

- [x] 7. Lambda関数のレスポンス生成機能を実装する
  - HTML表示レスポンス（技術情報付き）を実装する
  - PNG直接返却レスポンスを実装する
  - JavaScriptダウンロード機能を実装する
  - 2画像/3画像対応の動的コンテンツ生成を実装する
  - 詳細なエラーハンドリングとログ出力を実装する
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [x] 8. API Gatewayの設定と統合を実装する
  - RESTエンドポイント（/images/composite）を作成する
  - Lambda統合とパラメータマッピングを設定する
  - CORS設定とバイナリメディアタイプ対応を実装する
  - エラーレスポンスの適切な変換を設定する
  - _Requirements: 6.4_

- [x] 9. 動的設定管理システムを実装する
  - CDKデプロイ時にAPI GatewayとCloudFrontのURLを自動取得する仕組みを実装する
  - config.jsonファイルを動的生成してS3にデプロイする機能を実装する
  - バージョン情報とS3バケット名を設定に含める機能を実装する
  - 環境変数による設定オーバーライド機能を実装する
  - _Requirements: 9.1, 9.2, 9.3_

- [x] 10. Vue.js 3フロントエンドの基盤を構築する
  - Vite + Vue.js 3プロジェクトを初期化する
  - Tailwind CSSによるスタイリングシステムを構築する
  - レスポンシブデザインの基本レイアウトを実装する
  - コンポーネント構造を設計・実装する
  - _Requirements: 5.1_

- [x] 11. フロントエンドの動的設定読み込み機能を実装する
  - ConfigManagerクラスを実装する
  - config.jsonから設定を読み込む機能を実装する
  - 環境変数による設定オーバーライド機能を実装する
  - フォールバック機能による堅牢性を確保する
  - 設定読み込み中のローディング表示を実装する
  - _Requirements: 9.4, 9.5, 5.1_

- [x] 12. フロントエンドのパラメータ設定フォームを実装する
  - ベース画像選択フォームを作成する
  - 3画像選択のテーブル形式UIを実装する
  - 位置・サイズ調整の数値入力フォームを実装する
  - 出力形式選択機能を実装する
  - フォームバリデーションとエラー表示を実装する
  - image3が未選択時の項目無効化を実装する
  - _Requirements: 5.1, 5.2_

- [x] 13. フロントエンドのAPI通信機能を実装する
  - Axiosによる非同期API通信を実装する
  - buildApiUrl関数で2画像/3画像対応のURL生成を実装する
  - Content-Type判定による適切なレスポンス処理を実装する
  - エラーハンドリングと自動再試行メカニズムを実装する
  - ローディング状態とプログレス表示を実装する
  - _Requirements: 5.2, 5.3_

- [x] 14. フロントエンドの画像表示とダウンロード機能を実装する
  - 合成画像のプレビュー表示機能を実装する
  - 画像ダウンロード機能を実装する
  - API URLコピー機能を実装する
  - 目立つデザインの画像生成ボタンを実装する
  - 2画像/3画像に応じたボタンテキスト変更を実装する
  - _Requirements: 5.3, 5.4, 5.5_

- [x] 15. フロントエンドの使用例機能を実装する
  - 2画像合成の使用例プリセットを作成する
  - 3画像合成の使用例プリセットを作成する
  - S3パス使用の使用例を作成する
  - 使用例選択時の自動実行機能を実装する
  - 動的S3バケット名の使用例への反映を実装する
  - _Requirements: 5.5_

- [x] 16. CloudFrontによるセキュアな配信を設定する
  - CloudFrontディストリビューションを作成する
  - Origin Access Identity (OAI)によるS3アクセス制限を設定する
  - HTTPS強制とキャッシュ設定を実装する
  - SPA対応のエラーレスポンス設定を実装する
  - config.jsonのキャッシュ無効化設定を実装する
  - _Requirements: 6.5_

- [ ] 17. Lambda関数のユニットテストを実装する
  - 画像取得機能のテストケースを作成する
  - 2画像合成処理のテストケースを作成する
  - 3画像合成処理のテストケースを作成する
  - パラメータ検証のテストケースを作成する
  - エラーハンドリングのテストケースを作成する
  - 後方互換性のテストケースを作成する
  - _Requirements: 7.1, 7.4_

- [ ] 18. API統合テスト（Playwright）を実装する
  - 基本的な2画像合成APIのテストを作成する
  - 3画像合成APIのテストを作成する
  - S3パス指定での画像合成テストを作成する
  - パラメータバリデーションテストを作成する
  - エラーレスポンステストを作成する
  - 後方互換性テストを作成する
  - _Requirements: 7.2, 7.4_

- [ ] 19. フロントエンドE2Eテストを実装する
  - UI要素の表示・操作テストを作成する
  - 2画像合成フォーム入力と送信テストを作成する
  - 3画像合成フォーム入力と送信テストを作成する
  - 画像表示とダウンロードテストを作成する
  - 使用例機能のテストを作成する
  - 動的設定読み込みのテストを作成する
  - _Requirements: 7.3, 7.4_

- [ ] 20. 全体統合テストと動作検証を実行する
  - 全てのユニットテストを実行して結果を確認する
  - 全てのE2Eテストを実行して結果を確認する
  - 手動テストでエンドツーエンドの動作を確認する
  - 2画像合成の後方互換性を手動確認する
  - 3画像合成の新機能を手動確認する
  - パフォーマンステストを実行する
  - _Requirements: 7.5_

- [x] 21. デプロイメントとドキュメント整備を完了する
  - 本番環境へのデプロイを実行する
  - 動的URL設定が正しく動作することを確認する
  - CloudFrontキャッシュ無効化を実行する
  - README.mdとAmazonQ.mdを更新する
  - API仕様書とユーザーガイドを作成する
  - 運用・保守手順をドキュメント化する
  - バージョンを2.3.0に更新する
  - _Requirements: 全般_

## 実装の詳細仕様

### テスト画像生成の仕様
```python
# scripts/generate_test_images.py
def generate_circle_image():
    """円形画像の生成仕様"""
    # サイズ: 400x400ピクセル
    # 色: 赤色 (#ef4444 / RGB: 239, 68, 68)
    # 背景: 透明（アルファチャンネル = 0）
    # 形状: 中央の円
    # 保存先: lambda/python/images/circle_red.png

def generate_rectangle_image():
    """四角形画像の生成仕様"""
    # サイズ: 400x400ピクセル
    # 色: 青色 (#3b82f6 / RGB: 59, 130, 246)
    # 背景: 透明（アルファチャンネル = 0）
    # 形状: 中央の四角形
    # 保存先: lambda/python/images/rectangle_blue.png

def generate_triangle_image():
    """三角形画像の生成仕様"""
    # サイズ: 400x400ピクセル
    # 色: 緑色 (#22c55e / RGB: 34, 197, 94)
    # 背景: 透明（アルファチャンネル = 0）
    # 形状: 上向きの三角形
    # 保存先: lambda/python/images/triangle_green.png
```

### Lambda関数拡張の仕様
```python
# lambda/python/image_processor.py の実装仕様
def handler(event, context):
    """
    パラメータ処理の仕様:
    - image1, image2: 必須パラメータ
    - image3: オプションパラメータ（未指定時はNone）
    - baseImage: オプションパラメータ（デフォルト: "test"）
    - format: オプションパラメータ（デフォルト: "html"）
    
    位置・サイズパラメータのデフォルト値:
    - image1: X=1600, Y=20, Width=300, Height=200
    - image2: X=1600, Y=240, Width=300, Height=200
    - image3: X=20, Y=20, Width=300, Height=200
    
    並列取得: max_workers=4（base, image1, image2, image3）
    後方互換性: image3未指定時は既存の2画像合成処理
    """

def create_composite_image(base_img, image1, image2, image3=None, params):
    """
    合成順序の仕様:
    1. base_img（ベース画像またはtransparent背景）
    2. image1を合成
    3. image2を合成  
    4. image3を合成（指定されている場合のみ）
    
    アルファチャンネル処理:
    - 全ての画像でRGBAモードを使用
    - 透過情報を保持した合成処理
    - paste()の第3引数にマスクを指定
    - LANCZOS補間による高品質リサイズ
    """
```

### フロントエンドUI仕様
```vue
<!-- 3画像設定テーブルの仕様 -->
<template>
  <div class="images-config-section">
    <h3>画像設定</h3>
    
    <!-- 画像選択テーブル -->
    <table class="config-table">
      <thead>
        <tr>
          <th>画像</th>
          <th>画像1 (必須)</th>
          <th>画像2 (必須)</th>
          <th>画像3 (オプション)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>画像選択</td>
          <td>
            <!-- image1のプルダウン: デフォルト "test" (円) -->
            <select v-model="params.image1">
              <option value="test">テスト画像 (円)</option>
              <option :value="s3CirclePath">S3: circle_red.png</option>
              <option :value="s3RectanglePath">S3: rectangle_blue.png</option>
              <option :value="s3TrianglePath">S3: triangle_green.png</option>
            </select>
          </td>
          <td>
            <!-- image2のプルダウン: デフォルト "test" (四角) -->
            <select v-model="params.image2">
              <option value="test">テスト画像 (四角)</option>
              <option :value="s3CirclePath">S3: circle_red.png</option>
              <option :value="s3RectanglePath">S3: rectangle_blue.png</option>
              <option :value="s3TrianglePath">S3: triangle_green.png</option>
            </select>
          </td>
          <td>
            <!-- image3のプルダウン: デフォルト "" (選択しない) -->
            <select v-model="params.image3">
              <option value="">選択しない</option>
              <option value="test">テスト画像 (三角)</option>
              <option :value="s3CirclePath">S3: circle_red.png</option>
              <option :value="s3RectanglePath">S3: rectangle_blue.png</option>
              <option :value="s3TrianglePath">S3: triangle_green.png</option>
            </select>
          </td>
        </tr>
      </tbody>
    </table>
    
    <!-- 位置・サイズ設定テーブル -->
    <table class="config-table">
      <thead>
        <tr>
          <th>設定項目</th>
          <th>画像1</th>
          <th>画像2</th>
          <th :class="{ 'disabled-header': !params.image3 }">
            画像3 {{ params.image3 ? '' : '(無効)' }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>X座標</td>
          <td><input v-model.number="params.image1X" type="number" /></td>
          <td><input v-model.number="params.image2X" type="number" /></td>
          <td><input v-model.number="params.image3X" type="number" :disabled="!params.image3" /></td>
        </tr>
        <tr>
          <td>Y座標</td>
          <td><input v-model.number="params.image1Y" type="number" /></td>
          <td><input v-model.number="params.image2Y" type="number" /></td>
          <td><input v-model.number="params.image3Y" type="number" :disabled="!params.image3" /></td>
        </tr>
        <tr>
          <td>幅</td>
          <td><input v-model.number="params.image1Width" type="number" /></td>
          <td><input v-model.number="params.image2Width" type="number" /></td>
          <td><input v-model.number="params.image3Width" type="number" :disabled="!params.image3" /></td>
        </tr>
        <tr>
          <td>高さ</td>
          <td><input v-model.number="params.image1Height" type="number" /></td>
          <td><input v-model.number="params.image2Height" type="number" /></td>
          <td><input v-model.number="params.image3Height" type="number" :disabled="!params.image3" /></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
```

### 画像生成ボタンの仕様
```vue
<template>
  <div class="generate-button-section">
    <button 
      @click="generateImage" 
      :disabled="isLoading || !params.image1 || !params.image2"
      class="generate-button"
    >
      <span v-if="isLoading" class="loading-content">
        <svg class="spinner-icon animate-spin">...</svg>
        生成中...
      </span>
      <span v-else class="button-content">
        🎨 {{ params.image3 ? '3画像を合成' : '2画像を合成' }}
      </span>
    </button>
  </div>
</template>

<style>
.generate-button {
  /* グラデーション背景 */
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  /* ホバーエフェクト */
  transform: scale(1.05) on hover;
  /* 最小サイズ */
  min-width: 200px;
  min-height: 56px;
  /* その他のスタイル */
  color: white;
  font-weight: bold;
  padding: 16px 32px;
  border-radius: 8px;
  font-size: 18px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: all 0.2s ease;
}
</style>
```

### 動的設定管理の仕様
```typescript
// CDK側の実装仕様
const configContent = {
  apiUrl: `${this.api.url}images/composite`,
  cloudfrontUrl: `https://${this.distribution.distributionDomainName}`,
  s3BucketNames: {
    resources: this.resourcesBucket.bucketName,
    testImages: this.testImagesBucket.bucketName,
    frontend: this.frontendBucket.bucketName,
  },
  version: '2.3.0',
  environment: this.node.tryGetContext('environment') || 'production'
};
```

```javascript
// フロントエンド側の実装仕様
class ConfigManager {
  async loadConfig() {
    // 1. /config.jsonから設定を読み込み
    // 2. 環境変数による上書き処理
    // 3. エラー時のフォールバック処理
    // 4. ローディング状態の管理
  }
  
  getDefaultConfig() {
    // デフォルト設定の提供
    // 開発環境での動作保証
  }
}
```

### テスト仕様

#### ユニットテスト仕様
```python
class TestImageComposition(unittest.TestCase):
    def test_two_image_composition(self):
        """2画像合成の基本動作テスト"""
        # 2つのテスト画像を準備
        # create_composite_image関数を呼び出し（image3=None）
        # 結果画像のサイズ、モード、透過情報を検証
        
    def test_three_image_composition(self):
        """3画像合成の基本動作テスト"""
        # 3つのテスト画像を準備
        # create_composite_image関数を呼び出し
        # 結果画像のサイズ、モード、透過情報を検証
        
    def test_backward_compatibility(self):
        """後方互換性テスト（image3=None）"""
        # image3をNoneで呼び出し
        # 既存の2画像合成と同じ結果になることを確認
        
    def test_parameter_validation(self):
        """パラメータ検証テスト"""
        # 無効なパラメータでのテスト
        # エラーレスポンスの検証
        
    def test_test_image_selection(self):
        """テスト画像選択テスト"""
        # get_test_image("image1") → circle_red.png
        # get_test_image("image2") → rectangle_blue.png
        # get_test_image("image3") → triangle_green.png
```

#### E2Eテスト仕様
```typescript
test.describe('画像合成API', () => {
  test('基本的な2画像合成API', async ({ request }) => {
    const response = await request.get(
      '/images/composite?image1=test&image2=test'
    );
    expect(response.status()).toBe(200);
  });
  
  test('3画像合成API', async ({ request }) => {
    const response = await request.get(
      '/images/composite?image1=test&image2=test&image3=test'
    );
    expect(response.status()).toBe(200);
  });
  
  test('フロントエンド2画像選択', async ({ page }) => {
    await page.goto('/');
    
    // 2画像のみ選択
    await page.selectOption('[data-testid="image1-select"]', 'test');
    await page.selectOption('[data-testid="image2-select"]', 'test');
    
    // 画像生成ボタンをクリック
    await page.click('[data-testid="generate-button"]');
    
    // ボタンテキストが「2画像を合成」であることを確認
    await expect(page.locator('[data-testid="generate-button"]')).toContainText('2画像を合成');
    
    // 結果画像が表示されることを確認
    await expect(page.locator('[data-testid="result-image"]')).toBeVisible();
  });
  
  test('フロントエンド3画像選択', async ({ page }) => {
    await page.goto('/');
    
    // 3画像を選択
    await page.selectOption('[data-testid="image1-select"]', 'test');
    await page.selectOption('[data-testid="image2-select"]', 'test');
    await page.selectOption('[data-testid="image3-select"]', 'test');
    
    // 画像生成ボタンをクリック
    await page.click('[data-testid="generate-button"]');
    
    // ボタンテキストが「3画像を合成」であることを確認
    await expect(page.locator('[data-testid="generate-button"]')).toContainText('3画像を合成');
    
    // 結果画像が表示されることを確認
    await expect(page.locator('[data-testid="result-image"]')).toBeVisible();
  });
  
  test('動的設定読み込み', async ({ page }) => {
    await page.goto('/');
    
    // 設定読み込み完了まで待機
    await expect(page.locator('[data-testid="config-loading"]')).toBeHidden();
    
    // バージョン情報が表示されることを確認
    await expect(page.locator('[data-testid="version-info"]')).toContainText('2.3.0');
  });
});
```

## デフォルト値の設定

### Lambda関数のデフォルト値
```python
# 各画像のデフォルトパラメータ
DEFAULT_PARAMS = {
    'image1': {'x': 1600, 'y': 20, 'width': 300, 'height': 200},
    'image2': {'x': 1600, 'y': 240, 'width': 300, 'height': 200},
    'image3': {'x': 20, 'y': 20, 'width': 300, 'height': 200}
}

DEFAULT_BASE_IMAGE = 'test'
DEFAULT_FORMAT = 'html'
```

### フロントエンドのデフォルト値
```javascript
// Vue.jsコンポーネントのデフォルト値
data() {
  return {
    params: {
      // 基本パラメータ
      baseImage: 'test',
      image1: 'test',
      image2: 'test',
      image3: '',           // 空文字（選択しない）
      format: 'html',
      
      // 位置・サイズパラメータ
      image1X: 1600, image1Y: 20, image1Width: 300, image1Height: 200,
      image2X: 1600, image2Y: 240, image2Width: 300, image2Height: 200,
      image3X: 20, image3Y: 20, image3Width: 300, image3Height: 200
    }
  };
}
```

## バージョン管理

### バージョン更新の仕様
- **現在のバージョン**: v2.3.0（3画像合成機能を含む統合版）
- **更新対象ファイル**:
  - `package.json`: version フィールド
  - `frontend/package.json`: version フィールド
  - `lambda/python/image_processor.py`: HTMLレスポンスのタイトル
  - `README.md`: タイトルと説明
  - `history.md`: 開発履歴の追加

### 機能セット
- 2画像合成機能（後方互換性）
- 3画像合成機能（新機能）
- テスト画像（円・四角・三角・AWS Logo）
- 動的設定管理システム
- Vue.js 3フロントエンド
- 包括的なテストスイート
- セキュアなクラウドインフラストラクチャ

## 動的URL設定の実装詳細

### CDK側の実装
```typescript
// lib/image-processor-api-stack.ts
export class ImageProcessorApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // ... 他のリソース作成 ...
    
    // 設定ファイルの内容を動的生成
    const configContent = {
      apiUrl: this.apiEndpoint,
      cloudfrontUrl: `https://${this.distribution.distributionDomainName}`,
      s3BucketNames: {
        resources: this.resourcesBucket.bucketName,
        testImages: this.testImagesBucket.bucketName,
        frontend: this.frontendBucket.bucketName,
      },
      version: process.env.npm_package_version || '2.3.0',
      environment: this.node.tryGetContext('environment') || 'production'
    };
    
    // フロントエンドと設定ファイルを同時にデプロイ
    new s3deploy.BucketDeployment(this, 'DeployFrontendWithConfig', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../frontend/dist')),
        s3deploy.Source.jsonData('config.json', configContent)
      ],
      destinationBucket: this.frontendBucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });
  }
}
```

### フロントエンド側の実装
```javascript
// frontend/src/utils/config.js
class ConfigManager {
  constructor() {
    this.config = null;
    this.loading = false;
  }
  
  async loadConfig() {
    if (this.config) return this.config;
    if (this.loading) return this.waitForConfig();
    
    this.loading = true;
    
    try {
      const response = await fetch('/config.json');
      this.config = await response.json();
      
      // 環境変数による上書き
      if (import.meta.env.VITE_API_URL) {
        this.config.apiUrl = import.meta.env.VITE_API_URL;
      }
      
      return this.config;
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = this.getDefaultConfig();
      return this.config;
    } finally {
      this.loading = false;
    }
  }
  
  getDefaultConfig() {
    return {
      apiUrl: import.meta.env.VITE_API_URL || '',
      version: '2.3.0',
      environment: 'development',
      s3BucketNames: {
        testImages: 'default-test-bucket'
      }
    };
  }
  
  async waitForConfig() {
    while (this.loading) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return this.config;
  }
}

export const configManager = new ConfigManager();
```