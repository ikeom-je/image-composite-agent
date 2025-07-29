# 画像合成REST API システム - 設計書

## 概要

高性能・アルファチャンネル対応の画像合成REST APIシステムの設計。AWS CDK、Lambda、API Gateway、S3を使用したサーバーレス構成で、Vue.js 3フロントエンドアプリケーションを含む包括的なシステム。

## アーキテクチャ

### システム全体構成
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CloudFront    │───▶│   S3 Bucket      │    │   API Gateway   │
│   Distribution  │    │  (Frontend)      │    │   REST API      │
│                 │    │  Vue.js 3 App    │    │                 │
└─────────────────┘    └──────────────────┘    └─────────┬───────┘
                                                          │
                                                          ▼
                                                ┌─────────────────┐
                                                │   AWS Lambda    │
                                                │  Python 3.12    │
                                                │  + Pillow       │
                                                │  + boto3        │
                                                └─────────┬───────┘
                                                          │
                                                          ▼
                                                ┌─────────────────┐
                                                │   Amazon S3     │
                                                │  画像ストレージ  │
                                                │ - テスト画像     │
                                                │ - リソース画像   │
                                                └─────────────────┘
```

### データフロー
1. **ユーザーアクセス**: CloudFront経由でVue.jsフロントエンドにアクセス
2. **パラメータ設定**: フロントエンドで画像合成パラメータを設定
3. **API呼び出し**: API Gateway経由でLambda関数を呼び出し
4. **画像取得**: Lambda関数がS3やHTTPから画像を並列取得
5. **画像合成**: Pillowライブラリで高品質な画像合成処理
6. **結果返却**: HTML表示またはPNG直接返却

## コンポーネント設計

### 1. Lambda画像処理コンポーネント

#### 1.1 画像取得エンジン
```python
def fetch_image(url_or_s3_path: str, image_type: str = "unknown") -> Image.Image:
    """
    URLまたはS3パスから画像を取得し、Pillowイメージとして返す
    
    対応形式:
    - http(s)://... - 通常のURL
    - s3://bucket/key - S3パス
    - "test" - テスト画像
    """
```

**機能:**
- HTTP/HTTPS URLからの画像取得
- S3バケットからの画像取得（boto3使用）
- テスト画像の自動選択
- 並列画像取得による高速化
- アルファチャンネル（RGBA）の自動変換

#### 1.2 画像合成エンジン
```python
def create_composite_image(base_img: Image.Image, image1: Image.Image, image2: Image.Image,
                          img1_params: Dict[str, Any], img2_params: Dict[str, Any]) -> Image.Image:
    """
    ベース画像に2つの画像を合成する
    """
```

**機能:**
- 高品質リサイズ（LANCZOS補間）
- アルファチャンネル対応の合成処理
- 柔軟な位置・サイズ指定
- 透過情報の保持

#### 1.3 レスポンス生成エンジン
- HTML表示レスポンス（技術情報付き）
- PNG直接返却レスポンス
- JavaScriptダウンロード機能
- エラーハンドリングとログ出力

### 2. API Gatewayコンポーネント

#### 2.1 RESTエンドポイント設計
```
GET /images/composite
```

**パラメータ:**
- `image1`, `image2` (必須): 合成する画像
- `baseImage` (オプション): ベース画像
- `image1X`, `image1Y`, `image1Width`, `image1Height`: 画像1の配置
- `image2X`, `image2Y`, `image2Width`, `image2Height`: 画像2の配置
- `format`: 出力形式（html/png）

#### 2.2 CORS設定
```typescript
defaultCorsPreflightOptions: {
  allowOrigins: apigateway.Cors.ALL_ORIGINS,
  allowMethods: apigateway.Cors.ALL_METHODS,
  allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
}
```

#### 2.3 バイナリメディアタイプ対応
```typescript
binaryMediaTypes: ['image/png', 'image/jpeg', 'image/*']
```

### 3. Vue.js フロントエンドコンポーネント

#### 3.1 パラメータ設定フォーム
```vue
<template>
  <div class="form-container">
    <div class="form-group">
      <label>ベース画像:</label>
      <select v-model="params.baseImage">
        <option value="test">テスト画像</option>
        <option value="transparent">透明背景</option>
      </select>
    </div>
    <!-- 位置・サイズ設定フォーム -->
  </div>
