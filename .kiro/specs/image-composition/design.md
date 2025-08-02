# 画像合成REST APIシステム - 設計書

## 概要

高性能・アルファチャンネル対応の画像合成REST APIシステムの包括的な設計。AWS CDK + Lambda + API Gateway + S3 + CloudFront構成で、2つまたは3つの画像を合成してPNG形式で出力する。Vue.js 3フロントエンドによる直感的なWebインターフェースを提供し、動的設定管理による環境非依存性を実現する。

**新機能追加:**
- **S3画像アップロード機能**: 署名付きURLを使用した安全な画像ファイルのアップロード
- **画像合成用画像選択機能**: 未選択・テスト画像・S3アップロード画像からの選択

**設計原則:**
- **後方互換性の完全保持**: 既存の2画像合成機能を維持しつつ3画像合成を追加
- **アルファチャンネル完全対応**: 透過情報を保持した高品質な画像合成
- **環境非依存性**: 動的設定管理によるデプロイ時URL自動設定
- **高性能処理**: 並列画像取得とLANCOS補間による最適化
- **セキュリティファースト**: IAM最小権限とCORS適切設定
- **テスト駆動開発**: 包括的なテストカバレッジによる品質保証

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
                                │                         │
                                ▼                         ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │   AWS Lambda     │    │ S3 Upload Bucket│
                       │ (Upload Manager) │───▶│ (Images)        │
                       └──────────────────┘    └─────────────────┘
```

### データフロー
1. **フロントエンド**: CloudFront → S3 Frontend → config.json読み込み
2. **API呼び出し**: Frontend → API Gateway → Lambda
3. **画像取得**: Lambda → S3/HTTP (並列処理)
4. **画像合成**: Lambda内でPillow処理
5. **レスポンス**: HTML/PNG → API Gateway → Frontend

**新機能のデータフロー:**
6. **画像アップロード**: Frontend → Upload Manager Lambda → 署名付きURL生成 → S3直接アップロード
7. **画像一覧取得**: Frontend → Upload Manager Lambda → S3画像リスト取得 → サムネイル生成

## コンポーネント設計

### 1. AWS CDKインフラストラクチャ

#### 1.1 メインスタック構成
```typescript
export class ImageProcessorApiStack extends cdk.Stack {
  // S3バケット群
  private resourcesBucket: s3.Bucket;
  private testImagesBucket: s3.Bucket;
  private frontendBucket: s3.Bucket;
  private uploadBucket: s3.Bucket;  // 新規追加: アップロード用バケット
  
