# 画像合成REST APIシステム - 統合設計書

## 概要

高性能・アルファチャンネル対応の画像合成REST APIシステムの包括的な設計。AWS CDK + Lambda + API Gateway + S3 + CloudFront構成で、2つまたは3つの画像を合成してPNG形式で出力する。Vue.js 3フロントエンドによる直感的なWebインターフェースを提供し、動的設定管理による環境非依存性を実現する。

この設計は、現在のフロントエンド（v2.4.1）の画像合成機能を修正し、v2.3.0で利用可能だった詳細なパラメータ設定テーブルを復活させ、1920x1080解像度での画像合成を実現する。

**設計原則:**
- **後方互換性の完全保持**: 既存の2画像合成機能を維持しつつ3画像合成を追加
- **アルファチャンネル完全対応**: 透過情報を保持した高品質な画像合成
- **環境非依存性**: 動的設定管理によるデプロイ時URL自動設定
- **高性能処理**: 並列画像取得とLANCOS補間による最適化
- **セキュリティファースト**: IAM最小権限とCORS適切設定
- **テスト駆動開発**: 包括的なテストカバレッジによる品質保証
- **UI/UX継続性**: v2.3.0のテーブルベースUIデザインの復活

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

### コンポーネントアーキテクチャ

```
App.vue (メインコンテナ)
├── NotificationSystem.vue (既存)
├── LoadingOverlay.vue (既存)
├── PerformanceMonitor.vue (既存)
├── ImageUploader.vue (既存 - S3アップロード)
├── ImageConfigTable.vue (強化 - メインパラメータテーブル)
├── ImageSelector.vue (修正 - テーブル統合)
└── ResultDisplay.vue (新規 - 専用結果コンポーネント)
```

### データフロー
```
ユーザー入力 → ImageConfigTable → App.vue状態 → API呼び出し → ResultDisplay
     ↑                                                           ↓
ImageSelector ←→ ImageUploader (S3画像) ←→ NotificationSystem
```

## コンポーネント設計

### 1. 強化されたApp.vue

**目的**: すべてのコンポーネントを統合し、アプリケーション全体の状態を管理するメインコンテナ。

**主要な変更点**:
- ImageConfigTableを主要なパラメータ設定インターフェースとして統合
- 1920x1080キャンバスサイズの実装
- API統合問題の修正
- 既存のストア（config、app、notification）との互換性維持

**状態管理**:
```javascript
const params = ref({
  // キャンバス設定（1920x1080）
  canvas_width: 1920,
  canvas_height: 1080,
  
  // ベース画像
  baseImage: 'transparent',
  baseOpacity: 100,  // ベース画像透明度（0-100、デフォルト100=不透明）
  
  // 画像設定
  image1: {
    source: 'test',
    x: 100,
    y: 100,
    width: 400,
    height: 300
  },
  image2: {
    source: 'test', 
    x: 600,
    y: 100,
    width: 400,
    height: 300
  },
  image3: {
    source: '',
    x: 350,
    y: 500,
    width: 400,
    height: 300
  },
  
  // 動画生成設定
  videoGeneration: {
    enabled: false,
    duration: 3,
    format: 'XMF'
  },
  
  // 出力形式
  format: 'html'
})
```

### 2. 強化されたImageConfigTable.vue

**目的**: v2.3.0のテーブルデザインに基づく、パラメータ設定のための主要インターフェース。

**機能**:
- 2テーブルレイアウト: 画像選択テーブル + パラメータ設定テーブル
- 1920x1080アスペクト比での視覚的レイアウトプレビュー
- リアルタイム検証とエラー表示
- 2画像・3画像モードのサポート
- ImageSelectorコンポーネントとの統合

**テーブル構造**:

**画像選択テーブル**:
```
| 画像      | 画像1 (必須)    | 画像2 (必須)    | 画像3 (オプション) |
|-----------|----------------|----------------|-------------------|
| 画像選択   | [Selector]     | [Selector]     | [Selector]        |
```

**パラメータ設定テーブル**:
```
| 設定項目 | 画像1 | 画像2 | 画像3 (無効) |
|----------|-------|-------|-------------|
| X座標    | [100] | [600] | [350]       |
| Y座標    | [100] | [100] | [500]       |
| 幅       | [400] | [400] | [400]       |
| 高さ     | [300] | [300] | [300]       |
```

**レイアウトプレビュー**:
- 1920x1080キャンバスの縮小表現（1:5スケールで384x216）
- カラーコード化された画像位置（赤、青、緑）
- インタラクティブなホバー効果
- パラメータ変更時のリアルタイム更新

