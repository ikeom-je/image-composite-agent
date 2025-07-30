# 画像合成REST APIシステム - 設計書

## 概要

高性能・アルファチャンネル対応の画像合成REST APIシステムの包括的な設計。AWS CDK + Lambda + API Gateway + S3 + CloudFront構成で、2つまたは3つの画像を合成してPNG形式で出力する。Vue.js 3フロントエンドによる直感的なWebインターフェースを提供し、動的設定管理による環境非依存性を実現する。

## アーキテクチャ

### システム全体構成
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CloudFront    │───▶│   S3 Frontend    │    │   API Gateway   │
│ (Global CDN)    │    │ (Vue.js SPA)     │    │ (REST API)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                          │
                                                          ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   S3 Resources  │◀───│   AWS Lambda     │───▶│   S3 Test Images│
│ (Images/Assets) │    │ (Image Processor)│    │ (Test Assets)   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### データフロー
1. **フロントエンド**: CloudFront → S3 Frontend → config.json読み込み
2. **API呼び出し**: Frontend → API Gateway → Lambda
3. **画像取得**: Lambda → S3/HTTP (並列処理)
4. **画像合成**: Lambda内でPillow処理
5. **レスポンス**: HTML/PNG → API Gateway → Frontend

## コンポーネント設計

### 1. AWS CDKインフラストラクチャ

#### 1.1 メインスタック構成```typescr
ipt
export class ImageProcessorApiStack extends cdk.Stack {
  // S3バケット群
  private resourcesBucket: s3.Bucket;
  private testImagesBucket: s3.Bucket;
  private frontendBucket: s3.Bucket;
  
  // Lambda関数
  private imageProcessorFunction: lambda.Function;
  
  // API Gateway
  private api: apigateway.RestApi;
  