  // Lambda関数
  private imageProcessorFunction: lambda.Function;
  private uploadManagerFunction: lambda.Function;  // 新規追加: アップロード管理
  
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
  version: process.env.npm_package_version || '2.4.0',
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

### 3. Upload Manager Lambda関数

#### 3.1 署名付きURL生成機能

**設計判断**: 署名付きURLを使用することで、フロントエンドから直接S3にアップロードでき、Lambda関数の負荷を軽減し、アップロード速度を向上させる。

```python
import boto3
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, Any

def generate_presigned_upload_url(event, context):
    """
    画像アップロード用の署名付きURL生成
    """
    try:
        # リクエストボディの解析
        body = json.loads(event.get('body', '{}'))
        file_name = body.get('fileName')
        file_type = body.get('fileType')
        file_size = body.get('fileSize', 0)
        
        # パラメータ検証
        if not file_name or not file_type:
            return format_response(400, {'error': 'fileName and fileType are required'})
        
        # ファイルサイズ制限（10MB）
        if file_size > 10 * 1024 * 1024:
            return format_response(400, {'error': 'File size exceeds 10MB limit'})
        
        # 対応ファイル形式の検証（画像のみ）
        allowed_types = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'image/tiff', 'image/x-tga'
        ]
        if file_type not in allowed_types:
            return format_response(400, {'error': f'Unsupported file type: {file_type}'})
        
        # ユニークなファイル名生成
        file_extension = file_name.split('.')[-1]
        unique_filename = f"{uuid.uuid4()}-{datetime.now().strftime('%Y%m%d_%H%M%S')}.{file_extension}"
        
        # S3キーの生成（画像のみ）
        s3_key = f"uploads/images/{unique_filename}"
        
        # 署名付きURL生成
        s3_client = boto3.client('s3')
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': os.environ['UPLOAD_BUCKET'],
                'Key': s3_key,
                'ContentType': file_type
            },
            ExpiresIn=3600  # 1時間有効
        )
        
        return format_response(200, {
            'uploadUrl': presigned_url,
            's3Key': s3_key,
            'bucketName': os.environ['UPLOAD_BUCKET'],
            'expiresIn': 3600
        })
        
    except Exception as e:
        logger.error(f"Presigned URL generation error: {e}")
        return format_response(500, {'error': str(e)})

def list_uploaded_images(event, context):
    """
    アップロードされた画像の一覧取得
    """
    try:
        s3_client = boto3.client('s3')
        bucket_name = os.environ['UPLOAD_BUCKET']
        
        # 画像ファイルのみを取得
        response = s3_client.list_objects_v2(
            Bucket=bucket_name,
            Prefix='uploads/images/',
            MaxKeys=100
        )
        
        images = []
        if 'Contents' in response:
            for obj in response['Contents']:
                # メタデータ取得
                head_response = s3_client.head_object(
                    Bucket=bucket_name,
                    Key=obj['Key']
                )
                
                # サムネイルURL生成（PNG形式のサムネイル）
                thumbnail_key = obj['Key'].replace('uploads/images/', 'thumbnails/').replace(
                    obj['Key'].split('.')[-1], 'png'
                )
                
                # サムネイルが存在するかチェック
                try:
                    s3_client.head_object(Bucket=bucket_name, Key=thumbnail_key)
                    thumbnail_url = s3_client.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': bucket_name, 'Key': thumbnail_key},
                        ExpiresIn=3600
                    )
                except s3_client.exceptions.NoSuchKey:
                    # サムネイルが存在しない場合は元画像を使用
                    thumbnail_url = s3_client.generate_presigned_url(
                        'get_object',
                        Params={'Bucket': bucket_name, 'Key': obj['Key']},
                        ExpiresIn=3600
                    )
                
                images.append({
                    'key': obj['Key'],
                    's3Path': f"s3://{bucket_name}/{obj['Key']}",
                    'fileName': obj['Key'].split('/')[-1],
                    'size': obj['Size'],
                    'lastModified': obj['LastModified'].isoformat(),
                    'contentType': head_response.get('ContentType', 'image/jpeg'),
                    'thumbnailUrl': thumbnail_url
                })
        
        return format_response(200, {
            'images': images,
            'count': len(images)
        })
        
    except Exception as e:
        logger.error(f"Image list error: {e}")
        return format_response(500, {'error': str(e)})
```

#### 3.2 アップロード完了通知処理

```python
def handle_upload_completion(event, context):
    """
    S3アップロード完了時の処理（S3イベント経由）
    """
    try:
        for record in event['Records']:
            bucket_name = record['s3']['bucket']['name']
            object_key = record['s3']['object']['key']
            
            # 画像の場合はサムネイル生成
            if object_key.startswith('uploads/images/'):
                generate_thumbnail(bucket_name, object_key)
            
            logger.info(f"Upload completed: {object_key}")
        
        return {'statusCode': 200}
        
    except Exception as e:
        logger.error(f"Upload completion handler error: {e}")
        return {'statusCode': 500}

def generate_thumbnail(bucket_name: str, object_key: str):
    """
    画像のサムネイル生成（PNG形式で統一）
    """
    try:
        s3_client = boto3.client('s3')
        
        # 元画像を取得
        response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
        image = Image.open(io.BytesIO(response['Body'].read()))
        
        # RGBAモードに変換（透過情報保持）
        if image.mode != 'RGBA':
            image = image.convert('RGBA')
        
        # サムネイル生成（200x200、アスペクト比保持）
        image.thumbnail((200, 200), Image.LANCZOS)
        
        # PNG形式でサムネイルを保存
        thumbnail_key = object_key.replace('uploads/images/', 'thumbnails/').replace(
            object_key.split('.')[-1], 'png'
        )
        thumbnail_buffer = io.BytesIO()
        image.save(thumbnail_buffer, format='PNG', optimize=True)
        thumbnail_buffer.seek(0)
        
        s3_client.put_object(
            Bucket=bucket_name,
            Key=thumbnail_key,
            Body=thumbnail_buffer.getvalue(),
            ContentType='image/png'
        )
        
        logger.info(f"PNG thumbnail generated: {thumbnail_key}")
        
    except Exception as e:
        logger.error(f"Thumbnail generation error: {e}")
```

#### 2.1 テスト画像生成機能

**設計判断**: テスト画像の自動生成により、外部依存なしでの機能検証を実現。各画像タイプに応じた適切な図形を生成し、アルファチャンネル対応により透過背景での合成を可能にする。

```python
def generate_circle_image(size: Tuple[int, int] = (400, 400), 
                         color: Tuple[int, int, int] = (239, 68, 68)) -> Image.Image:
    """
    赤色の円形画像を生成する
    
    Args:
        size: 画像サイズ (width, height)
        color: RGB色値 (デフォルト: 赤色)
        
    Returns:
        PIL.Image.Image: 透過背景の円形画像
    """
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 円の描画
    width, height = size
    margin = min(width, height) // 8
    draw.ellipse([margin, margin, width - margin, height - margin], 
                 fill=(*color, 255))
    
    return img

def generate_rectangle_image(size: Tuple[int, int] = (400, 400), 
                           color: Tuple[int, int, int] = (59, 130, 246)) -> Image.Image:
    """
    青色の四角形画像を生成する
    
    Args:
        size: 画像サイズ (width, height)
        color: RGB色値 (デフォルト: 青色)
        
    Returns:
        PIL.Image.Image: 透過背景の四角形画像
    """
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 四角形の描画
    width, height = size
    margin = min(width, height) // 8
    draw.rectangle([margin, margin, width - margin, height - margin], 
                   fill=(*color, 255))
    
    return img

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

**設計判断**: 統一されたエラーハンドリングと包括的なログ出力により、運用時のトラブルシューティングを容易にする。パラメータ検証を厳密に行い、セキュリティと安定性を確保する。
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

#### 2.3 画像取得エンジン

**設計判断**: 複数の画像ソース（S3、HTTP/HTTPS、テスト画像）に対応し、並列処理により高速化を実現。テスト画像の自動選択により、開発・テスト環境での利便性を向上させる。
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

#### 2.4 画像合成エンジン
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

### 4. Vue.js 3フロントエンド

#### 4.1 動的設定管理
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
      version: '2.4.0',
      environment: 'development',
      s3BucketNames: {
        testImages: 'default-test-bucket'
      }
    };
  }
}

export const configManager = new ConfigManager();
```

#### 4.2 画像アップロード機能

```javascript
// components/ImageUploader.vue
<template>
  <div class="image-uploader">
    <h3>画像アップロード</h3>
    
    <!-- ファイル選択 -->
    <div class="upload-area" @drop="handleDrop" @dragover.prevent>
      <input 
        ref="fileInput" 
        type="file" 
        accept="image/*" 
        @change="handleFileSelect"
        style="display: none"
      />
      <button @click="$refs.fileInput.click()" class="upload-button">
        📁 画像ファイルを選択
      </button>
      <p>または、画像ファイルをここにドラッグ&ドロップ</p>
    </div>
    
    <!-- アップロード進行状況 -->
    <div v-if="uploading" class="upload-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{width: uploadProgress + '%'}"></div>
      </div>
      <p>{{ uploadProgress }}% アップロード中...</p>
    </div>
    
    <!-- エラー表示 -->
    <div v-if="error" class="error-message">
      {{ error }}
    </div>
    
    <!-- 成功メッセージ -->
    <div v-if="uploadSuccess" class="success-message">
      ✅ アップロード完了: {{ uploadedFileName }}
    </div>
  </div>
</template>

<script>
export default {
  name: 'ImageUploader',
  
  data() {
    return {
      uploading: false,
      uploadProgress: 0,
      error: null,
      uploadSuccess: false,
      uploadedFileName: ''
    };
  },
  
  methods: {
    handleFileSelect(event) {
      const file = event.target.files[0];
      if (file) {
        this.uploadFile(file);
      }
    },
    
    handleDrop(event) {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file) {
        this.uploadFile(file);
      }
    },
    
    async uploadFile(file) {
      // ファイル検証
      if (!this.validateFile(file)) {
        return;
      }
      
      this.uploading = true;
      this.uploadProgress = 0;
      this.error = null;
      this.uploadSuccess = false;
      
      try {
        // 署名付きURL取得
        const presignedResponse = await this.getPresignedUrl(file);
        
        // S3に直接アップロード
        await this.uploadToS3(file, presignedResponse.uploadUrl);
        
        this.uploadSuccess = true;
        this.uploadedFileName = file.name;
        this.$emit('upload-complete', {
          fileName: file.name,
          s3Key: presignedResponse.s3Key,
          s3Path: `s3://${presignedResponse.bucketName}/${presignedResponse.s3Key}`
        });
        
      } catch (error) {
        this.error = this.handleUploadError(error);
      } finally {
        this.uploading = false;
      }
    },
    
    validateFile(file) {
      // ファイルサイズ制限（10MB）
      if (file.size > 10 * 1024 * 1024) {
        this.error = 'ファイルサイズは10MB以下にしてください';
        return false;
      }
      
      // ファイル形式チェック（画像のみ）
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'image/tiff', 'image/x-tga'
      ];
      
      if (!allowedTypes.includes(file.type)) {
        this.error = `対応していない画像形式です: ${file.type}`;
        return false;
      }
      
      return true;
    },
    
    async getPresignedUrl(file) {
      const response = await axios.post('/api/upload/presigned-url', {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size
      });
      
      return response.data;
    },
    
    async uploadToS3(file, uploadUrl) {
      return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            this.uploadProgress = Math.round((event.loaded / event.total) * 100);
          }
        });
        
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            resolve();
          } else {
            reject(new Error(`Upload failed: ${xhr.status}`));
          }
        });
        
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });
        
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });
    },
    
    handleUploadError(error) {
      if (error.response?.status === 400) {
        return error.response.data.error || 'アップロードパラメータが無効です';
      } else if (error.response?.status === 413) {
        return 'ファイルサイズが大きすぎます';
      } else {
        return 'アップロードに失敗しました。再試行してください。';
      }
    }
  }
};
</script>
```

#### 4.3 画像選択コンポーネント

```javascript
// components/ImageSelector.vue
<template>
  <div class="image-selector">
    <label class="form-label">{{ label }}:</label>
    
    <select v-model="selectedType" @change="handleTypeChange" class="form-select">
      <option value="">未選択</option>
      <option value="test">既存テスト画像</option>
      <option value="s3">S3アップロード画像</option>
    </select>
    
    <!-- テスト画像選択 -->
    <div v-if="selectedType === 'test'" class="test-image-selection">
      <select v-model="selectedTestImage" @change="handleTestImageChange" class="form-select">
        <option value="">テスト画像を選択</option>
        <option value="test">自動選択（image1=円、image2=四角、image3=三角）</option>
        <option value="circle">赤い円</option>
        <option value="rectangle">青い四角</option>
        <option value="triangle">緑の三角</option>
      </select>
    </div>
    
    <!-- S3画像選択 -->
    <div v-if="selectedType === 's3'" class="s3-image-selection">
      <div v-if="loadingImages" class="loading">
        画像一覧を読み込み中...
      </div>
      
      <div v-else-if="s3Images.length === 0" class="no-images">
        アップロードされた画像がありません
      </div>
      
      <div v-else class="image-grid">
        <div 
          v-for="image in s3Images" 
          :key="image.key"
          class="image-item"
          :class="{ selected: selectedS3Image === image.s3Path }"
          @click="selectS3Image(image)"
        >
          <img :src="image.thumbnailUrl" :alt="image.fileName" />
          <p class="image-name">{{ image.fileName }}</p>
          <p class="image-size">{{ formatFileSize(image.size) }}</p>
        </div>
      </div>
      
      <button @click="refreshImages" class="refresh-button">
        🔄 画像一覧を更新
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ImageSelector',
  
  props: {
    label: {
      type: String,
      required: true
    },
    modelValue: {
      type: String,
      default: ''
    },
    imageType: {
      type: String,
      required: true // 'image1', 'image2', 'image3'
    }
  },
  
  emits: ['update:modelValue'],
  
  data() {
    return {
      selectedType: '',
      selectedTestImage: '',
      selectedS3Image: '',
      s3Images: [],
      loadingImages: false
    };
  },
  
  watch: {
    modelValue: {
      immediate: true,
      handler(newValue) {
        this.updateSelectionFromValue(newValue);
      }
    }
  },
  
  methods: {
    handleTypeChange() {
      if (this.selectedType === '') {
        this.$emit('update:modelValue', '');
      } else if (this.selectedType === 'test') {
        this.selectedTestImage = 'test';
        this.handleTestImageChange();
      } else if (this.selectedType === 's3') {
        this.loadS3Images();
      }
    },
    
    handleTestImageChange() {
      if (this.selectedTestImage === 'test') {
        this.$emit('update:modelValue', 'test');
      } else if (this.selectedTestImage) {
        // 特定のテスト画像を選択した場合のS3パス
        const testImageMap = {
          'circle': 's3://test-bucket/images/circle_red.png',
          'rectangle': 's3://test-bucket/images/rectangle_blue.png',
          'triangle': 's3://test-bucket/images/triangle_green.png'
        };
        this.$emit('update:modelValue', testImageMap[this.selectedTestImage]);
      }
    },
    
    selectS3Image(image) {
      this.selectedS3Image = image.s3Path;
      this.$emit('update:modelValue', image.s3Path);
    },
    
    async loadS3Images() {
      this.loadingImages = true;
      try {
        const response = await axios.get('/api/upload/images');
        this.s3Images = response.data.images;
      } catch (error) {
        console.error('Failed to load S3 images:', error);
        this.s3Images = [];
      } finally {
        this.loadingImages = false;
      }
    },
    
    async refreshImages() {
      await this.loadS3Images();
    },
    
    updateSelectionFromValue(value) {
      if (!value) {
        this.selectedType = '';
      } else if (value === 'test') {
        this.selectedType = 'test';
        this.selectedTestImage = 'test';
      } else if (value.startsWith('s3://')) {
        if (value.includes('/images/circle_red.png') || 
            value.includes('/images/rectangle_blue.png') || 
            value.includes('/images/triangle_green.png')) {
          this.selectedType = 'test';
          // 特定のテスト画像の逆マッピング
        } else {
          this.selectedType = 's3';
          this.selectedS3Image = value;
          if (this.s3Images.length === 0) {
            this.loadS3Images();
          }
        }
      }
    },
    
    formatFileSize(bytes) {
      if (bytes === 0) return '0 Bytes';
      const k = 1024;
      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
  }
};
</script>
```

#### 4.4 メインアプリケーションコンポーネント
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

// 新規追加: アップロード関連モデル
interface PresignedUrlRequest {
  fileName: string;
  fileType: string; // 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/tiff' | 'image/x-tga'
  fileSize: number;
}

interface PresignedUrlResponse {
  uploadUrl: string;
  s3Key: string;
  bucketName: string;
  expiresIn: number;
}

interface UploadedImage {
  key: string;
  s3Path: string;
  fileName: string;
  size: number;
  lastModified: string;
  contentType: string;
  thumbnailUrl: string;
}

interface ImageListResponse {
  images: UploadedImage[];
  count: number;
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

## API設計

### 新規エンドポイント

#### 1. 署名付きURL生成エンドポイント
```
POST /api/upload/presigned-url
Content-Type: application/json