### 3. 修正されたImageSelector.vue

**目的**: テーブルレイアウトとシームレスに統合する簡素化されたセレクターコンポーネント。

**統合ポイント**:
- 親（ImageConfigTable）への選択変更の送信
- テスト画像、S3画像、HTTP URLのサポート
- テーブルセルに適したコンパクトデザイン
- 既存のS3画像読み込み機能の維持

**選択オプション**:
```javascript
const selectionOptions = {
  test: {
    label: 'テスト画像',
    options: [
      { value: 'test', label: '自動選択' },
      { value: 'circle', label: '🔴 赤い円' },
      { value: 'rectangle', label: '🔷 青い四角' },
      { value: 'triangle', label: '🔺 緑の三角' }
    ]
  },
  s3: {
    label: 'S3画像',
    options: [] // 動的に読み込み
  },
  url: {
    label: 'HTTP URL',
    options: [] // ユーザー入力
  }
}
```

### 4. 新しいResultDisplay.vue

**目的**: 合成結果の表示とダウンロードを処理する専用コンポーネント。

**機能**:
- エラーハンドリング付きの画像表示
- ダウンロード機能
- API URL表示とコピー
- 読み込み状態
- エラーメッセージ表示

**インターフェース**:
```javascript
interface Props {
  resultUrl: string
  apiUrl: string
  isLoading: boolean
  error: string | null
}

interface Emits {
  'download-image': void
  'copy-api-url': void
  'retry-generation': void
}
```

### 5. API統合レイヤー

**目的**: 様々なレスポンス形式とエラーシナリオを処理する堅牢なAPI統合。

**API URL構築**:
```javascript
const buildApiUrl = (params) => {
  const url = new URL(configStore.apiUrl)
  
  // キャンバスサイズ（1920x1080）
  url.searchParams.set('canvas_width', '1920')
  url.searchParams.set('canvas_height', '1080')
  
  // ベース画像
  if (params.baseImage) {
    url.searchParams.set('baseImage', params.baseImage)
  }
  
  // 必須画像
  url.searchParams.set('image1', params.image1.source)
  url.searchParams.set('image1_x', params.image1.x.toString())
  url.searchParams.set('image1_y', params.image1.y.toString())
  url.searchParams.set('image1_width', params.image1.width.toString())
  url.searchParams.set('image1_height', params.image1.height.toString())
  
  // image2も同様...
  
  // オプションのimage3
  if (params.image3.source) {
    url.searchParams.set('image3', params.image3.source)
    // ... その他のimage3パラメータ
  }
  
  // 動画生成パラメータ（オプション）
  if (params.videoGeneration.enabled) {
    url.searchParams.set('generate_video', 'true')
    url.searchParams.set('video_duration', params.videoGeneration.duration.toString())
    url.searchParams.set('video_format', params.videoGeneration.format)
  }
  
  // ベース画像透明度（オプション、デフォルト100）
  if (params.baseOpacity !== undefined && params.baseOpacity !== 100) {
    url.searchParams.set('baseOpacity', params.baseOpacity.toString())
  }
  
  // 出力形式
  url.searchParams.set('format', params.format)
  
  return url.toString()
}
```

**レスポンス処理**:
```javascript
const handleApiResponse = async (response) => {
  const contentType = response.headers['content-type']
  
  if (contentType?.includes('image')) {
    // 直接画像レスポンス
    return URL.createObjectURL(response.data)
  } else if (contentType?.includes('text/html')) {
    // HTMLレスポンス - 画像を抽出
    const htmlContent = await response.data.text()
    const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/)
    return imgMatch?.[1] || null
  } else {
    // PNG形式へのフォールバック
    const pngUrl = new URL(apiUrl)
    pngUrl.searchParams.set('format', 'png')
    const pngResponse = await axios.get(pngUrl.toString(), { responseType: 'blob' })
    return URL.createObjectURL(pngResponse.data)
  }
}
```

## データモデル

### 画像設定モデル

```typescript
interface ImageConfig {
  source: string // 'test'、S3パス、またはHTTP URL
  x: number      // X座標（0-1920）
  y: number      // Y座標（0-1080）
  width: number  // 幅（10-1920）
  height: number // 高さ（10-1080）
}

interface VideoGenerationConfig {
  enabled: boolean
  duration: number    // 秒数（デフォルト3秒）
  format: string      // フォーマット（デフォルトXMF）
}

interface CompositionParams {
  canvas_width: 1920
  canvas_height: 1080
  baseImage: string
  baseOpacity: number  // 0-100（デフォルト100=完全不透明）。サーバー側で [0,100] にクランプ、非数値は100へフォールバック（Issue #37、詳細は §2.3.1）
  image1: ImageConfig
  image2: ImageConfig
  image3: ImageConfig
  videoGeneration: VideoGenerationConfig
  format: 'html' | 'png'
}
```