</template>
```

**機能:**
- 画像ソース選択（テスト画像、S3パス）
- 位置・サイズの数値入力
- 出力形式選択
- プリセット例の提供

#### 3.2 画像表示・ダウンロードコンポーネント
```vue
<div class="result-container">
  <img :src="resultUrl" alt="合成画像" class="result-image" />
  <div class="actions">
    <button @click="downloadImage">画像をダウンロード</button>
    <button @click="copyApiUrl">API URLをコピー</button>
  </div>
</div>
```

**機能:**
- 合成画像のプレビュー表示
- 画像ダウンロード機能
- API URLコピー機能
- エラーハンドリングと再試行

#### 3.3 API通信コンポーネント
```javascript
async generateImage() {
  const response = await axios.get(apiUrl, { 
    responseType: 'blob',
    headers: { 'Accept': 'image/png, image/jpeg, image/*' }
  });
  
  // Content-Type判定による適切な処理
  const contentType = response.headers['content-type'];
  if (contentType && contentType.includes('image')) {
    this.resultUrl = URL.createObjectURL(response.data);
  }
}
```

### 4. S3ストレージコンポーネント

#### 4.1 画像リソースバケット
```typescript
this.resourcesBucket = new s3.Bucket(this, 'ImageResourcesBucket', {
  accessControl: s3.BucketAccessControl.PRIVATE,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});
```

#### 4.2 テスト画像バケット
```typescript
this.testImagesBucket = new s3.Bucket(this, 'TestImagesBucket', {
  accessControl: s3.BucketAccessControl.PRIVATE,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});
```

#### 4.3 フロントエンドホスティング
- CloudFront経由でのセキュアな配信
- Origin Access Identity (OAI)による制限
- SPA対応のエラーレスポンス設定

### 5. テストコンポーネント

#### 5.1 Lambda関数ユニットテスト
```python
class TestImageProcessor(unittest.TestCase):
    def test_fetch_image_from_s3(self):
        # S3画像取得のテスト
    
    def test_create_composite_image(self):
        # 画像合成処理のテスト
    
    def test_handler_success(self):
        # ハンドラー関数の正常系テスト
```

#### 5.2 API E2Eテスト（Playwright）
```typescript
test('基本的な画像合成API', async ({ request }) => {
  const response = await request.get('/images/composite?baseImage=test&image1=test&image2=test');
  expect(response.status()).toBe(200);
});

test('S3パス指定での画像合成', async ({ request }) => {
  const response = await request.get('/images/composite?image1=s3://bucket/key&image2=test');
  expect(response.status()).toBe(200);
});
```

#### 5.3 フロントエンドE2Eテスト
```typescript
test('フロントエンド画像生成機能', async ({ page }) => {
  await page.goto(FRONTEND_URL);
  await page.click('button:has-text("画像を生成")');
  await expect(page.locator('.result-image')).toBeVisible();
});
```

## データモデル

### APIリクエストモデル
```typescript
interface ImageCompositeRequest {
  // 必須パラメータ
  image1: string;           // 合成する1つ目の画像
  image2: string;           // 合成する2つ目の画像
  
  // オプションパラメータ
  baseImage?: string;       // ベース画像（未指定時は透明背景）
  format?: 'html' | 'png';  // 出力形式（デフォルト: html）
  
  // 画像1の配置パラメータ
  image1X?: number;         // X座標（デフォルト: 右端から20px）
  image1Y?: number;         // Y座標（デフォルト: 20）
  image1Width?: number;     // 幅（デフォルト: 300）
  image1Height?: number;    // 高さ（デフォルト: 200）
  
  // 画像2の配置パラメータ
  image2X?: number;         // X座標（デフォルト: 右端から20px）
  image2Y?: number;         // Y座標（デフォルト: 画像1の下）
  image2Width?: number;     // 幅（デフォルト: 300）
  image2Height?: number;    // 高さ（デフォルト: 200）
}
```

### 画像ソース形式
```typescript
type ImageSource = 
  | 'test'                    // テスト画像指定
  | `http://${string}`        // HTTP URL
  | `https://${string}`       // HTTPS URL
  | `s3://${string}/${string}` // S3パス
  | `${string}/${string}`;    // S3パス（プレフィックスなし）