Request Body:
{
  "fileName": "image.jpg",
  "fileType": "image/jpeg",
  "fileSize": 5000000
}

対応形式: JPEG, PNG, GIF, WebP, TIFF, TGA

Response (200):
{
  "uploadUrl": "https://s3.amazonaws.com/bucket/key?signature=...",
  "s3Key": "uploads/images/uuid-timestamp.jpg",
  "bucketName": "upload-bucket",
  "expiresIn": 3600
}

Response (400):
{
  "error": "File size exceeds 10MB limit"
}
```

#### 2. アップロード画像一覧エンドポイント
```
GET /api/upload/images

Response (200):
{
  "images": [
    {
      "key": "uploads/images/uuid-timestamp.jpg",
      "s3Path": "s3://bucket/uploads/images/uuid-timestamp.jpg",
      "fileName": "my-image.jpg",
      "size": 1024000,
      "lastModified": "2025-07-31T10:00:00Z",
      "contentType": "image/jpeg",
      "thumbnailUrl": "https://s3.amazonaws.com/bucket/thumbnails/uuid-timestamp.jpg?signature=..."
    }
  ],
  "count": 1
}

Response (500):
{
  "error": "Failed to list images"
}
```

#### 3. 既存エンドポイントの拡張
```
GET /images/composite