### 検証ルール

```javascript
const validationRules = {
  canvas: {
    width: 1920,
    height: 1080
  },
  image: {
    x: { min: 0, max: 1920 },
    y: { min: 0, max: 1080 },
    width: { min: 10, max: 1920 },
    height: { min: 10, max: 1080 }
  },
  bounds: {
    // 画像はキャンバス内に収まる必要がある
    maxX: (x, width) => x + width <= 1920,
    maxY: (y, height) => y + height <= 1080
  }
}
```

## バックエンド設計

### 1. AWS CDKインフラストラクチャ

#### 1.1 メインスタック構成
```typescript
export class ImageProcessorApiStack extends cdk.Stack {
  // S3バケット群
  private resourcesBucket: s3.Bucket;
  private testImagesBucket: s3.Bucket;
  private frontendBucket: s3.Bucket;
  private uploadBucket: s3.Bucket;  // アップロード用バケット
  
  // Lambda関数
  private imageProcessorFunction: lambda.Function;
  private uploadManagerFunction: lambda.Function;  // アップロード管理
  
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
    upload: this.uploadBucket.bucketName
  },
  version: process.env.npm_package_version || '2.4.1',
  environment: this.node.tryGetContext('environment') || 'production'
};
```

### 2. Lambda関数の画像処理エンジン

#### 2.1 テスト画像生成機能

```python
def generate_circle_image(size: Tuple[int, int] = (400, 400), 
                         color: Tuple[int, int, int] = (239, 68, 68)) -> Image.Image:
    """赤色の円形画像を生成する"""
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    width, height = size
    margin = min(width, height) // 8
    draw.ellipse([margin, margin, width - margin, height - margin], 
                 fill=(*color, 255))
    
    return img

def generate_rectangle_image(size: Tuple[int, int] = (400, 400), 
                           color: Tuple[int, int, int] = (59, 130, 246)) -> Image.Image:
    """青色の四角形画像を生成する"""
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    width, height = size
    margin = min(width, height) // 8
    draw.rectangle([margin, margin, width - margin, height - margin], 
                   fill=(*color, 255))
    
    return img

def generate_triangle_image(size: Tuple[int, int] = (400, 400), 
                          color: Tuple[int, int, int] = (34, 197, 94)) -> Image.Image:
    """緑色の三角形画像を生成する"""
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    width, height = size
    triangle_points = [
        (width // 2, height // 4),      # 上の頂点
        (width // 4, height * 3 // 4),  # 左下の頂点
        (width * 3 // 4, height * 3 // 4)  # 右下の頂点
    ]
    
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
        
        # キャンバスサイズ（1920x1080対応）
        canvas_width = int(query_params.get('canvas_width', 1920))
        canvas_height = int(query_params.get('canvas_height', 1080))
        
        # パラメータ検証
        if not image1_param or not image2_param:
            return format_response(400, {'error': 'image1 and image2 are required'})
        
        # 画像パラメータの解析
        img_params = parse_image_parameters(query_params, canvas_width, canvas_height)
        
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
            img_params,
            canvas_width,
            canvas_height
        )
        
        # レスポンス生成
        return generate_response(composite_img, format_param, query_params)
        
    except Exception as e:
        logger.error(f"Handler error: {e}")
        return format_response(500, {'error': str(e)})
```

#### 2.3 ベース画像透明度適用関数

```python
def apply_base_opacity(base_img: Image.Image, opacity: int) -> Image.Image:
    """
    ベース画像にopacity（透明度）を適用する

    Args:
        base_img: ベース画像（RGBAモード）
        opacity: 透明度（0=完全透明、100=不透明）

    Returns:
        Image.Image: opacity適用後のベース画像
    """
    if opacity >= 100:
        return base_img  # 最適化：透明度処理をスキップ
    if opacity <= 0:
        return Image.new('RGBA', base_img.size, (0, 0, 0, 0))  # 完全透明

    # アルファチャンネルにopacityを乗算
    r, g, b, a = base_img.split()
    a = a.point(lambda x: int(x * opacity / 100))
    return Image.merge('RGBA', (r, g, b, a))
```

**処理シーケンス（create_composite_image内）:**
```
1. create_base_image() でベース画像を準備（透明キャンバスまたは指定画像）
2. apply_base_opacity(composite, base_opacity) でopacity適用
3. image1, image2, image3 を順にペースト
4. text_paramsがある場合はテキストを描画（Z-order: 画像→テキスト）
```