  // CloudFront
  private distribution: cloudfront.Distribution;
}
```

#### 1.2 動的設定管理システム
```typescript
// 設定ファイルの動的生成
const configContent = {
  apiUrl: this.api.url + 'images/composite',
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
```

### 2. Lambda関数の画像処理エンジン

#### 2.1 三角形画像生成機能
```python
def generate_triangle_image(size: Tuple[int, int] = (400, 400), 
                          color: Tuple[int, int, int] = (34, 197, 94)) -> Image.Image:
    """
    緑色の三角形画像を生成する
    
    Args:
        size: 画像サイズ (width, height)
        color: RGB色値 (デフォルト: 緑色)
        
    Returns:
        PIL.Image.Image: 透過背景の三角形画像
    """
    # RGBA画像を作成（透過背景）
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 三角形の頂点を計算
    width, height = size
    triangle_points = [
        (width // 2, height // 4),      # 上の頂点
        (width // 4, height * 3 // 4),  # 左下の頂点
        (width * 3 // 4, height * 3 // 4)  # 右下の頂点
    ]
    
    # 三角形を描画（アンチエイリアス対応）
    draw.polygon(triangle_points, fill=(*color, 255))
    
    return img
```

#### 2.2 メインハンドラー関数
```python
def handler(event, context):
    """
    Lambda ハンドラー関数 - 2/3画像合成対応版
    """
    try:
        # パラメータ解析
        query_params = event.get('queryStringParameters', {}) or {}
        
        # 必須パラメータ
        image1_param = query_params.get('image1')
        image2_param = query_params.get('image2')
        
        # オプションパラメータ
        image3_param = query_params.get('image3')
        base_image_param = query_params.get('baseImage')
        format_param = query_params.get('format', 'html')
        
        # パラメータ検証
        if not image1_param or not image2_param:
            return format_response(400, {'error': 'image1 and image2 are required'})
        
        # 画像パラメータの解析
        img_params = parse_image_parameters(query_params)
        
        # 画像の並列取得
        images = fetch_images_parallel({
            'base': base_image_param,
            'image1': image1_param,
            'image2': image2_param,
            'image3': image3_param
        })
        
        # 画像合成処理
        composite_img = create_composite_image(
            images['base'],
            images['image1'],
            images['image2'],
            images.get('image3'),
            img_params
        )
        
        # レスポンス生成
        return generate_response(composite_img, format_param, query_params)
        
    except Exception as e:
        logger.error(f"Handler error: {e}")
        return format_response(500, {'error': str(e)})
```

#### 2.2 画像取得エンジン
```python
def fetch_images_parallel(image_paths: Dict[str, str]) -> Dict[str, Image.Image]:
    """
    複数画像の並列取得（高速化）
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        future_to_path = {}
        
        for name, path in image_paths.items():
            if path:  # パスが指定されている場合のみ
                future_to_path[executor.submit(fetch_image, path, name)] = name
        
        images = {}
        for future in concurrent.futures.as_completed(future_to_path):
            name = future_to_path[future]
            try:
                images[name] = future.result()
                logger.info(f"✅ Successfully loaded {name}")
            except Exception as e:
                logger.error(f"❌ Error loading image {name}: {e}")
                raise ValueError(f"Failed to load {name}: {str(e)}")
        
        return images

def fetch_image(url_or_s3_path: str, image_type: str = "unknown") -> Image.Image:
    """
    画像取得の統一インターフェース
    """
    # テスト画像指定の場合
    if url_or_s3_path == "test":
        return get_test_image(image_type)
    
    # S3パスの場合
    if url_or_s3_path.startswith('s3://'):
        return fetch_image_from_s3(url_or_s3_path)
    
    # HTTP/HTTPSの場合
    if url_or_s3_path.startswith(('http://', 'https://')):
        return fetch_image_from_url(url_or_s3_path)
    
    raise ValueError(f"Unsupported image path: {url_or_s3_path}")

def get_test_image(image_type: str) -> Image.Image:
    """
    テスト画像の自動選択（3画像対応）
    """
    test_bucket = os.environ.get('TEST_BUCKET')
    
    test_image_map = {
        'base': 'images/aws-logo.png',
        'baseImage': 'images/aws-logo.png',
        'image1': 'images/circle_red.png',
        'image2': 'images/rectangle_blue.png',
        'image3': 'images/triangle_green.png'  # 新規追加
    }
    
    image_path = test_image_map.get(image_type, 'images/aws-logo.png')
    return fetch_image_from_s3(test_bucket, image_path)
```

#### 2.3 画像合成エンジン
```python
def create_composite_image(base_img: Image.Image, 
                          image1: Image.Image, 
                          image2: Image.Image,
                          image3: Optional[Image.Image],
                          params: Dict[str, Any]) -> Image.Image:
    """
    2つまたは3つの画像を合成する（後方互換性対応）
    """
    logger.info(f"Creating composite with {3 if image3 else 2} images")
    
    # ベース画像の準備
    if base_img is None:
        # 透明背景の作成
        base_img = Image.new('RGBA', (2000, 1000), (0, 0, 0, 0))
    
    # ベース画像をRGBAモードに変換
    if base_img.mode != 'RGBA':
        base_img = base_img.convert('RGBA')
    
    composite = base_img.copy()
    
    # 画像1の合成
    img1_resized = image1.resize(
        (params['image1']['width'], params['image1']['height']), 
        Image.LANCZOS
    )
    if img1_resized.mode != 'RGBA':
        img1_resized = img1_resized.convert('RGBA')
    
    composite.paste(
        img1_resized, 
        (params['image1']['x'], params['image1']['y']), 
        img1_resized
    )
    
    # 画像2の合成
    img2_resized = image2.resize(
        (params['image2']['width'], params['image2']['height']), 
        Image.LANCZOS
    )
    if img2_resized.mode != 'RGBA':
        img2_resized = img2_resized.convert('RGBA')
    
    composite.paste(
        img2_resized, 
        (params['image2']['x'], params['image2']['y']), 
        img2_resized
    )
    
    # 画像3の合成（オプション）
    if image3 and 'image3' in params:
        logger.info(f"Adding third image at ({params['image3']['x']}, {params['image3']['y']})")
        img3_resized = image3.resize(
            (params['image3']['width'], params['image3']['height']), 
            Image.LANCZOS
        )
        if img3_resized.mode != 'RGBA':
            img3_resized = img3_resized.convert('RGBA')
        
        composite.paste(
            img3_resized, 
            (params['image3']['x'], params['image3']['y']), 
            img3_resized
        )
    
    logger.info("Composite image created successfully")
    return composite
```

### 3. Vue.js 3フロントエンド

#### 3.1 動的設定管理
```javascript
// utils/config.js
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
}

export const configManager = new ConfigManager();
```

#### 3.2 メインアプリケーションコンポーネント
```vue
<template>
  <div class="app-container">
    <!-- ヘッダー -->
    <header class="header">
      <h1>🎨 画像合成REST API デモ</h1>
      <p class="subtitle">高性能・アルファチャンネル対応の画像合成REST API</p>
      <div v-if="config" class="config-info">
        <small>Version: {{ config.version }} | Environment: {{ config.environment }}</small>
      </div>
    </header>

    <!-- 設定読み込み中 -->
    <div v-if="!configLoaded" class="config-loading">
      <div class="spinner"></div>
      <p>設定を読み込み中...</p>
    </div>

    <!-- メインコンテンツ -->
    <div v-else class="main-content">
      <!-- パラメータ設定フォーム -->
      <div class="form-container">
        <h2>画像合成パラメータ</h2>
        
        <!-- ベース画像選択 -->
        <div class="form-group">
          <label class="form-label">ベース画像:</label>
          <select v-model="params.baseImage" class="form-select">
            <option value="test">テスト画像 (AWS Logo)</option>
            <option value="transparent">透明背景</option>
          </select>
        </div>

        <!-- 3画像設定テーブル -->
        <ImageConfigTable 
          v-model:params="params" 
          :config="config" 
        />

        <!-- 出力形式選択 -->
        <div class="form-group">
          <label class="form-label">出力形式:</label>
          <select v-model="params.format" class="form-select">
            <option value="html">HTML表示</option>
            <option value="png">PNG直接ダウンロード</option>
          </select>
        </div>

        <!-- 画像生成ボタン -->
        <GenerateButton 
          @click="generateImage" 
          :loading="isLoading"
          :disabled="!params.image1 || !params.image2"
          :image-count="params.image3 ? 3 : 2"
        />
      </div>

      <!-- 結果表示 -->
      <ResultDisplay 
        :loading="isLoading"
        :error="error"
        :result-url="resultUrl"
        :api-url="apiUrl"
        @download="downloadImage"
        @copy-url="copyApiUrl"
      />
    </div>

    <!-- 使用例 -->
    <ExampleCards 
      :examples="examples" 
      @load-example="loadExample"
    />
  </div>
</template>

<script>
import { configManager } from './utils/config.js';
import ImageConfigTable from './components/ImageConfigTable.vue';
import GenerateButton from './components/GenerateButton.vue';
import ResultDisplay from './components/ResultDisplay.vue';
import ExampleCards from './components/ExampleCards.vue';

export default {
  name: 'App',
  components: {
    ImageConfigTable,
    GenerateButton,
    ResultDisplay,
    ExampleCards
  },
  
  data() {
    return {
      config: null,
      configLoaded: false,
      apiBaseUrl: '',
      
      params: {
        baseImage: 'test',
        image1: 'test',
        image1X: 1600, image1Y: 20, image1Width: 300, image1Height: 200,
        image2: 'test',
        image2X: 1600, image2Y: 240, image2Width: 300, image2Height: 200,
        image3: '',
        image3X: 20, image3Y: 20, image3Width: 300, image3Height: 200,
        format: 'html'
      },
      
      resultUrl: '',
      apiUrl: '',
      isLoading: false,
      error: null,
      
      examples: [
        {
          title: '🎨 基本的な3画像合成',
          description: '円・四角・三角の3つの図形を合成',
          params: {
            baseImage: 'test',
            image1: 'test', image2: 'test', image3: 'test',
            image1X: 1600, image1Y: 20, image1Width: 300, image1Height: 200,
            image2X: 1600, image2Y: 240, image2Width: 300, image2Height: 200,
            image3X: 20, image3Y: 20, image3Width: 300, image3Height: 200,
            format: 'html'
          }
        },
        {
          title: '📐 基本的な2画像合成',
          description: '従来の2画像合成（後方互換性）',
          params: {
            baseImage: 'test',
            image1: 'test', image2: 'test', image3: '',
            image1X: 1600, image1Y: 20, image1Width: 300, image1Height: 200,
            image2X: 1600, image2Y: 240, image2Width: 300, image2Height: 200,
            format: 'html'
          }
        }
      ]
    };
  },

  async created() {
    await this.loadConfiguration();
  },

  methods: {
    async loadConfiguration() {
      try {
        this.config = await configManager.loadConfig();
        this.apiBaseUrl = this.config.apiUrl;
        this.configLoaded = true;
        this.updateExamplesWithS3Paths();
      } catch (error) {
        console.error('Configuration loading failed:', error);
        this.apiBaseUrl = import.meta.env.VITE_API_URL || '';
        this.configLoaded = true;
      }
    },

    updateExamplesWithS3Paths() {
      if (this.config?.s3BucketNames?.testImages) {
        const bucketName = this.config.s3BucketNames.testImages;
        this.examples.forEach(example => {
          if (example.params.image1?.startsWith('s3://placeholder')) {
            example.params.image1 = `s3://${bucketName}/images/circle_red.png`;
          }
          if (example.params.image2?.startsWith('s3://placeholder')) {
            example.params.image2 = `s3://${bucketName}/images/rectangle_blue.png`;
          }
          if (example.params.image3?.startsWith('s3://placeholder')) {
            example.params.image3 = `s3://${bucketName}/images/triangle_green.png`;
          }
        });
      }
    },

    buildApiUrl() {
      const url = new URL(this.apiBaseUrl);
      
      // 必須パラメータ
      if (this.params.baseImage) url.searchParams.set('baseImage', this.params.baseImage);
      url.searchParams.set('image1', this.params.image1);
      url.searchParams.set('image2', this.params.image2);
      
      // 画像1,2のパラメータ
      url.searchParams.set('image1X', this.params.image1X);
      url.searchParams.set('image1Y', this.params.image1Y);
      url.searchParams.set('image1Width', this.params.image1Width);
      url.searchParams.set('image1Height', this.params.image1Height);
      url.searchParams.set('image2X', this.params.image2X);
      url.searchParams.set('image2Y', this.params.image2Y);
      url.searchParams.set('image2Width', this.params.image2Width);
      url.searchParams.set('image2Height', this.params.image2Height);
      
      // 画像3のパラメータ（指定されている場合のみ）
      if (this.params.image3) {
        url.searchParams.set('image3', this.params.image3);
        url.searchParams.set('image3X', this.params.image3X);
        url.searchParams.set('image3Y', this.params.image3Y);
        url.searchParams.set('image3Width', this.params.image3Width);
        url.searchParams.set('image3Height', this.params.image3Height);
      }
      
      url.searchParams.set('format', this.params.format);
      return url.toString();
    },

    async generateImage() {
      this.isLoading = true;
      this.error = null;
      this.resultUrl = '';

      try {
        const apiUrl = this.buildApiUrl();
        this.apiUrl = apiUrl;

        const response = await axios.get(apiUrl, {
          responseType: 'blob',
          headers: { 'Accept': 'image/png, image/jpeg, image/*' }
        });

        const contentType = response.headers['content-type'];
        
        if (contentType && contentType.includes('image')) {
          this.resultUrl = URL.createObjectURL(response.data);
        } else {
          // HTMLレスポンスの場合の処理
          const reader = new FileReader();
          reader.onload = (e) => {
            const htmlContent = e.target.result;
            const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
            if (imgMatch && imgMatch[1]) {
              this.resultUrl = imgMatch[1];
            } else {
              const pngUrl = new URL(apiUrl);
              pngUrl.searchParams.set('format', 'png');
              this.resultUrl = pngUrl.toString();
            }
          };
          reader.readAsText(response.data);
        }
      } catch (error) {
        this.handleApiError(error);
      } finally {
        this.isLoading = false;
      }
    },

    handleApiError(error) {
      console.error('API Error:', error);
      
      if (error.code === 'ERR_NAME_NOT_RESOLVED') {
        this.error = 'API サーバーに接続できません。ネットワーク接続を確認してください。';
      } else if (error.response?.status === 500) {
        this.error = 'サーバーエラーが発生しました。しばらく待ってから再試行してください。';
      } else if (error.response?.status === 400) {
        this.error = 'リクエストパラメータに問題があります。設定を確認してください。';
      } else {
        this.error = error.message || 'Unknown error';
      }
    },

    downloadImage() {
      if (!this.resultUrl) return;
      const link = document.createElement('a');
      link.href = this.resultUrl;
      link.download = 'composite-image.png';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    copyApiUrl() {
      if (!this.apiUrl) return;
      navigator.clipboard.writeText(this.apiUrl)
        .then(() => alert('API URLをクリップボードにコピーしました'))
        .catch(err => console.error('Failed to copy:', err));
    },

    loadExample(example) {
      this.params = { ...example.params };
      this.generateImage();
    }
  }
};
</script>
```

## データモデル

### APIリクエストモデル
```typescript
interface ImageCompositeRequest {
  // 必須パラメータ
  image1: string;
  image2: string;
  
  // オプションパラメータ
  image3?: string;
  baseImage?: string;
  format?: 'html' | 'png';
  
  // 位置・サイズパラメータ
  image1X?: number; image1Y?: number;
  image1Width?: number; image1Height?: number;
  image2X?: number; image2Y?: number;
  image2Width?: number; image2Height?: number;
  image3X?: number; image3Y?: number;
  image3Width?: number; image3Height?: number;
}
```

### Lambda内部モデル
```python
@dataclass
class ImageParams:
    x: int
    y: int
    width: int
    height: int

@dataclass
class CompositeRequest:
    base_image_path: Optional[str]
    image1_path: str
    image2_path: str
    image3_path: Optional[str]
    image1_params: ImageParams
    image2_params: ImageParams
    image3_params: Optional[ImageParams]
    format: str
```

## エラーハンドリング

### Lambda関数エラー処理
```python
def format_response(status_code: int, body: Any, headers: Dict[str, str] = None) -> Dict:
    """統一されたレスポンス形式"""
    default_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    }
    
    if headers:
        default_headers.update(headers)
    
    return {
        'statusCode': status_code,
        'headers': default_headers,
        'body': json.dumps(body) if isinstance(body, (dict, list)) else body
    }

def handle_image_error(error: Exception, image_name: str) -> Dict:
    """画像処理エラーの統一ハンドリング"""
    error_messages = {
        'FileNotFoundError': f'{image_name}が見つかりません',
        'PermissionError': f'{image_name}へのアクセス権限がありません',
        'ValueError': f'{image_name}の形式が無効です',
        'ConnectionError': f'{image_name}の取得中にネットワークエラーが発生しました'
    }
    
    error_type = type(error).__name__
    message = error_messages.get(error_type, f'{image_name}の処理中にエラーが発生しました: {str(error)}')
    
    logger.error(f"Image error [{error_type}]: {message}")
    return format_response(400, {'error': message})
```

## テスト戦略

### ユニットテスト
```python
class TestImageComposition(unittest.TestCase):
    def test_two_image_composition(self):
        """2画像合成の基本テスト"""
        # テスト画像の準備
        # 合成処理の実行
        # 結果の検証
        
    def test_three_image_composition(self):
        """3画像合成の基本テスト"""
        # テスト画像の準備
        # 合成処理の実行
        # 結果の検証
        
    def test_parameter_validation(self):
        """パラメータ検証テスト"""
        # 無効なパラメータでのテスト
        # エラーレスポンスの検証
```

### E2Eテスト
```typescript
test.describe('画像合成API', () => {
  test('基本的な2画像合成', async ({ request }) => {
    const response = await request.get('/images/composite?image1=test&image2=test');
    expect(response.status()).toBe(200);
  });
  
  test('3画像合成', async ({ request }) => {
    const response = await request.get('/images/composite?image1=test&image2=test&image3=test');
    expect(response.status()).toBe(200);
  });
  
  test('フロントエンド操作', async ({ page }) => {
    await page.goto('/');
    await page.selectOption('[data-testid="image3-select"]', 'test');
    await page.click('[data-testid="generate-button"]');
    await expect(page.locator('[data-testid="result-image"]')).toBeVisible();
  });
});
```

## セキュリティ設計

### IAM権限設定
```typescript
// Lambda実行ロール
const lambdaRole = new iam.Role(this, 'LambdaExecutionRole', {
  assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
  managedPolicies: [
    iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole')
  ],
  inlinePolicies: {
    S3Access: new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject'],
          resources: [
            this.resourcesBucket.arnForObjects('*'),
            this.testImagesBucket.arnForObjects('*')
          ]
        })
      ]
    })
  }
});
```

### CORS設定
```typescript
// API Gateway CORS設定
const corsOptions = {
  allowOrigins: apigateway.Cors.ALL_ORIGINS,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: cdk.Duration.hours(1)
};
```

## パフォーマンス最適化

### Lambda設定
```typescript
const imageProcessorFunction = new lambda.Function(this, 'ImageProcessor', {
  runtime: lambda.Runtime.PYTHON_3_12,
  memorySize: 1024,  // 画像処理に十分なメモリ
  timeout: cdk.Duration.seconds(30),  // 複数画像処理に対応
  environment: {
    PYTHONPATH: '/var/runtime:/opt/python',
    LOG_LEVEL: 'INFO'
  }
});
```

### CloudFront設定
```typescript
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: new origins.S3Origin(frontendBucket, { originAccessIdentity: oai }),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
    compress: true
  },
  additionalBehaviors: {
    '/config.json': {
      origin: new origins.S3Origin(frontendBucket, { originAccessIdentity: oai }),
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED  // 設定ファイルはキャッシュしない
    }
  }
});
```