新しいパラメータ:
- image1, image2, image3: 空文字列の場合は未選択として扱う
- 未選択の画像がある場合は、選択された画像のみで合成を実行

例:
- image1=test&image2=&image3= → image1のみで合成（1画像モード）
- image1=test&image2=test&image3= → image1とimage2で合成（2画像モード）
- image1=test&image2=test&image3=test → 3画像で合成（3画像モード）
```

## エラーハンドリング

**設計判断**: 包括的なエラーハンドリング戦略により、システムの堅牢性と運用性を確保する。各レイヤーでの適切なエラー処理と詳細なログ出力により、トラブルシューティングを容易にする。

### 1. Lambda関数エラー処理
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
        'ConnectionError': f'{image_name}の取得中にネットワークエラーが発生しました',
        'TimeoutError': f'{image_name}の取得がタイムアウトしました',
        'MemoryError': f'{image_name}の処理中にメモリ不足が発生しました'
    }
    
    error_type = type(error).__name__
    message = error_messages.get(error_type, f'{image_name}の処理中にエラーが発生しました: {str(error)}')
    
    logger.error(f"Image error [{error_type}]: {message}")
    return format_response(400, {'error': message})

def validate_parameters(params: Dict[str, Any]) -> List[str]:
    """パラメータ検証とエラーメッセージ生成"""
    errors = []
    
    # 必須パラメータの検証
    if not params.get('image1'):
        errors.append('image1パラメータは必須です')
    if not params.get('image2'):
        errors.append('image2パラメータは必須です')
    
    # 位置・サイズパラメータの検証
    for image_num in ['1', '2', '3']:
        if params.get(f'image{image_num}'):
            x = params.get(f'image{image_num}X', 0)
            y = params.get(f'image{image_num}Y', 0)
            width = params.get(f'image{image_num}Width', 100)
            height = params.get(f'image{image_num}Height', 100)
            
            if x < 0 or y < 0:
                errors.append(f'image{image_num}の位置座標は0以上である必要があります')
            if width <= 0 or height <= 0:
                errors.append(f'image{image_num}のサイズは1以上である必要があります')
            if width > 5000 or height > 5000:
                errors.append(f'image{image_num}のサイズは5000ピクセル以下である必要があります')
    
    # フォーマットパラメータの検証
    format_param = params.get('format', 'html')
    if format_param not in ['html', 'png']:
        errors.append('formatパラメータはhtmlまたはpngである必要があります')
    
    return errors

def handle_validation_errors(errors: List[str]) -> Dict:
    """バリデーションエラーの処理"""
    logger.warning(f"Parameter validation failed: {errors}")
    return format_response(400, {
        'error': 'パラメータが無効です',
        'details': errors
    })
```