**APIパラメータ:**
| パラメータ名 | 型 | デフォルト | 説明 |
|------------|-----|---------|------|
| `baseOpacity` | integer | 100 | ベース画像の不透明度（0=完全透明、100=完全不透明） |

#### 2.3.1 baseOpacity 入力検証ルール

`image_processor.py` のリクエストパース時に以下の順で検証・正規化を行う:

```python
# image_processor.py 抜粋（実装と同等のロジック）
try:
    base_opacity_param = int(query_params.get('baseOpacity', '100'))
except (ValueError, TypeError):
    base_opacity_param = 100  # 非数値はデフォルトにフォールバック (Issue #37)
base_opacity_param = max(0, min(100, base_opacity_param))  # 0-100にクランプ
```

| 入力 | 処理結果 | 備考 |
|------|---------|------|
| 未指定（パラメータ無し） | `100` | クエリ文字列のデフォルト |
| `"75"`（数値文字列） | `75` | `int()` で変換 |
| `"-50"` | `0` | クランプ下限 |
| `"150"` | `100` | クランプ上限 |
| `"abc"`（非数値文字列） | `100` | `ValueError` → デフォルトにフォールバック（Issue #37） |
| `null` / 空文字列 | `100` | `TypeError`/`ValueError` → デフォルトにフォールバック |
| `"50.5"`（小数文字列） | `100` | `int()` が `ValueError` → デフォルトにフォールバック |

**検証順序の理由**:
1. 型変換エラー（`ValueError` / `TypeError`）は **エラーを返さずデフォルト100にフォールバック** する。これは後方互換性とフロントエンドの寛容な扱いのため（Issue #37）。
2. その後、整数として有効な値を `[0, 100]` にクランプする。これにより API 呼び出し元の意図（透明度を低く/高く指定）を可能な限り尊重する。

**`apply_base_opacity()` 関数内の最適化分岐**:
- `opacity >= 100`: 処理スキップ（元画像をそのまま返す）
- `opacity <= 0`: 完全透明な新規RGBA画像を返す
- `0 < opacity < 100`: アルファチャンネルに `opacity / 100` を乗算

#### 2.4 画像合成エンジン

