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

interface CompositionParams {
  canvas_width: 1920
  canvas_height: 1080
  baseImage: string
  image1: ImageConfig
  image2: ImageConfig
  image3: ImageConfig
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

#### 2.3 画像合成エンジン

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

## デプロイ考慮事項

1. **設定**: 適切なAPI URL設定の確保
2. **アセット管理**: 画像アセットとバンドルサイズの最適化
3. **ブラウザサポート**: ターゲットブラウザでのテスト
4. **パフォーマンス監視**: パフォーマンス追跡の実装

この設計は、すべての要件に対応する包括的なソリューションを提供し、既存のコンポーネントアーキテクチャを維持しながら、v2.3.0の実証済みUIデザインを実装します。