### 2. フロントエンドエラー処理
```javascript
class ErrorHandler {
  static handleApiError(error) {
    console.error('API Error:', error);
    
    if (error.code === 'ERR_NAME_NOT_RESOLVED') {
      return 'API サーバーに接続できません。ネットワーク接続を確認してください。';
    } else if (error.response?.status === 500) {
      return 'サーバーエラーが発生しました。しばらく待ってから再試行してください。';
    } else if (error.response?.status === 400) {
      const errorData = error.response.data;
      if (errorData.details && Array.isArray(errorData.details)) {
        return `リクエストパラメータに問題があります:\n${errorData.details.join('\n')}`;
      }
      return 'リクエストパラメータに問題があります。設定を確認してください。';
    } else if (error.response?.status === 403) {
      return 'アクセス権限がありません。管理者に連絡してください。';
    } else if (error.response?.status === 429) {
      return 'リクエストが多すぎます。しばらく待ってから再試行してください。';
    } else {
      return error.message || 'Unknown error';
    }
  }
  
  static handleConfigError(error) {
    console.error('Configuration Error:', error);
    return '設定の読み込みに失敗しました。デフォルト設定で続行します。';
  }
  
  static handleImageError(error) {
    console.error('Image Error:', error);
    return '画像の処理中にエラーが発生しました。画像ファイルを確認してください。';
  }
}

// Vue.jsコンポーネントでの使用例
export default {
  methods: {
    async generateImage() {
      this.isLoading = true;
      this.error = null;
      
      try {
        const apiUrl = this.buildApiUrl();
        const response = await axios.get(apiUrl, {
          responseType: 'blob',
          timeout: 30000, // 30秒タイムアウト
          headers: { 'Accept': 'image/png, image/jpeg, image/*' }
        });
        
        // 成功時の処理
        this.handleSuccessResponse(response);
        
      } catch (error) {
        this.error = ErrorHandler.handleApiError(error);
        
        // エラー分析とリトライ判定
        if (this.shouldRetry(error)) {
          this.scheduleRetry();
        }
      } finally {
        this.isLoading = false;
      }
    },
    
    shouldRetry(error) {
      // 一時的なエラーの場合はリトライを許可
      const retryableErrors = [500, 502, 503, 504];
      return retryableErrors.includes(error.response?.status);
    },
    
    scheduleRetry() {
      if (this.retryCount < 3) {
        this.retryCount++;
        setTimeout(() => {
          this.generateImage();
        }, 2000 * this.retryCount); // 指数バックオフ
      }
    }
  }
};
```

### 3. インフラストラクチャエラー処理
```typescript
// CDKでのエラーハンドリング設定
export class ImageProcessorApiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    
    // Lambda関数のエラー設定
    const imageProcessorFunction = new lambda.Function(this, 'ImageProcessor', {
      // ... 他の設定 ...
      
      // デッドレターキューの設定
      deadLetterQueue: new sqs.Queue(this, 'ImageProcessorDLQ', {
        retentionPeriod: cdk.Duration.days(14)
      }),
      
      // リトライ設定
      retryAttempts: 2,
      
      // タイムアウト設定
      timeout: cdk.Duration.seconds(30),
      
      // メモリ設定（画像処理のため多めに確保）
      memorySize: 1024,
      
      // 環境変数でログレベル設定
      environment: {
        LOG_LEVEL: 'INFO',
        PYTHONPATH: '/var/runtime'
      }
    });
    
    // CloudWatch Alarmの設定
    const errorAlarm = new cloudwatch.Alarm(this, 'LambdaErrorAlarm', {
      metric: imageProcessorFunction.metricErrors(),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING
    });
    
    // API Gatewayのエラーレスポンス設定
    const api = new apigateway.RestApi(this, 'ImageCompositeApi', {
      // ... 他の設定 ...
      
      // デフォルトエラーレスポンス
      defaultMethodOptions: {
        methodResponses: [
          {
            statusCode: '200',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true
            }
          },
          {
            statusCode: '400',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true
            }
          },
          {
            statusCode: '500',
            responseParameters: {
              'method.response.header.Access-Control-Allow-Origin': true
            }
          }
        ]
      }
    });
  }
}
```

### 4. ログ戦略
```python
import logging
import json
from datetime import datetime

# ログ設定
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def log_request_start(event):
    """リクエスト開始ログ"""
    logger.info(f"Request started: {json.dumps({
        'requestId': event.get('requestContext', {}).get('requestId'),
        'httpMethod': event.get('httpMethod'),
        'path': event.get('path'),
        'queryStringParameters': event.get('queryStringParameters'),
        'timestamp': datetime.utcnow().isoformat()
    })}")

def log_request_end(request_id, status_code, duration):
    """リクエスト終了ログ"""
    logger.info(f"Request completed: {json.dumps({
        'requestId': request_id,
        'statusCode': status_code,
        'duration': duration,
        'timestamp': datetime.utcnow().isoformat()
    })}")

def log_image_processing(operation, details):
    """画像処理ログ"""
    logger.info(f"Image processing: {json.dumps({
        'operation': operation,
        'details': details,
        'timestamp': datetime.utcnow().isoformat()
    })}")

def log_error(error, context):
    """エラーログ"""
    logger.error(f"Error occurred: {json.dumps({
        'error': str(error),
        'errorType': type(error).__name__,
        'context': context,
        'timestamp': datetime.utcnow().isoformat()
    })}")
```

### 5. 監視とアラート
```typescript
// CloudWatch メトリクスとアラームの設定
const lambdaErrorRate = new cloudwatch.Alarm(this, 'LambdaErrorRate', {
  metric: imageProcessorFunction.metricErrors({
    period: cdk.Duration.minutes(5)
  }).with({
    statistic: 'Sum'
  }),
  threshold: 10,
  evaluationPeriods: 2,
  alarmDescription: 'Lambda function error rate is too high'
});

const lambdaDuration = new cloudwatch.Alarm(this, 'LambdaDuration', {
  metric: imageProcessorFunction.metricDuration({
    period: cdk.Duration.minutes(5)
  }).with({
    statistic: 'Average'
  }),
  threshold: 25000, // 25秒
  evaluationPeriods: 2,
  alarmDescription: 'Lambda function duration is too long'
});

const apiGateway4xxErrors = new cloudwatch.Alarm(this, 'ApiGateway4xxErrors', {
  metric: api.metricClientError({
    period: cdk.Duration.minutes(5)
  }),
  threshold: 20,
  evaluationPeriods: 2,
  alarmDescription: 'API Gateway 4xx error rate is too high'
});
```