```python
def create_composite_image(base_img: Image.Image, 
                          image1: Image.Image, 
                          image2: Image.Image,
                          image3: Optional[Image.Image],
                          params: Dict[str, Any],
                          canvas_width: int = 1920,
                          canvas_height: int = 1080) -> Image.Image:
    """
    2つまたは3つの画像を合成する（1920x1080対応）
    """
    logger.info(f"Creating composite with {3 if image3 else 2} images on {canvas_width}x{canvas_height} canvas")
    
    # ベース画像の準備
    if base_img is None:
        # 透明背景の作成（1920x1080）
        base_img = Image.new('RGBA', (canvas_width, canvas_height), (0, 0, 0, 0))
    else:
        # ベース画像をキャンバスサイズにリサイズ
        base_img = base_img.resize((canvas_width, canvas_height), Image.LANCZOS)
    
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

### 3. Upload Manager Lambda関数

#### 3.1 署名付きURL生成機能

```python
def generate_presigned_upload_url(event, context):
    """
    画像アップロード用の署名付きURL生成
    """
    try:
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
        
        # 対応ファイル形式の検証
        allowed_types = [
            'image/jpeg', 'image/png', 'image/gif', 'image/webp',
            'image/tiff', 'image/x-tga'
        ]
        if file_type not in allowed_types:
            return format_response(400, {'error': f'Unsupported file type: {file_type}'})
        
        # ユニークなファイル名生成
        file_extension = file_name.split('.')[-1]
        unique_filename = f"{uuid.uuid4()}-{datetime.now().strftime('%Y%m%d_%H%M%S')}.{file_extension}"
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
```

## エラーハンドリング

### APIエラーシナリオ

1. **ネットワークエラー**: 接続失敗、タイムアウト
2. **サーバーエラー**: 500ステータスコード、無効なレスポンス
3. **クライアントエラー**: 400ステータスコード、パラメータ検証失敗
4. **画像読み込みエラー**: 壊れた画像URL、CORS問題

### エラー回復戦略

```javascript
const errorRecoveryStrategies = {
  networkError: {
    message: 'ネットワーク接続を確認してください',
    actions: ['retry', 'checkConnection']
  },
  serverError: {
    message: 'サーバーエラーが発生しました',
    actions: ['retry', 'fallbackToPng']
  },
  clientError: {
    message: 'パラメータを確認してください',
    actions: ['validateParams', 'resetToDefaults']
  },
  imageLoadError: {
    message: '画像の読み込みに失敗しました',
    actions: ['fallbackToPng', 'retryWithDifferentFormat']
  }
}
```

## テスト戦略

### ユニットテスト

1. **コンポーネントテスト**:
   - ImageConfigTableパラメータ検証
   - ImageSelectorオプション処理
   - ResultDisplayエラー状態

2. **API統合テスト**:
   - 様々なパラメータでのURL構築
   - 異なるコンテンツタイプのレスポンス処理
   - エラーシナリオ処理

3. **検証テスト**:
   - パラメータ境界検証
   - キャンバス境界チェック
   - 必須フィールド検証

### 統合テスト

1. **ユーザーワークフローテスト**:
   - 完全な画像合成ワークフロー
   - パラメータ修正と検証
   - エラー回復シナリオ

2. **コンポーネント統合テスト**:
   - コンポーネント間のデータフロー
   - 状態同期
   - イベント処理

### E2Eテスト

1. **完全アプリケーションテスト**:
   - アプリケーション読み込みとテーブル表示の確認
   - パラメータ設定と画像生成
   - ダウンロード機能のテスト
   - エラーハンドリングの確認

## UI/UXデザイン原則

### ビジュアルデザイン

1. **テーブルベースレイアウト**: v2.3.0デザインに従った明確なテーブル構造
2. **カラーコーディング**: 赤（Image1）、青（Image2）、緑（Image3）
3. **視覚的フィードバック**: リアルタイムプレビュー、検証インジケーター
4. **レスポンシブデザイン**: モバイル対応のテーブルレイアウト

### ユーザーエクスペリエンス

1. **段階的開示**: 必要に応じて高度なオプションを表示
2. **即座のフィードバック**: リアルタイム検証とプレビュー
3. **エラー防止**: 入力制約と検証
4. **回復オプション**: 推奨アクションを含む明確なエラーメッセージ

### アクセシビリティ

1. **キーボードナビゲーション**: テーブルナビゲーションの完全なキーボードサポート
2. **スクリーンリーダーサポート**: 適切なARIAラベルと説明
3. **高コントラスト**: 要素間の明確な視覚的区別
4. **フォーカス管理**: 論理的なタブ順序とフォーカスインジケーター

## パフォーマンス考慮事項

### 最適化戦略

1. **遅延読み込み**: オンデマンドでのS3画像読み込み
2. **デバウンス更新**: パラメータ変更中の過度なAPI呼び出しを防止
3. **画像キャッシュ**: 繰り返しリクエストの生成画像キャッシュ
4. **コンポーネントメモ化**: Vueのリアクティビティでの再レンダリング最適化

### リソース管理

1. **メモリ管理**: blob URLの適切なクリーンアップ
2. **ネットワーク最適化**: API呼び出しの最小化、リクエストキューイングの実装
3. **バンドルサイズ**: オプション機能のコード分割

## セキュリティ考慮事項

1. **入力検証**: すべてのユーザー入力のサニタイズ
2. **URL検証**: S3パスとHTTP URLの検証
3. **CORS処理**: 適切なクロスオリジンリクエスト処理
4. **エラー情報**: エラーメッセージでの機密情報の露出回避

## 移行戦略

### 現在のv2.4.1から強化版への移行

1. **フェーズ1**: 基本機能を持つImageConfigTableの実装
2. **フェーズ2**: 既存のImageSelectorとImageUploaderとの統合
3. **フェーズ3**: ResultDisplayコンポーネントとエラーハンドリングの改善の追加
4. **フェーズ4**: 1920x1080キャンバスサポートと検証の実装

### 後方互換性

1. **API互換性**: 既存のAPIパラメータ名の維持
2. **ストア互換性**: 既存のPiniaストアとの連携
3. **コンポーネント互換性**: 可能な限り既存のコンポーネントインターフェースの保持

## テスト期待値画像管理システム

### テスト用画像データ構成

```
test/
├── test-assets/
│   ├── expected-*.png (期待値画像 - 正しいPNG形式で管理)
│   └── [基本テスト画像] (lambda/python/images/内の正常なPNG画像)
├── test-results/
│   └── [テスト出力ファイル] (一時的、削除可能)
└── scripts/
    ├── fix-test-assets.py (期待値画像修正スクリプト)
    └── regenerate-expected-images.py (期待値画像再生成スクリプト)