```

### Lambda関数内部モデル
```python
@dataclass
class ImageParams:
    width: int
    height: int
    x: int
    y: int

@dataclass
class CompositeImageRequest:
    base_image_path: Optional[str]
    image1_path: str
    image2_path: str
    img1_params: ImageParams
    img2_params: ImageParams
    format: str
```

### APIレスポンスモデル
```typescript
// HTML形式レスポンス
interface HtmlResponse {
  statusCode: 200;
  headers: {
    'Content-Type': 'text/html; charset=utf-8';
    'Access-Control-Allow-Origin': '*';
  };
  body: string; // HTML文字列
}

// PNG形式レスポンス
interface PngResponse {
  statusCode: 200;
  headers: {
    'Content-Type': 'image/png';
    'Content-Disposition': string;
    'Access-Control-Allow-Origin': '*';
  };
  body: string; // Base64エンコードされた画像データ
  isBase64Encoded: true;
}

// エラーレスポンス
interface ErrorResponse {
  statusCode: 400 | 500;
  headers: {
    'Content-Type': 'application/json' | 'text/html; charset=utf-8';
    'Access-Control-Allow-Origin': '*';
  };
  body: string; // JSON文字列またはHTML文字列
}
```

### フロントエンド状態モデル
```typescript
interface AppState {
  // API設定
  apiBaseUrl: string;
  apiUrl: string;
  
  // フォームパラメータ
  params: ImageCompositeRequest;
  
  // UI状態
  isLoading: boolean;
  error: string | null;
  resultUrl: string;
  
  // 使用例データ
  examples: Example[];
}

interface Example {
  title: string;
  description: string;
  params: ImageCompositeRequest;
}
```

### テスト結果モデル
```typescript
interface TestSuite {
  name: string;
  tests: TestCase[];
  summary: TestSummary;
}

interface TestCase {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  error?: string;
  assertions: Assertion[];
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

interface Assertion {
  description: string;
  expected: any;
  actual: any;
  passed: boolean;
}
```

## エラーハンドリング

### 1. Lambda関数エラーハンドリング
```python
try:
    # 画像処理ロジック
    composite_img = create_composite_image(...)
except ValueError as e:
    logger.error(f"Invalid parameter: {str(e)}")
    return format_response(400, {'error': f"Parameter error: {str(e)}"})
except ClientError as e:
    logger.error(f"S3 access error: {str(e)}")
    return format_response(500, {'error': f"S3 error: {str(e)}"})
except Exception as e:
    logger.error(f"Unexpected error: {str(e)}")
    return format_response(500, {'error': f"Internal error: {str(e)}"})
```

**エラー分類:**
- **400 Bad Request**: パラメータ不正、画像URL無効
- **500 Internal Server Error**: S3アクセスエラー、画像処理エラー
- **詳細ログ**: CloudWatch Logsへの詳細情報出力

### 2. フロントエンドエラーハンドリング
```javascript
async generateImage() {
  try {
    const response = await axios.get(apiUrl, { responseType: 'blob' });
    // 正常処理
  } catch (error) {
    // エラー分類と適切な処理
    if (error.code === 'ERR_NAME_NOT_RESOLVED') {
      this.error = 'API サーバーに接続できません。';
    } else if (error.response?.status === 500) {
      this.error = 'サーバーエラーが発生しました。';
      // PNG形式で再試行
      await this.retryWithPngFormat();
    } else {
      this.error = error.message || 'Unknown error';
    }
  }
}
```

**フロントエンド再試行メカニズム:**
- 画像読み込み失敗時のPNG形式再試行
- Content-Type判定による適切な処理
- ユーザーフレンドリーなエラーメッセージ

### 3. API Gatewayエラーハンドリング
- CORS設定による跨域リクエスト対応
- バイナリメディアタイプ設定
- Lambda統合エラーの適切な変換

### 4. S3アクセスエラー対応
```python
def fetch_image_from_s3(bucket_name: str, object_key: str) -> Image.Image:
    try:
        s3_client = boto3.client('s3')
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        return Image.open(io.BytesIO(response['Body'].read()))
    except ClientError as e:
        error_code = e.response['Error']['Code']
        if error_code == 'NoSuchKey':
            raise ValueError(f"Image not found: s3://{bucket_name}/{object_key}")
        elif error_code == 'AccessDenied':
            raise ValueError(f"Access denied: s3://{bucket_name}/{object_key}")
        else:
            raise ValueError(f"S3 error ({error_code}): {str(e)}")
```

### 5. 画像処理エラー対応
- 不正な画像形式の検出
- メモリ不足エラーの処理
- 画像サイズ制限の実装
- アルファチャンネル変換エラーの処理

## テスト戦略

### 1. Lambda関数ユニットテスト
```python
# test/lambda/test_image_processor.py
class TestImageProcessor(unittest.TestCase):
    def test_fetch_image_from_s3(self):
        """S3からの画像取得テスト"""
        