## パフォーマンスと拡張性

**設計判断**: 高性能で拡張可能なシステム設計により、大量のリクエストと複雑な画像処理に対応する。並列処理、キャッシュ戦略、自動スケーリングを組み合わせて最適なパフォーマンスを実現する。

### 1. 並列処理による高速化
```python
def fetch_images_parallel(image_paths: Dict[str, str]) -> Dict[str, Image.Image]:
    """
    複数画像の並列取得による高速化
    
    設計判断: ThreadPoolExecutorを使用して最大4つの画像を並列取得し、
    処理時間を大幅に短縮する。特に3画像合成時の効果が顕著。
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

def optimize_image_processing():
    """
    画像処理の最適化設定
    
    - LANCZOS補間による高品質リサイズ
    - RGBA変換による透過情報保持
    - メモリ効率的な画像操作
    """
    # 高品質リサイズ設定
    RESIZE_FILTER = Image.LANCZOS
    
    # メモリ使用量の最適化
    Image.MAX_IMAGE_PIXELS = 50000000  # 50MP制限
    
    # 並列処理設定
    MAX_WORKERS = 4
    TIMEOUT_SECONDS = 30
```

### 2. キャッシュ戦略
```typescript
// CloudFrontキャッシュ設定
const distribution = new cloudfront.Distribution(this, 'Distribution', {
  defaultBehavior: {
    origin: new origins.S3Origin(frontendBucket, {
      originAccessIdentity: oai
    }),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: new cloudfront.CachePolicy(this, 'CachePolicy', {
      cachePolicyName: 'ImageCompositeCache',
      defaultTtl: cdk.Duration.hours(24),
      maxTtl: cdk.Duration.days(365),
      minTtl: cdk.Duration.seconds(0),
      headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Accept'),
      queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
      cookieBehavior: cloudfront.CacheCookieBehavior.none()
    })
  },
  additionalBehaviors: {
    '/config.json': {
      origin: new origins.S3Origin(frontendBucket, {
        originAccessIdentity: oai
      }),
      cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED, // 設定ファイルはキャッシュしない
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
    }
  }
});
```

### 3. Lambda関数の最適化
```typescript
const imageProcessorFunction = new lambda.Function(this, 'ImageProcessor', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'image_processor.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/python')),
  
  // パフォーマンス最適化設定
  memorySize: 1024,        // 画像処理に十分なメモリ
  timeout: cdk.Duration.seconds(30),  // 適切なタイムアウト
  
  // 同時実行数の制御
  reservedConcurrentExecutions: 100,
  
  // 環境変数による最適化
  environment: {
    PYTHONPATH: '/var/runtime',
    PIL_DISABLE_PLATFORM_GUESSING: '1',  // Pillowの最適化
    PARALLEL_WORKERS: '4',
    MAX_IMAGE_SIZE: '5000'
  },
  
  // レイヤーによる依存関係の最適化
  layers: [
    lambda.LayerVersion.fromLayerVersionArn(
      this,
      'PillowLayer',
      'arn:aws:lambda:region:account:layer:pillow:1'
    )
  ]
});
```

### 4. API Gatewayの最適化
```typescript
const api = new apigateway.RestApi(this, 'ImageCompositeApi', {
  restApiName: 'Image Composite API',
  description: 'High-performance image composition API',
  
  // スロットリング設定
  deployOptions: {
    throttleSettings: {
      rateLimit: 1000,      // 1秒あたり1000リクエスト
      burstLimit: 2000      // バースト時2000リクエスト
    },
    
    // ログ設定
    loggingLevel: apigateway.MethodLoggingLevel.INFO,
    dataTraceEnabled: true,
    metricsEnabled: true
  },
  
  // バイナリメディアタイプの設定
  binaryMediaTypes: ['image/png', 'image/jpeg', 'image/*'],
  
  // CORS設定
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'Accept'],
    maxAge: cdk.Duration.hours(1)
  }
});
```

### 5. 自動スケーリングとモニタリング
```typescript
// Lambda関数のメトリクス監視
const concurrentExecutionsAlarm = new cloudwatch.Alarm(this, 'ConcurrentExecutions', {
  metric: imageProcessorFunction.metricConcurrentExecutions(),
  threshold: 80,  // 80%の同時実行数でアラート
  evaluationPeriods: 2,
  alarmDescription: 'Lambda concurrent executions approaching limit'
});

const invocationRateAlarm = new cloudwatch.Alarm(this, 'InvocationRate', {
  metric: imageProcessorFunction.metricInvocations({
    period: cdk.Duration.minutes(1)
  }),
  threshold: 500,  // 1分間に500回以上の呼び出しでアラート
  evaluationPeriods: 3,
  alarmDescription: 'High Lambda invocation rate detected'
});

// API Gatewayのメトリクス監視
const apiLatencyAlarm = new cloudwatch.Alarm(this, 'ApiLatency', {
  metric: api.metricLatency({
    period: cdk.Duration.minutes(5)
  }),
  threshold: 10000,  // 10秒以上のレイテンシでアラート
  evaluationPeriods: 2,
  alarmDescription: 'API Gateway latency is too high'
});
```