```

### テスト期待値画像管理コンポーネント

#### 1. ファイル分析コンポーネント

**責任:** ファイルの形式と用途を判定する

```python
@dataclass
class FileInfo:
    path: str
    file_type: str  # 'png_image', 'base64_text', 'unknown'
    purpose: str    # 'expected_value', 'test_output', 'basic_test_image'
    size: int
    is_valid: bool
    needs_conversion: bool

def analyze_file(file_path):
    """ファイルの形式と用途を分析"""
    # file コマンドによる形式判定
    # ファイル名パターンによる用途判定
    # 内容の検証
```

#### 2. Base64デコードコンポーネント

**責任:** base64エンコードされたテキストファイルをPNG画像に変換する

```python
def decode_base64_to_png(text_file_path):
    """base64テキストファイルをPNG画像に変換"""
    # base64データの読み込み
    # デコード処理
    # PNG形式での保存
    # 元ファイルのバックアップ
```

#### 3. 期待値画像生成コンポーネント

**責任:** APIの実際の出力から正しい期待値画像を生成する

```python
@dataclass
class ExpectedPattern:
    name: str
    api_params: dict
    output_filename: str
    description: str

def generate_expected_images():
    """APIから期待値画像を生成"""
    patterns = [
        {
            'name': 'expected-2-images.png',
            'description': '2画像合成（基本パターン）',
            'params': {'baseImage': 'test', 'image1': 'test', 'image2': 'test', 'format': 'png'}
        },
        {
            'name': 'expected-3-images.png',
            'description': '3画像合成',
            'params': {'baseImage': 'test', 'image1': 'test', 'image2': 'test', 'image3': 'test', 'format': 'png'}
        },
        # その他のパターン...
    ]
```

### テスト用画像管理ワークフロー

1. **期待値画像の形式確認**: `scripts/fix-test-assets.py`でファイル形式を検証
2. **期待値画像の再生成**: `scripts/regenerate-expected-images.py`でAPIから最新の期待値を生成
3. **テスト実行**: 正しいPNG形式の期待値画像でテストを実行
4. **結果管理**: テスト出力ファイルをtest/test-resultsで管理

## デプロイ考慮事項

1. **設定**: 適切なAPI URL設定の確保
2. **アセット管理**: 画像アセットとバンドルサイズの最適化
3. **ブラウザサポート**: ターゲットブラウザでのテスト
4. **パフォーマンス監視**: パフォーマンス追跡の実装
5. **テスト品質**: 期待値画像の正しい形式での管理
6. **テストデータ管理**: test/test-resultsディレクトリでの一時ファイル管理

この設計は、すべての要件に対応する包括的なソリューションを提供し、既存のコンポーネントアーキテクチャを維持しながら、v2.3.0の実証済みUIデザインを実装し、テスト期待値画像の適切な管理を実現します。

---

## 6. デフォルト値一元管理（composite-default.json）

> 対応要件: Requirement 21（画像合成デフォルト値の一元管理）

### 6.1 目的

画像合成APIとフロントエンドのデフォルト値を **`composite-default.json` 1ファイルに集約**し、以下を実現する:

1. デフォルト値が複数箇所（`image_processor.py`, `image_compositor.py`, `App.vue`, `design.md`）に散在することによるドリフトを防止
2. 利用シーン（1画像/2画像/3画像、テキスト有無）に応じた **動的デフォルト解決**
3. 将来の **プリセット拡張**（Live表示・番組宣伝・字幕などの典型配置パターン）の基盤
4. Agent からの **プリセット呼び出し連携**（後続 issue で実装）

### 6.2 JSON 構造

`frontend/public/composite-default.json` をマスターファイルとし、CDK デプロイで S3 配信、Lambda にも同梱する。

```json
{
  "version": "1.0",
  "system_default": {
    "canvas": { "width": 1920, "height": 1080 },
    "baseImage": "#000000",
    "baseOpacity": 100,
    "image_placement": {
      "single": {
        "image1": { "x": 1700, "y": 96, "width": 200, "height": 200 }
      },
      "double": {
        "image1": { "x": 1700, "y": 96, "width": 200, "height": 200 },
        "image2": { "x": 600, "y": 400, "width": 300, "height": 300 }
      },
      "triple": {
        "image1": { "x": 1700, "y": 96, "width": 200, "height": 200 },
        "image2": { "x": 600, "y": 400, "width": 300, "height": 300 },
        "image3": { "x": 1520, "y": 700, "width": 300, "height": 300 }
      }
    },
    "text_placeholders": {
      "text1": { "placeholder": "LIVE", "x": 1800, "y": 300, "font_size": 40 },
      "text2": { "placeholder": "Telop text on the bottom", "x": 300, "y": 900, "font_size": 50 },
      "text3": { "placeholder": "message for the program", "x": 300, "y": 100, "font_size": 40 }
    },
    "video": { "format": "MP4", "duration": 3 }
  },
  "presets": {}
}
```

### 6.3 配布フロー

```
[git管理]
frontend/public/composite-default.json
        │
        ├─ Vite ビルド ─► frontend/dist/composite-default.json
        │       │
        │       └─ CDK BucketDeployment ─► S3 (Frontend Bucket) ─► CloudFront ─► ブラウザ fetch
        │
        └─ CDK ビルド ─► lambda/python/composite_defaults.json (同梱)
                             │
                             └─ Lambda 起動時に読み込み（モジュールレベルキャッシュ）