    def test_fetch_image_from_url(self):
        """HTTP URLからの画像取得テスト"""
        
    def test_create_composite_image(self):
        """画像合成処理テスト"""
        
    def test_handler_success_cases(self):
        """ハンドラー関数の正常系テスト"""
        
    def test_handler_error_cases(self):
        """ハンドラー関数のエラー系テスト"""
```

**テスト対象:**
- 画像取得ロジック（S3、HTTP、テスト画像）
- 画像合成アルゴリズム
- パラメータ検証
- エラーハンドリング
- レスポンス生成

### 2. API統合テスト（Playwright）
```typescript
// test/e2e/image-processor.api.spec.ts
test.describe('画像合成API', () => {
  test('基本的な画像合成', async ({ request }) => {
    const response = await request.get('/images/composite?baseImage=test&image1=test&image2=test');
    expect(response.status()).toBe(200);
  });
  
  test('S3パス指定での画像合成', async ({ request }) => {
    const response = await request.get('/images/composite?image1=s3://bucket/key&image2=test');
    expect(response.status()).toBe(200);
  });
  
  test('パラメータ不正時のエラーハンドリング', async ({ request }) => {
    const response = await request.get('/images/composite?image1=invalid');
    expect(response.status()).toBe(400);
  });
});
```

**テスト対象:**
- APIエンドポイントの動作
- 各種パラメータパターン
- エラーレスポンス
- レスポンス形式（HTML/PNG）

### 3. フロントエンドE2Eテスト
```typescript
// test/e2e/frontend.spec.ts
test.describe('フロントエンドUI', () => {
  test('画像生成機能の基本動作', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.click('button:has-text("画像を生成")');
    await expect(page.locator('.result-image')).toBeVisible();
  });
  
  test('S3パス選択での画像生成', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.selectOption('select[v-model="params.image1"]', 's3://bucket/key');
    await page.click('button:has-text("画像を生成")');
    await expect(page.locator('.result-image')).toBeVisible();
  });
  