### 6. フロントエンドの最適化
```javascript
// Vue.jsアプリケーションの最適化
export default {
  data() {
    return {
      // リクエストキューによる同時実行制御
      requestQueue: [],
      maxConcurrentRequests: 3,
      activeRequests: 0
    };
  },
  
  methods: {
    async generateImage() {
      // リクエストキューに追加
      return new Promise((resolve, reject) => {
        this.requestQueue.push({ resolve, reject, params: { ...this.params } });
        this.processQueue();
      });
    },
    
    async processQueue() {
      if (this.activeRequests >= this.maxConcurrentRequests || this.requestQueue.length === 0) {
        return;
      }
      
      this.activeRequests++;
      const { resolve, reject, params } = this.requestQueue.shift();
      
      try {
        const result = await this.executeImageGeneration(params);
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        this.activeRequests--;
        this.processQueue(); // 次のリクエストを処理
      }
    },
    
    async executeImageGeneration(params) {
      const apiUrl = this.buildApiUrl(params);
      
      // プリフライトリクエストの最適化
      const response = await axios.get(apiUrl, {
        responseType: 'blob',
        timeout: 30000,
        headers: { 
          'Accept': 'image/png, image/jpeg, image/*',
          'Cache-Control': 'no-cache'
        },
        // リトライ設定
        retry: 3,
        retryDelay: (retryCount) => retryCount * 1000
      });
      
      return response;
    }
  }
};
```

### 7. パフォーマンス指標とSLA
```typescript
// パフォーマンス目標の定義
const performanceTargets = {
  // レスポンス時間
  apiResponseTime: {
    target: '< 5秒',
    measurement: 'P95レスポンス時間',
    alarm: '10秒以上'
  },
  
  // スループット
  throughput: {
    target: '1000 req/min',
    measurement: '1分間あたりのリクエスト数',
    alarm: '処理能力の80%超過'
  },
  
  // 可用性
  availability: {
    target: '99.9%',
    measurement: '月間稼働率',
    alarm: 'エラー率5%以上'
  },
  
  // 画像処理時間
  imageProcessing: {
    target: '< 3秒',
    measurement: 'Lambda実行時間',
    alarm: '25秒以上（タイムアウト近く）'
  }
};

// ダッシュボードの作成
const dashboard = new cloudwatch.Dashboard(this, 'PerformanceDashboard', {
  dashboardName: 'ImageCompositePerformance',
  widgets: [
    [
      new cloudwatch.GraphWidget({
        title: 'Lambda Duration',
        left: [imageProcessorFunction.metricDuration()],
        width: 12
      })
    ],
    [
      new cloudwatch.GraphWidget({
        title: 'API Gateway Latency',
        left: [api.metricLatency()],
        width: 12
      })
    ],
    [
      new cloudwatch.GraphWidget({
        title: 'Error Rates',
        left: [
          imageProcessorFunction.metricErrors(),
          api.metricClientError(),
          api.metricServerError()
        ],
        width: 12
      })
    ]
  ]
});
```

## テスト戦略

**設計判断**: 包括的なテスト戦略により、システムの品質と信頼性を確保する。ユニットテスト、統合テスト、E2Eテストの3層構造で、各レイヤーの機能を検証し、後方互換性とアルファチャンネル対応を保証する。

### 1. ユニットテスト（Lambda関数）
```python
class TestImageComposition(unittest.TestCase):
    def test_two_image_composition(self):
        """2画像合成の基本テスト - 後方互換性検証"""
        # テスト画像の準備
        base_img = generate_test_base_image()
        image1 = generate_circle_image()
        image2 = generate_rectangle_image()
        
        # 合成処理の実行（image3=None）
        result = create_composite_image(base_img, image1, image2, None, default_params)
        
        # 結果の検証
        self.assertEqual(result.mode, 'RGBA')
        self.assertIsNotNone(result)
        self.assertTrue(has_alpha_channel(result))
        
    def test_three_image_composition(self):
        """3画像合成の基本テスト - 新機能検証"""
        # 3つのテスト画像の準備
        base_img = generate_test_base_image()
        image1 = generate_circle_image()
        image2 = generate_rectangle_image()
        image3 = generate_triangle_image()
        
        # 合成処理の実行
        result = create_composite_image(base_img, image1, image2, image3, default_params)
        
        # 結果の検証
        self.assertEqual(result.mode, 'RGBA')
        self.assertIsNotNone(result)
        self.assertTrue(has_alpha_channel(result))
        
    def test_parameter_validation(self):
        """パラメータ検証テスト"""
        # 必須パラメータ不足のテスト
        with self.assertRaises(ValueError):
            parse_image_parameters({'image1': None, 'image2': 'test'})
            
        # 無効な位置パラメータのテスト
        with self.assertRaises(ValueError):
            parse_image_parameters({'image1': 'test', 'image2': 'test', 'image1X': -1})
            
    def test_test_image_selection(self):
        """テスト画像自動選択テスト"""
        # 各画像タイプの自動選択を検証
        circle_img = get_test_image('image1')
        rectangle_img = get_test_image('image2')
        triangle_img = get_test_image('image3')
        
        self.assertIsNotNone(circle_img)
        self.assertIsNotNone(rectangle_img)
        self.assertIsNotNone(triangle_img)
        self.assertEqual(triangle_img.mode, 'RGBA')
        
    def test_alpha_channel_preservation(self):
        """アルファチャンネル保持テスト"""
        # 透過画像の合成でアルファチャンネルが保持されることを確認
        transparent_img = create_transparent_test_image()
        result = create_composite_image(None, transparent_img, transparent_img, None, default_params)
        
        self.assertTrue(has_transparency(result))
        self.assertEqual(result.mode, 'RGBA')
        
    def test_parallel_image_fetching(self):
        """並列画像取得テスト"""
        # 複数画像の並列取得が正常に動作することを確認
        image_paths = {
            'image1': 'test',
            'image2': 'test',
            'image3': 'test'
        }
        
        start_time = time.time()
        images = fetch_images_parallel(image_paths)
        end_time = time.time()
        
        self.assertEqual(len(images), 3)
        self.assertLess(end_time - start_time, 5.0)  # 5秒以内で完了
```