```

- フロント: 既存の `config.json` 配信パターン（`image-composite-viewer-stack.ts`）に準拠
- Lambda: `composite-default.json` を `lambda/python/` 配下にビルド時コピーし、`composite_defaults.py` で読み込み

### 6.4 動的デフォルト解決の優先順位

API/フロント問わず、画像配置・背景色・動画形式の解決順序は以下:

```
1. リクエスト/UI明示指定（image1_x など）  ← 最優先
2. composite-default.json の system_default 値
3. ハードコードされたフォールバック値      ← JSON読み込み失敗時
```

### 6.5 1/2/3画像モード判定ロジック

API側 (`image_processor.py` / `image_compositor.py`) で `image2` / `image3` の有無のみをもとにモードを決定する。**テキストの有無はモード判定に影響しない**（テキストは `text_placeholders` で別軸として常に参照されるため）。

```python
def determine_image_mode(query_params: dict) -> str:
    has_image2 = bool(query_params.get('image2'))
    has_image3 = bool(query_params.get('image3'))

    if has_image3:
        return 'triple'
    elif has_image2:
        return 'double'
    else:
        return 'single'  # image1 のみ → 右上アイコン配置（テキスト有無無関係）
```

`single` モードでは `image1` のデフォルト座標が `(1700, 96, 200, 200)` の右上アイコン位置になる。
テキスト併用時は `image_placement.single` の image1 座標 + `text_placeholders` の x/y/font_size を独立に解決する。

> **設計判断**: テキストの有無で image_placement を切り替えるべきか検討したが、(1) JSON に第4のモード定義が必要になり構造が複雑化、(2) UI の placeholder 表示と API 送信の境界で挙動が分岐し実装ミスが起きやすい、(3) テキストは画像の上にレイヤとして重なるだけで配置干渉が薄い — の3点から、image_placement と text_placeholders を直交軸として扱うことに統一した。

### 6.6 フロントエンド実装方針

**Pinia ストア拡張** (`frontend/src/stores/config.ts` または新ストア `compositeDefaults.ts`):

```typescript
const compositeDefaults = ref<CompositeDefaults | null>(null)

async function loadCompositeDefaults() {
  try {
    const res = await fetch(`${baseUrl}/composite-default.json`)
    compositeDefaults.value = await res.json()
  } catch (e) {
    console.warn('composite-default.json読み込み失敗、フォールバック値使用', e)
    compositeDefaults.value = HARDCODED_FALLBACK
  }
}
```

**App.vue の params 初期化**:

```typescript
const sd = compositeDefaultsStore.compositeDefaults?.system_default
const params = ref({
  canvas_width: sd?.canvas.width ?? 1920,
  canvas_height: sd?.canvas.height ?? 1080,
  baseImage: sd?.baseImage ?? '#000000',
  baseOpacity: sd?.baseOpacity ?? 100,
  image1: sd?.image_placement.single.image1 ?? FALLBACK_IMAGE1,
})
```

**テキスト入力欄の placeholder**:

```vue
<textarea
  :placeholder="textPlaceholders.text1.placeholder"
  v-model="textConfigs.text1.text"
/>
```

### 6.7 Lambda 実装方針

**新ユーティリティ** `lambda/python/composite_defaults.py`:

```python
import json
from pathlib import Path
from typing import Dict, Any

_CACHED_DEFAULTS: Dict[str, Any] | None = None

def load_defaults() -> Dict[str, Any]:
    global _CACHED_DEFAULTS
    if _CACHED_DEFAULTS is not None:
        return _CACHED_DEFAULTS
    try:
        path = Path(__file__).parent / 'composite_defaults.json'
        with open(path, 'r', encoding='utf-8') as f:
            _CACHED_DEFAULTS = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        logger.warning(f"composite_defaults.json読み込み失敗、ハードコード値使用: {e}")
        _CACHED_DEFAULTS = HARDCODED_FALLBACK
    return _CACHED_DEFAULTS