  test('使用例の読み込み', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.click('.example-card:first-child');
    await expect(page.locator('.result-image')).toBeVisible();
  });
});
```

**テスト対象:**
- UI要素の表示・操作
- フォーム入力と送信
- 画像表示とダウンロード
- エラー表示
- 使用例機能

### 4. パフォーマンステスト
- 大きな画像での処理時間測定
- 並列リクエストでの負荷テスト
- メモリ使用量の監視
- CloudFrontキャッシュ効果の測定

### 5. セキュリティテスト
- S3バケット権限の検証
- CORS設定の確認
- 不正なパラメータでの攻撃テスト
- CloudFront OAI設定の検証

## 実装手順

### Phase 1: インフラストラクチャ構築
1. **CDKスタック実装**
   - S3バケット作成（リソース、テスト画像、フロントエンド）
   - Lambda関数設定（Python 3.12、ARM64/X86_64）
   - API Gateway設定（CORS、バイナリメディアタイプ）
   - CloudFront設定（OAI、キャッシュ設定）

2. **権限設定**
   - Lambda関数のS3読み取り権限
   - CloudFrontのS3アクセス権限
   - 最小権限の原則に基づく設定

### Phase 2: Lambda関数実装
1. **画像処理コア機能**
   - Pillowライブラリによる画像処理
   - アルファチャンネル対応の合成処理
   - 高品質リサイズ機能

2. **画像取得エンジン**
   - S3からの画像取得（boto3）
   - HTTP URLからの画像取得（requests）
   - 並列処理による高速化
   - テスト画像の自動選択

3. **レスポンス生成**
   - HTML表示機能（技術情報付き）
   - PNG直接返却機能
   - JavaScriptダウンロード機能
   - エラーハンドリング

### Phase 3: フロントエンド実装
1. **Vue.js 3アプリケーション**
   - Vite + Tailwind CSSによる開発環境
   - レスポンシブデザイン
   - コンポーネント設計

2. **UI機能実装**
   - パラメータ設定フォーム
   - 画像プレビュー表示
   - ダウンロード・コピー機能
   - 使用例プリセット

3. **API通信機能**
   - Axiosによる非同期通信
   - エラーハンドリングと再試行
   - Content-Type判定処理

### Phase 4: テスト実装
1. **ユニットテスト**
   - Lambda関数のPythonテスト
   - 画像処理ロジックの検証
   - エラーケースの網羅

2. **E2Eテスト**
   - PlaywrightによるAPIテスト
   - フロントエンドUIテスト
   - 統合シナリオテスト

### Phase 5: デプロイと運用
1. **自動デプロイ**
   - CDKによるインフラ管理
   - フロントエンドビルドとデプロイ
   - CloudFrontキャッシュ無効化

2. **監視と運用**
   - CloudWatch Logsによるログ監視
   - パフォーマンスメトリクス
   - エラー率の監視

## パフォーマンス考慮事項

### 1. Lambda関数最適化
- **アーキテクチャ選択**: ARM64（高性能・低コスト）またはX86_64（ライブラリ互換性）
- **メモリ設定**: 1024MB（画像処理に最適）
- **並列処理**: `concurrent.futures`による複数画像の同時取得
- **パッケージ管理**: uvによる高速Pythonパッケージ管理

### 2. 画像処理最適化
- **高品質リサイズ**: LANCZOS補間による品質保持
- **アルファチャンネル**: RGBA変換による透過情報保持
- **メモリ効率**: 適切な画像サイズ制限
- **キャッシュ戦略**: 頻繁に使用される画像のキャッシュ

### 3. フロントエンド最適化
- **Vite**: 高速な開発サーバーとビルド
- **コード分割**: vendor chunkによる効率的なロード
- **Tailwind CSS**: ユーティリティファーストによる軽量CSS
- **CloudFront**: グローバルCDNによる高速配信

### 4. API最適化
- **バイナリメディアタイプ**: 効率的な画像データ転送
- **CORS設定**: 適切な跨域リクエスト処理
- **レスポンス圧縮**: gzip圧縮による転送量削減

## セキュリティ考慮事項

### 1. アクセス制御
- **S3バケット**: 完全プライベート設定
- **Lambda権限**: 最小権限の原則（S3読み取りのみ）
- **CloudFront OAI**: S3への直接アクセス制限
- **API Gateway**: CORS設定による適切な跨域制御

### 2. データ保護
- **S3暗号化**: S3マネージド暗号化
- **HTTPS強制**: CloudFrontでのHTTPS通信強制
- **入力検証**: パラメータの適切な検証とサニタイゼーション
- **エラー情報**: 機密情報を含まないエラーメッセージ

### 3. 運用セキュリティ
- **ログ監視**: CloudWatch Logsによる異常検知
- **アクセスログ**: CloudFrontアクセスログの記録
- **権限監査**: IAM権限の定期的な見直し
- **脆弱性対策**: 依存ライブラリの定期的な更新

### 4. 攻撃対策
- **DDoS対策**: CloudFrontによる分散攻撃軽減
- **入力制限**: 画像サイズ・リクエスト頻度の制限
- **リソース制限**: Lambda関数のタイムアウト・メモリ制限
- **監視アラート**: 異常なアクセスパターンの検知