### 2. 統合テスト（API Gateway + Lambda）
```typescript
test.describe('画像合成API統合テスト', () => {
  test('基本的な2画像合成API', async ({ request }) => {
    const response = await request.get(
      '/images/composite?image1=test&image2=test&format=png'
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  });
  
  test('3画像合成API', async ({ request }) => {
    const response = await request.get(
      '/images/composite?image1=test&image2=test&image3=test&format=png'
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  });
  
  test('S3画像パス指定テスト', async ({ request }) => {
    const bucketName = process.env.TEST_BUCKET_NAME;
    const response = await request.get(
      `/images/composite?image1=s3://${bucketName}/images/circle_red.png&image2=s3://${bucketName}/images/rectangle_blue.png`
    );
    expect(response.status()).toBe(200);
  });
  
  test('パラメータバリデーションテスト', async ({ request }) => {
    // 必須パラメータ不足
    const response = await request.get('/images/composite?image1=test');
    expect(response.status()).toBe(400);
    
    // 無効なフォーマット
    const response2 = await request.get('/images/composite?image1=test&image2=test&format=invalid');
    expect(response2.status()).toBe(400);
  });
  
  test('HTML形式レスポンステスト', async ({ request }) => {
    const response = await request.get(
      '/images/composite?image1=test&image2=test&format=html'
    );
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    
    const html = await response.text();
    expect(html).toContain('<img');
    expect(html).toContain('JavaScript');
  });
  
  test('後方互換性テスト', async ({ request }) => {
    // image3を指定しない場合の動作確認
    const response = await request.get(
      '/images/composite?image1=test&image2=test'
    );
    expect(response.status()).toBe(200);
  });
});
```

### 3. E2Eテスト（フロントエンド）
```typescript
test.describe('フロントエンドE2Eテスト', () => {
  test('動的設定読み込みテスト', async ({ page }) => {
    await page.goto('/');
    
    // 設定読み込み完了まで待機
    await expect(page.locator('[data-testid="config-loading"]')).toBeHidden();
    
    // バージョン情報が表示されることを確認
    await expect(page.locator('[data-testid="version-info"]')).toContainText('2.3.0');
    
    // API URLが動的に設定されていることを確認
    const apiUrl = await page.evaluate(() => window.appConfig?.apiUrl);
    expect(apiUrl).toBeTruthy();
  });
  
  test('2画像合成フロントエンド操作', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 2画像のみ選択
    await page.selectOption('[data-testid="image1-select"]', 'test');
    await page.selectOption('[data-testid="image2-select"]', 'test');
    
    // image3は選択しない（空文字のまま）
    await expect(page.locator('[data-testid="image3-select"]')).toHaveValue('');
    
    // 画像生成ボタンをクリック
    await page.click('[data-testid="generate-button"]');
    
    // ボタンテキストが「2画像を合成」であることを確認
    await expect(page.locator('[data-testid="generate-button"]')).toContainText('2画像を合成');
    
    // 結果画像が表示されることを確認
    await expect(page.locator('[data-testid="result-image"]')).toBeVisible();
  });
  
  test('3画像合成フロントエンド操作', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
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
  
  test('使用例機能テスト', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 3画像合成の使用例を選択
    await page.click('[data-testid="example-3-images"]');
    
    // パラメータが自動設定されることを確認
    await expect(page.locator('[data-testid="image3-select"]')).toHaveValue('test');
    
    // 自動実行されて結果が表示されることを確認
    await expect(page.locator('[data-testid="result-image"]')).toBeVisible();
  });
  
  test('画像ダウンロード機能テスト', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // 画像生成
    await page.selectOption('[data-testid="image1-select"]', 'test');
    await page.selectOption('[data-testid="image2-select"]', 'test');
    await page.click('[data-testid="generate-button"]');
    
    // 結果表示を待機
    await expect(page.locator('[data-testid="result-image"]')).toBeVisible();
    
    // ダウンロードボタンのテスト
    const downloadPromise = page.waitForEvent('download');
    await page.click('[data-testid="download-button"]');
    const download = await downloadPromise;
    
    expect(download.suggestedFilename()).toBe('composite-image.png');
  });
  
  test('レスポンシブデザインテスト', async ({ page }) => {
    // モバイルビューポートでのテスト
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // UI要素が適切に表示されることを確認
    await expect(page.locator('[data-testid="form-container"]')).toBeVisible();
    await expect(page.locator('[data-testid="generate-button"]')).toBeVisible();
    
    // タブレットビューポートでのテスト
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page.locator('[data-testid="config-table"]')).toBeVisible();
  });
});
```

### 4. パフォーマンステスト
```typescript
test.describe('パフォーマンステスト', () => {
  test('並列画像取得の性能テスト', async ({ request }) => {
    const startTime = Date.now();
    
    const response = await request.get(
      '/images/composite?image1=test&image2=test&image3=test&format=png'
    );
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    expect(response.status()).toBe(200);
    expect(duration).toBeLessThan(10000); // 10秒以内で完了
  });
  
  test('大量リクエストの負荷テスト', async ({ request }) => {
    const promises = [];
    
    // 10個の並列リクエストを送信
    for (let i = 0; i < 10; i++) {
      promises.push(
        request.get('/images/composite?image1=test&image2=test&format=png')
      );
    }
    
    const responses = await Promise.all(promises);
    
    // 全てのリクエストが成功することを確認
    responses.forEach(response => {
      expect(response.status()).toBe(200);
    });
  });
});
```

### 5. セキュリティテスト
```typescript
test.describe('セキュリティテスト', () => {
  test('CORS設定テスト', async ({ request }) => {
    const response = await request.options('/images/composite');
    
    expect(response.headers()['access-control-allow-origin']).toBe('*');
    expect(response.headers()['access-control-allow-methods']).toContain('GET');
  });
  
  test('無効なS3パスの処理テスト', async ({ request }) => {
    const response = await request.get(
      '/images/composite?image1=s3://invalid-bucket/invalid-path&image2=test'
    );
    
    expect(response.status()).toBe(400);
    
    const error = await response.json();
    expect(error.error).toContain('Failed to load');
  });
  
  test('SQLインジェクション対策テスト', async ({ request }) => {
    const maliciousInput = "test'; DROP TABLE users; --";
    const response = await request.get(
      `/images/composite?image1=${encodeURIComponent(maliciousInput)}&image2=test`
    );
    
    // エラーレスポンスが返されることを確認（SQLが実行されないこと）
    expect(response.status()).toBe(400);
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