def get_image_default(mode: str, image_key: str) -> Dict[str, int]:
    sd = load_defaults()['system_default']
    return sd['image_placement'][mode][image_key]

def get_base_image_default() -> str:
    return load_defaults()['system_default']['baseImage']

def get_video_format_default() -> str:
    return load_defaults()['system_default']['video']['format']
```

**`image_compositor.py` の `parse_image_parameters` 改修**: 現状ハードコードされている x/y/width/height デフォルトを `composite_defaults.get_image_default(mode, 'imageN')` で置換。mode は `image2`/`image3`/`text*` の有無で判定。

**`image_processor.py` の `baseImage` / `video_format` 解決**:

```python
base_image_param = query_params.get('baseImage') or composite_defaults.get_base_image_default()
video_format = query_params.get('video_format') or composite_defaults.get_video_format_default()
```

### 6.8 CDK 拡張

- フロント: `frontend/public/composite-default.json` を置けば Vite ビルドで `dist/` に含まれ、`BucketDeployment` で S3 にアップロードされる（追加実装最小）
- Lambda: `lambda/python/composite_defaults.json` をビルド時コピーするステップを `lib/image-processor-api-stack.ts` に追加

### 6.9 フォールバック戦略

JSON 読み込み失敗時のハードコードフォールバック値:

| 項目 | フォールバック値 |
|------|--------------|
| canvas | 1920×1080 |
| baseImage | `transparent`（既存挙動を維持してリスク最小化） |
| baseOpacity | 100 |
| image_placement.single.image1 | (1700, 96, 200, 200) |
| image_placement.double | image1=同上, image2=(600, 400, 300, 300) |
| image_placement.triple | 上記+image3=(1520, 700, 300, 300) |
| text_placeholders | text1/text2/text3 ともに `{ "placeholder": "", "x": 0, "y": 0, "font_size": 48 }`（フィールドは保持、文字列は空） |
| video.format | MP4 |
| video.duration | 3 |

> **フォールバックの構造的互換性**: フロント / Lambda の consumer コード（`App.vue` の params 初期化、`composite_defaults.get_image_default()` 等）は JSON が読み込めたときと同じキー構造を前提に値を参照する。そのため、フォールバックは値だけが異なる**同形のオブジェクト**として返す（キーの欠落は `KeyError` / `undefined` を引き起こすため避ける）。
>
> **フォールバック時の `baseImage`**: 既存挙動（透明）を維持し、JSON が正常に読み込めた場合のみ新仕様（黒背景）が適用される。これは「JSON配信が壊れた状態で API を呼ぶ既存利用者の結果画像が突然変わる」リスクを避けるためで、AC 21.8（新仕様）と AC 21.11（フォールバック）は意図的に値が異なる。

### 6.10 プリセット拡張性（将来 / issue #59）

`presets` セクションは本 issue では空オブジェクト `{}` のみ。後続 issue で:

- `live` / `promo` / `subtitle` の3プリセット定義
- SettingsPage UI でプリセット選択
- Agent ツール `apply_preset(name)` でプリセット呼び出し
- ユーザー個別の上書き値を localStorage に保存

### 6.11 破壊的変更とマイグレーション

| 変更 | 旧挙動 | 新挙動 | 影響 |
|------|--------|--------|------|
| `baseImage` 省略時 | 透明背景 | 黒背景 (`#000000`) | 既存 API 利用者で `baseImage` を明示しないリクエストの結果画像が変わる |
| `video_format` 省略時 | XMF | MP4 | 動画ダウンロードの拡張子・MIMEタイプが変わる |
| `image1` のみのデフォルト座標 | (100, 100, 400, 300) | (1700, 96, 200, 200) | 既存 API 利用者で座標未指定の画像配置が右上に変わる |

**周知**: PR 本文の冒頭に「破壊的変更」セクション、`CHANGELOG.md` 記載、`steering/architecture.md` の API セクションに注記。

### 6.12 テスト方針

- ユニットテスト: `composite_defaults.py` のロード/フォールバック/モード判定
- 統合テスト: API リクエスト時に JSON デフォルトが反映されることを確認
- e2e テスト: 既存30件のテストで期待値画像の再生成が必要か確認、必要なら `scripts/regenerate-expected-images.py` を実行
- フロントテスト: `composite-default.json` fetch 失敗時のフォールバック動作

### 6.13 関連 Issue

- **#58**: 本セクションを実装する（最小スコープ）
- **#59**: presets / SettingsPage UI / Agent 連携（後続）