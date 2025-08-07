# 画像合成REST API実装ガイド

本システムは.amazonqディレクトリのmarkdownのルールにしたがったプロンプトで必ず動作させます。システムはAmazonQ, Readme, historyのmarkdownをもとに作っていきます。そこから生成されたrequirements, design,taskでコードを生成してデプロイとテストを行います。

## 🌐 URL設定とセキュリティガイドライン (v2.5.4)

### 環境変数による設定管理

URLやクレデンシャル情報は必ず環境変数で管理し、コード内にハードコードしない：

```bash
# フロントエンド環境変数設定例
VITE_API_URL=https://your-api-id.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite
VITE_UPLOAD_API_URL=https://your-api-id.execute-api.ap-northeast-1.amazonaws.com/prod/upload
VITE_CLOUDFRONT_URL=https://your-distribution-id.cloudfront.net
VITE_ENVIRONMENT=production
```

### 動的URL構築

設定ストアでは以下の優先順位でURL設定を取得：

1. **環境変数**: `import.meta.env.VITE_API_URL`
2. **設定ファイル**: CDKデプロイ時に生成される`config.json`
3. **フォールバック**: `window.location.origin`を使用した動的構築

### URL検証と正規化

```typescript
// 相対パス・絶対パス・プロトコル省略URLの適切な処理
if (rawApiUrl.startsWith('/')) {
  apiUrl = window.location.origin + rawApiUrl
} else if (rawApiUrl.startsWith('http://') || rawApiUrl.startsWith('https://')) {
  apiUrl = rawApiUrl
} else {
  apiUrl = `${window.location.protocol}//${rawApiUrl}`
}
```

## 🧪 テスト用画像管理ガイドライン (v2.5.2)

### 期待値画像の管理

テスト用期待値画像は以下のルールで管理されています：

- **場所**: `test/test-assets/expected-*.png`
- **形式**: 正しいPNG画像形式（base64テキストファイルではない）
- **用途**: APIレスポンスとの画像比較テスト
- **検証**: 画像プレビューアで正常に開けることを確認

### 基本テスト画像

- **場所**: `lambda/python/images/`
- **ファイル**: `circle_red.png`, `rectangle_blue.png`, `triangle_green.png`, `aws-logo.png`
- **状態**: 正常なPNG画像として維持

### テスト出力ファイル管理

- **場所**: `test/test-results/`
- **用途**: テスト実行時の一時ファイル、バックアップファイル
- **削除**: 定期的にクリーンアップ可能
- **除外**: .gitignoreで除外済み

### 期待値画像の修正・再生成

```bash
# 期待値画像の形式確認と修正
python3 scripts/fix-test-assets.py

# APIから期待値画像を再生成
python3 scripts/regenerate-expected-images.py
```

### 注意事項

- 期待値画像は必ず正しいPNG形式で保存する
- base64エンコードされたテキストファイルは使用しない
- テスト出力ファイルは`test/test-results/`に配置する
- 新しい期待値画像を追加する際は、APIから実際の出力を取得して生成する

このドキュメントでは、AWS CDKを使用して画像合成REST APIを実装する手順を説明します。Python + Pillowライブラリを使用してLambda関数で画像処理を行い、それをAPI Gatewayで公開します。フロントエンドはVue.js 3で実装し、S3にホスティングしてCloudFrontで配信します。

## 🆕 v2.4.1 新機能: S3画像アップロード機能

### アップロード機能の概要

S3画像アップロード機能により、ユーザーは独自の画像をアップロードして画像合成で使用できます：

- **ドラッグ&ドロップ対応**: 画像ファイルを直接ドラッグ&ドロップでアップロード
- **署名付きURL**: セキュアな直接S3アップロード
- **サムネイル生成**: 自動PNG形式サムネイル生成
- **画像選択UI**: 3択選択（未選択・テスト画像・S3画像）
- **ページネーション**: 大量画像対応

### Upload Manager Lambda関数の実装

```python
def generate_presigned_upload_url(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """画像アップロード用の署名付きURL生成"""
    try:
        body = json.loads(event.get('body', '{}'))
        file_name = body.get('fileName')
        file_type = body.get('fileType')
        file_size = body.get('fileSize', 0)
        
        # ファイルサイズ制限（10MB）
        if file_size > 10 * 1024 * 1024:
            return format_response(400, {'error': 'File size exceeds 10MB limit'})
        
        # 対応ファイル形式の検証
        allowed_types = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/tiff', 'image/x-tga']
        if file_type not in allowed_types:
            return format_response(400, {'error': f'Unsupported file type: {file_type}'})
        
        # 署名付きURL生成
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={'Bucket': upload_bucket, 'Key': s3_key, 'ContentType': file_type},
            ExpiresIn=3600
        )
        
        return format_response(200, {
            'uploadUrl': presigned_url, 's3Key': s3_key, 'bucketName': upload_bucket, 'expiresIn': 3600
        })
    except Exception as e:
        return format_response(500, {'error': str(e)})

def list_uploaded_images(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """アップロードされた画像の一覧取得"""
    try:
        response = s3_client.list_objects_v2(Bucket=upload_bucket, Prefix='uploads/images/', MaxKeys=50)
        images = []
        if 'Contents' in response:
            for obj in response['Contents']:
                # サムネイルURL生成
                thumbnail_key = obj['Key'].replace('uploads/images/', 'thumbnails/').replace(obj['Key'].split('.')[-1], 'png')
                thumbnail_url = s3_client.generate_presigned_url('get_object', Params={'Bucket': upload_bucket, 'Key': thumbnail_key}, ExpiresIn=3600)
                
                images.append({
                    'key': obj['Key'], 's3Path': f"s3://{upload_bucket}/{obj['Key']}", 'fileName': obj['Key'].split('/')[-1],
                    'size': obj['Size'], 'lastModified': obj['LastModified'].isoformat(), 'thumbnailUrl': thumbnail_url
                })
        return format_response(200, {'images': images, 'count': len(images)})
    except Exception as e:
        return format_response(500, {'error': str(e)})
```

### フロントエンド画像アップロード・選択コンポーネント

```vue
<!-- ImageUploader.vue -->
<template>
  <div class="image-uploader">
    <div class="upload-area" @drop="handleDrop" @dragover.prevent @dragleave.prevent>
      <input ref="fileInput" type="file" accept="image/*" @change="handleFileSelect" style="display: none" />
      <button @click="$refs.fileInput.click()">📁 画像ファイルを選択</button>
      <p>または、画像ファイルをここにドラッグ&ドロップ</p>
      <small>対応形式: JPEG, PNG, GIF, WebP, TIFF, TGA | 最大サイズ: 10MB</small>
    </div>
    <div v-if="uploading" class="upload-progress">
      <div class="progress-bar"><div class="progress-fill" :style="{width: uploadProgress + '%'}"></div></div>
      <p>{{ uploadProgress }}% 完了</p>
    </div>
  </div>
</template>

<!-- ImageSelector.vue -->
<template>
  <div class="image-selector">
    <select v-model="selectedType" @change="handleTypeChange">
      <option value="">未選択</option>
      <option value="test">既存テスト画像</option>
      <option value="s3">S3アップロード画像</option>
    </select>
    
    <!-- S3画像一覧 -->
    <div v-if="selectedType === 's3'" class="s3-image-selection">
      <div class="image-grid">
        <div v-for="image in s3Images" :key="image.key" class="image-item" @click="selectS3Image(image)">
          <img :src="image.thumbnailUrl" :alt="image.fileName" />
          <p>{{ truncateFileName(image.fileName) }}</p>
          <small>{{ formatFileSize(image.size) }}</small>
        </div>
      </div>
    </div>
  </div>
</template>
```

### CDKスタック拡張

```typescript
// アップロード用S3バケット
this.uploadBucket = new s3.Bucket(this, 'UploadBucket', {
  accessControl: s3.BucketAccessControl.PRIVATE,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  cors: [{
    allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
    allowedOrigins: ['*'], allowedHeaders: ['*'], maxAge: 3600,
  }],
});

// Upload Manager Lambda関数
const uploadManagerFunction = new lambda.Function(this, 'UploadManagerFunction', {
  runtime: lambda.Runtime.PYTHON_3_12,
  handler: 'upload_manager.handler',
  environment: { UPLOAD_BUCKET: this.uploadBucket.bucketName },
  memorySize: 768, timeout: cdk.Duration.seconds(45),
});

// API Gateway統合
const upload = api.root.addResource('upload');
const presignedUrl = upload.addResource('presigned-url');
presignedUrl.addMethod('POST', new apigateway.LambdaIntegration(uploadManagerFunction));
const imagesList = upload.addResource('images');
imagesList.addMethod('GET', new apigateway.LambdaIntegration(uploadManagerFunction));
```

## アーキテクチャ概要

このソリューションは以下のコンポーネントで構成されています：

- **AWS Lambda**: Python 3.12ランタイムを使用し、画像処理ロジックを実装
- **Upload Manager Lambda**: 画像アップロード・管理機能を提供
- **Amazon API Gateway**: RESTful APIエンドポイントを提供
- **Amazon S3**: 画像リソース、テスト画像、アップロード画像を保存
- **Amazon CloudFront**: フロントエンドの安全な配信とキャッシング
- **AWS CDK**: インフラストラクチャをコードとして定義・管理
- **Vue.js 3**: フロントエンドアプリケーション（アップロード機能付き）

## 前提条件

### AWS設定

このプロジェクトはAWS CLIのdefaultプロファイルを使用します：

```bash
# AWS設定の確認
aws configure list

# 必要に応じてリージョンを設定
export AWS_DEFAULT_REGION=ap-northeast-1

# または aws configure で設定
aws configure set region ap-northeast-1
```

### 必要なツール

- Node.js 20以上
- AWS CLI（設定済み）
- Docker（CDKバンドリング用）

## CDKスタックの実装

### S3バケットの設定

S3バケットはCDKスタックで定義し、Lambda関数から読み取りアクセスのみを許可します：

```typescript
// リソースバケットの作成
this.resourcesBucket = new s3.Bucket(this, 'ImageResourcesBucket', {
  accessControl: s3.BucketAccessControl.PRIVATE,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.RETAIN,
});

// テスト用バケットの作成
this.testImagesBucket = new s3.Bucket(this, 'TestImagesBucket', {
  accessControl: s3.BucketAccessControl.PRIVATE,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
  encryption: s3.BucketEncryption.S3_MANAGED,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

// フロントエンド用バケットの作成
this.frontendBucket = new s3.Bucket(this, 'FrontendBucket', {
  websiteIndexDocument: 'index.html',
  websiteErrorDocument: 'index.html',
  publicReadAccess: true,
  blockPublicAccess: s3.BlockPublicAccess.BLOCK_ACLS,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  autoDeleteObjects: true,
});
```

### Lambda関数の設定（uvを使用したパッケージ管理）

Python Lambda関数を設定し、uvを使用した高速パッケージ管理を実装します：

```typescript
const imageProcessorFunction = new lambda.Function(this, 'ImageProcessorFunction', {
  runtime: lambda.Runtime.PYTHON_3_11,
  architecture: lambda.Architecture.ARM_64,
  handler: 'image_processor.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/python'), {
    bundling: {
      image: lambda.Runtime.PYTHON_3_11.bundlingImage,
      command: [
        'bash', '-c', `
          set -e
          echo "Starting bundling process with uv package management..."
          
          # uvのインストールを試行
          if curl -LsSf https://astral.sh/uv/install.sh | sh; then
            # uvのパスを設定
            export PATH="$HOME/.local/bin:$PATH"
            echo "✅ uv installed successfully"
            UV_AVAILABLE=true
          else
            echo "⚠️ uv installation failed, falling back to pip"
            UV_AVAILABLE=false
          fi
          
          # venv環境を作成
          echo "Creating virtual environment..."
          python -m venv .venv
          source .venv/bin/activate
          
          # uvが利用可能な場合はuvを使用、そうでなければpipを使用
          if [ "$UV_AVAILABLE" = true ] && command -v uv >/dev/null 2>&1; then
            echo "📦 Using uv for fast package management"
            uv pip install -r requirements.txt
          else
            echo "📦 Using pip for package management"
            pip install -r requirements.txt
          fi
          
          # パッケージを出力ディレクトリにコピー
          echo "Copying packages to output directory..."
          cp -r .venv/lib/python*/site-packages/* /asset-output/
          
          # ソースコードをコピー
          echo "Copying source code..."
          cp -au *.py /asset-output/
          if [ -d images ]; then
            cp -au images /asset-output/
            echo "✅ Test images copied"
          fi
          
          # 不要ファイルの削除（サイズ最適化）
          echo "Optimizing bundle size..."
          find /asset-output -name "*.pyc" -delete
          find /asset-output -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true
          find /asset-output -name "*.dist-info" -type d -exec rm -rf {} + 2>/dev/null || true
          
          echo "🎉 Bundling completed successfully"
        `
      ],
      user: 'root'
    },
  }),
  memorySize: 1024,
  timeout: cdk.Duration.seconds(30),
  environment: {
    S3_RESOURCES_BUCKET: this.resourcesBucket.bucketName,
    TEST_BUCKET: this.testImagesBucket.bucketName
  }
});

// S3読み取り権限を付与
this.resourcesBucket.grantRead(imageProcessorFunction);
this.testImagesBucket.grantRead(imageProcessorFunction);
```

### API Gatewayの設定（バイナリメディアタイプ対応）

API Gatewayを設定してLambda関数と統合し、バイナリメディアタイプをサポートします：

```typescript
const api = new apigateway.RestApi(this, 'ImageProcessorApi', {
  restApiName: 'Image Processor API',
  description: 'This API creates composite images from multiple source images',
  binaryMediaTypes: ['image/png', 'image/jpeg', 'image/*'],
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: ['Content-Type', 'X-Amz-Date', 'Authorization', 'X-Api-Key']
  }
});

const images = api.root.addResource('images');
const composite = images.addResource('composite');
composite.addMethod('GET', new apigateway.LambdaIntegration(imageProcessorFunction));
```

### フロントエンドのデプロイ

フロントエンドをS3にデプロイするための設定を追加します：

```typescript
// フロントエンドのビルドとデプロイ
new s3deploy.BucketDeployment(this, 'DeployFrontend', {
  sources: [s3deploy.Source.asset(path.join(__dirname, '../frontend/dist'))],
  destinationBucket: this.frontendBucket,
  retainOnDelete: false,
  prune: true,
});
```

### 出力の設定

デプロイ後に重要な情報を出力します：

```typescript
new cdk.CfnOutput(this, 'ApiUrl', {
  value: `${api.url}images/composite`,
  description: 'URL for the Image Processor API'
});

new cdk.CfnOutput(this, 'TestImagesBucketName', {
  value: this.testImagesBucket.bucketName,
  description: 'Name of the test images bucket'
});

new cdk.CfnOutput(this, 'ResourcesBucketName', {
  value: this.resourcesBucket.bucketName,
  description: 'Name of the resources bucket'
});

new cdk.CfnOutput(this, 'FrontendUrl', {
  value: this.frontendBucket.bucketWebsiteUrl,
  description: 'URL for the frontend application'
});
```

## Lambda関数の実装

### 画像処理ロジック

Python + Pillowを使用して画像処理を実装します：

```python
import boto3
from PIL import Image
import io
import os
import base64
import requests
import concurrent.futures

def fetch_image_from_s3(bucket_name: str, object_key: str) -> Image.Image:
    """S3バケットから画像を取得し、Pillowイメージとして返す"""
    s3_client = boto3.client('s3')
    response = s3_client.get_object(Bucket=bucket_name, Key=object_key)
    img = Image.open(io.BytesIO(response['Body'].read()))
    
    # RGBAモードに変換（透過を扱うため）
    if img.mode != 'RGBA':
        img = img.convert('RGBA')
    
    return img

def create_composite_image(base_img: Image.Image, image1: Image.Image, image2: Image.Image,
                          img1_params: Dict[str, Any], img2_params: Dict[str, Any]) -> Image.Image:
    """ベース画像に2つの画像を合成する"""
    composite = base_img.copy()
    
    # 画像のリサイズと配置
    img1_resized = image1.resize((img1_params['width'], img1_params['height']), Image.LANCZOS)
    img2_resized = image2.resize((img2_params['width'], img2_params['height']), Image.LANCZOS)
    
    # アルファチャネルを考慮した合成
    composite.paste(img1_resized, (img1_params['x'], img1_params['y']), img1_resized)
    composite.paste(img2_resized, (img2_params['x'], img2_params['y']), img2_resized)
    
    return composite

def handler(event, context):
    """Lambda ハンドラー関数"""
    query_params = event.get('queryStringParameters', {}) or {}
    
    # パラメータの取得と検証
    image1_param = query_params.get('image1')
    image2_param = query_params.get('image2')
    format_param = query_params.get('format', 'html')
    
    if not image1_param or not image2_param:
        return format_response(400, {'error': 'image1 and image2 parameters are required'})
    
    # 画像の並列取得
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        # 画像取得処理...
    
    # 画像合成
    composite_img = create_composite_image(base_img, images['image1'], images['image2'], 
                                         img1_params, img2_params)
    
    # 出力形式に応じたレスポンス
    if format_param == 'png':
        # PNG直接返却
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'image/png'},
            'body': base64.b64encode(img_byte_arr).decode('utf-8'),
            'isBase64Encoded': True
        }
    else:
        # HTML表示（JavaScriptダウンロード機能付き）
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'text/html; charset=utf-8'},
            'body': html_content
        }
```

## テスト

### テスト環境

- **ユニットテスト**: Python unittest
- **E2Eテスト**: Playwright
- **テスト対象**: Lambda関数、API、フロントエンド

### テストの実行

```bash
# すべてのテストを実行
npm test

# Lambda関数のテストのみ実行
npm run test:lambda

# APIテストのみ実行
npm run test:api

# フロントエンドテストのみ実行
npm run test:frontend
```

### テスト構成

- `test/lambda/`: Lambda関数のユニットテスト
- `test/e2e/`: PlaywrightによるE2Eテスト
  - `image-processor.api.spec.ts`: API機能のテスト
  - `frontend.spec.ts`: フロントエンドUIのテスト
- `test/run-tests.sh`: テスト実行スクリプト

## テスト画像の管理

### テスト画像のアップロード

```bash
#!/bin/bash
# テスト画像アップロードスクリプト（defaultプロファイル対応）

# 既存スタックからバケット名を自動取得
BUCKET_NAME=$(aws cloudformation describe-stacks \
    --stack-name ImageProcessorApiStack \
    --query 'Stacks[0].Outputs[?OutputKey==`TestImagesBucketName`].OutputValue' \
    --output text)

# 画像をアップロード
aws s3 cp "../lambda/python/images/aws-logo.png" "s3://$BUCKET_NAME/images/aws-logo.png"
aws s3 cp "../lambda/python/images/circle_red.png" "s3://$BUCKET_NAME/images/circle_red.png"
aws s3 cp "../lambda/python/images/rectangle_blue.png" "s3://$BUCKET_NAME/images/rectangle_blue.png"
```

## デプロイ手順

1. **AWS設定の確認**:
   ```bash
   aws configure list
   export AWS_DEFAULT_REGION=ap-northeast-1
   ```

2. **CDKスタックをデプロイ**:
   ```bash
   npm install
   cdk bootstrap
   npm run deploy-all  # フロントエンドのビルドとデプロイを含む
   ```

3. **テスト画像をアップロード**:
   ```bash
   cd scripts
   chmod +x upload-test-images.sh
   ./upload-test-images.sh auto
   ```

## ブラウザ対応の実装

### JavaScriptダウンロード機能

API GatewayのBase64制限を回避するため、JavaScriptを使用したクライアントサイドダウンロードを実装：

```javascript
function downloadImage() {
    // Base64データからBlobを作成
    const base64Data = '{base64_image}';
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], {type: 'image/png'});
    
    // ダウンロードリンクを作成
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'composite-image.png';
    a.click();
    
    // クリーンアップ
    window.URL.revokeObjectURL(url);
}
```

## トラブルシューティング

### AWS認証の問題

```bash
# AWS設定の確認
aws configure list

# 認証情報の設定
aws configure

# リージョンの設定
export AWS_DEFAULT_REGION=ap-northeast-1
```

### uvパッケージ管理の問題

```bash
# uvのインストール確認（ローカル）
curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
uv --version
```

### S3バケット権限エラー

Lambda関数からS3バケットにアクセスできない場合：

```typescript
// 明示的な権限付与
this.resourcesBucket.grantRead(imageProcessorFunction);
this.testImagesBucket.grantRead(imageProcessorFunction);
```

## ベストプラクティス

1. **defaultプロファイル使用**: AWS CLIのdefaultプロファイルを使用してセキュリティを簡素化

2. **環境変数設定**: AWS_DEFAULT_REGIONを適切に設定

3. **高速パッケージ管理**: uvを使用してPythonパッケージの管理を高速化

4. **venv環境の分離**: グローバル環境に影響を与えない安全なパッケージ管理

5. **並列画像処理**: `concurrent.futures`を使用した複数画像の同時取得

6. **アルファチャンネル保持**: RGBAモードでの透過情報の保持

7. **エラーハンドリング**: 詳細なログ出力と適切なエラーレスポンス

8. **セキュリティ**: 最小権限の原則とプライベートS3バケット

9. **パフォーマンス**: ARM64アーキテクチャとメモリ最適化

10. **テスト自動化**: ユニットテストとE2Eテストによる品質保証

## API使用例

### 基本的な使用例

```bash
# HTML表示
curl "https://your-api-url/images/composite?baseImage=test&image1=test&image2=test"

# PNG直接ダウンロード
curl "https://your-api-url/images/composite?baseImage=test&image1=test&image2=test&format=png" -o composite.png
```

### カスタム配置

```bash
# 位置とサイズを指定
curl "https://your-api-url/images/composite?baseImage=test&image1=test&image2=test&image1X=100&image1Y=100&image1Width=400&image1Height=300"
```

### S3画像の使用

```bash
# S3に保存された画像を使用
curl "https://your-api-url/images/composite?baseImage=s3://my-bucket/base.png&image1=s3://my-bucket/overlay1.png&image2=s3://my-bucket/overlay2.png"
```

このガイドに従って実装することで、高性能で拡張性のある画像合成REST APIを構築できます。defaultプロファイルを使用することで、AWS認証の管理が簡素化され、より安全で保守しやすいシステムになります。
### CloudFrontの設定

CloudFrontをS3の前段に配置して、セキュアなコンテンツ配信を実現します：

```typescript
// CloudFront Origin Access Identity (OAI) の作成
const originAccessIdentity = new cloudfront.OriginAccessIdentity(this, 'OriginAccessIdentity', {
  comment: 'Access to the frontend bucket',
});

// S3バケットポリシーの設定 - CloudFrontからのアクセスのみを許可
this.frontendBucket.addToResourcePolicy(
  new iam.PolicyStatement({
    actions: ['s3:GetObject'],
    effect: iam.Effect.ALLOW,
    principals: [
      new iam.CanonicalUserPrincipal(
        originAccessIdentity.cloudFrontOriginAccessIdentityS3CanonicalUserId
      ),
    ],
    resources: [this.frontendBucket.arnForObjects('*')],
  })
);

// CloudFrontディストリビューションの作成
this.distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
  defaultRootObject: 'index.html',
  defaultBehavior: {
    origin: new origins.S3Origin(this.frontendBucket, {
      originAccessIdentity,
    }),
    compress: true,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
  },
  // SPAのルーティングをサポートするためのエラーレスポンス設定
  errorResponses: [
    {
      httpStatus: 404,
      responseHttpStatus: 200,
      responsePagePath: '/index.html',
      ttl: cdk.Duration.seconds(0),
    },
  ],
  priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // 北米、欧州、アジアの一部のみ（コスト最適化）
});
```

### フロントエンドのデプロイ

フロントエンドをS3にデプロイし、CloudFrontを通じて配信するための設定を追加します：

```typescript
// フロントエンドのビルドとデプロイ
new s3deploy.BucketDeployment(this, 'DeployFrontend', {
  sources: [s3deploy.Source.asset(path.join(__dirname, '../frontend/dist'))],
  destinationBucket: this.frontendBucket,
  distribution: this.distribution,
  distributionPaths: ['/*'], // CloudFrontキャッシュを無効化
  retainOnDelete: false,
});
```
### フロントエンドの画像表示処理

Vue.jsフロントエンドでの画像表示を適切に処理するためのコード実装：

```javascript
async generateImage() {
  this.isLoading = true;
  this.error = null;
  this.resultUrl = '';
  
  try {
    const apiUrl = this.buildApiUrl();
    this.apiUrl = apiUrl;
    
    // 常にBlobとして取得し、画像として表示する
    const response = await axios.get(apiUrl, { 
      responseType: 'blob',
      headers: {
        'Accept': 'image/png, image/jpeg, image/*'
      }
    });
    
    // レスポンスのContent-Typeを確認
    const contentType = response.headers['content-type'];
    
    if (contentType && contentType.includes('image')) {
      // 画像の場合は直接表示
      this.resultUrl = URL.createObjectURL(response.data);
    } else if (contentType && contentType.includes('text/html')) {
      // HTMLの場合は画像を抽出
      const reader = new FileReader();
      reader.onload = (e) => {
        const htmlContent = e.target.result;
        // HTML内の画像を抽出
        const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/);
        if (imgMatch && imgMatch[1]) {
          this.resultUrl = imgMatch[1];
        } else {
          // 画像が見つからない場合はAPIを直接呼び出し
          const pngUrl = new URL(apiUrl);
          pngUrl.searchParams.set('format', 'png');
          this.resultUrl = pngUrl.toString();
        }
      };
      reader.readAsText(response.data);
    } else {
      // それ以外の場合はPNG形式で再リクエスト
      const pngUrl = new URL(apiUrl);
      pngUrl.searchParams.set('format', 'png');
      const pngResponse = await axios.get(pngUrl.toString(), { responseType: 'blob' });
      this.resultUrl = URL.createObjectURL(pngResponse.data);
    }
  } catch (error) {
    console.error('Error generating image:', error);
    this.error = error.message || 'Unknown error';
    
    // エラーが発生した場合、PNG形式で再試行
    try {
      const retryUrl = new URL(this.apiUrl);
      retryUrl.searchParams.set('format', 'png');
      const retryResponse = await axios.get(retryUrl.toString(), { responseType: 'blob' });
      this.resultUrl = URL.createObjectURL(retryResponse.data);
      this.error = null; // エラーをクリア
    } catch (retryError) {
      console.error('Retry failed:', retryError);
      // 再試行も失敗した場合は元のエラーを表示
    }
  } finally {
    this.isLoading = false;
  }
},

// 画像読み込みエラー時の処理
handleImageError() {
  console.error('画像の読み込みに失敗しました');
  // PNG形式で再試行
  if (this.apiUrl && !this.apiUrl.includes('format=png')) {
    const pngUrl = new URL(this.apiUrl);
    pngUrl.searchParams.set('format', 'png');
    this.resultUrl = pngUrl.toString();
  }
}
```

この実装には以下の重要な機能が含まれています：

1. **レスポンスタイプの適切な処理**:
   - Content-Typeに基づいて異なる処理を行う
   - 画像の場合は直接表示
   - HTMLの場合は画像データを抽出
   - その他の場合はPNG形式で再リクエスト

2. **エラーハンドリングと自動再試行**:
   - エラー発生時にPNG形式で再試行
   - 画像読み込み失敗時の代替処理

3. **Blobデータの適切な処理**:
   - URL.createObjectURLを使用して画像を表示
   - FileReaderを使用してHTMLコンテンツを解析

4. **ヘッダー設定**:
   - 'Accept'ヘッダーで画像形式を指定

この実装により、APIからのさまざまな形式のレスポンスを適切に処理し、常に画像を表示できるようになります。
## テスト実行の改善

### Playwrightテスト実行の最適化

Playwrightテストを実行する際に、HTML報告書サーバーが起動して終了しない問題を解決するための設定：

```typescript
// playwright.config.ts の設定改善
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  reportSlowTests: null,
  quiet: !process.env.DEBUG,
  use: {
    baseURL: process.env.API_URL || 'https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  // 他の設定...
});
```

### テスト実行スクリプトの作成

テストを自動的に実行して終了するためのシェルスクリプト：

```bash
#!/bin/bash

# Run Playwright tests with the list reporter and exit immediately
npx playwright test --config=test/playwright.config.ts --project=api-tests --reporter=list --no-open-report

# Exit with the same status code as the test run
exit $?
```

### package.jsonのスクリプト設定

```json
"scripts": {
  "test:api": "test/run-api-tests.sh",
  "test:api:report": "npx playwright test --config=test/playwright.config.ts --project=api-tests",
}
```

これらの改善により、テスト実行が自動化され、CI/CD環境での実行がスムーズになります。`--no-open-report`フラグを使用することで、HTML報告書サーバーが起動せずにテストが完了します。
## フロントエンドのViteとTailwind CSS実装

### Viteの設定

Viteを使用してフロントエンドの開発環境とビルドプロセスを高速化します：

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  base: './',
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'axios']
        }
      }
    }
  }
})
```

### Tailwind CSSの設定

Tailwind CSSを使用してユーティリティファーストのスタイリングを実装します：

```javascript
// tailwind.config.js
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#0078d7',
          light: '#00a2ed',
          dark: '#005a9e'
        },
        accent: '#ff9900',
        background: '#f5f7fa',
        card: '#ffffff',
        text: '#333333',
        border: '#e0e0e0',
        success: '#28a745',
        error: '#dc3545'
      }
    }
  },
  plugins: []
}
```

### 環境変数の設定

Viteでの環境変数は `VITE_` プレフィックスを使用します：

```
# .env
VITE_API_URL=https://your-api-url.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite
```

アプリケーション内での使用方法：

```javascript
// 環境変数へのアクセス
const apiUrl = import.meta.env.VITE_API_URL || 'デフォルトURL';
```

### コンポーネントスタイリング

Tailwind CSSを使用したコンポーネントスタイリングの例：

```html
<template>
  <div class="max-w-7xl mx-auto p-4">
    <header class="text-center mb-8 p-6 bg-gradient-to-r from-primary to-primary-light text-white rounded-lg shadow-md">
      <h1 class="text-4xl mb-2">🎨 画像合成REST API デモ</h1>
      <p class="text-xl opacity-90">高性能・アルファチャンネル対応の画像合成REST API</p>
    </header>
    
    <!-- コンテンツ -->
    <div class="flex flex-wrap gap-6 mb-8">
      <!-- フォーム部分 -->
      <div class="flex-1 min-w-[300px] bg-white p-6 rounded-lg shadow-sm">
        <!-- フォームコンテンツ -->
      </div>
      
      <!-- 結果表示部分 -->
      <div class="flex-1 min-w-[300px] bg-white p-6 rounded-lg shadow-sm">
        <!-- 結果コンテンツ -->
      </div>
    </div>
  </div>
</template>
```

### カスタムコンポーネントクラス

Tailwind CSSの `@layer components` を使用して再利用可能なコンポーネントクラスを定義：

```css
/* src/assets/main.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .btn {
    @apply bg-primary text-white py-2 px-4 rounded font-medium transition-colors hover:bg-primary-light disabled:bg-gray-400 disabled:cursor-not-allowed;
  }
  
  .form-label {
    @apply block mb-1 font-medium;
  }
  
  .form-input {
    @apply w-full p-2 border border-border rounded text-base;
  }
  
  .form-select {
    @apply w-full p-2 border border-border rounded text-base;
  }
  
  .form-group {
    @apply mb-4;
  }
}
```

### レスポンシブデザイン

Tailwind CSSのブレークポイントを使用したレスポンシブデザインの実装：

```html
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  <!-- レスポンシブグリッドアイテム -->
  <div class="bg-white p-4 rounded-lg shadow-sm">
    <!-- コンテンツ -->
  </div>
</div>
```

### ビルドとデプロイ

Viteプロジェクトのビルドとデプロイ：

```bash
# 開発サーバー起動
npm run dev

# 本番用ビルド
npm run build

# ビルド結果のプレビュー
npm run preview

# S3へのデプロイ
./deploy-to-s3.sh
```

これらの設定と実装により、高速な開発環境と最適化されたプロダクションビルドを実現し、モダンでレスポンシブなユーザーインターフェースを提供します。
## 🔧 
v2.5.1 テスト用画像管理ガイドライン

### テスト用画像の分類

システムでは以下の3種類の画像ファイルを明確に区別して管理します：

1. **基本テスト画像**: `test/test-assets/` 内の基本画像
   - `circle_red.png`, `rectangle_blue.png`, `triangle_green.png`
   - `aws-logo.png` 等
   - これらは常に正常なPNG形式で維持

2. **期待値画像**: `test/test-assets/expected-*.png`
   - APIテストで使用する期待値データ
   - 必ず正常なPNG形式である必要がある
   - base64エンコードされたテキストファイルは不適切

3. **テスト出力ファイル**: `test/test-results/` 内の一時ファイル
   - テスト実行時に生成される一時的なファイル
   - 後で削除可能であることを明示

### 期待値画像の管理手順

#### 1. 期待値画像の形式確認
```bash
# ファイル形式を確認
file test/test-assets/expected-*.png

# 正常な場合: "PNG image data" と表示
# 問題がある場合: "ASCII text" と表示
```

#### 2. base64エンコードファイルの修正
```bash
# 自動修正スクリプトを実行
python3 scripts/fix-test-assets.py

# 結果確認
file test/test-assets/expected-*.png
```

#### 3. 期待値画像の再生成
```bash
# APIから新しい期待値を生成
python3 scripts/regenerate-expected-images.py

# 全て再生成する場合
python3 scripts/regenerate-expected-images.py --all
```

### テスト出力ファイルの管理

#### ワークスペースルートの整理
```bash
# 一時ファイルをtest/test-resultsに移動
mv test_*.png test/test-results/

# 不要なファイルの削除
find test/test-results -name "test_*.png" ! -name "test_decoded.png" -delete
```

#### test/test-resultsディレクトリの用途
- テスト実行時の出力ファイル保存場所
- 一時的なファイルの保管場所
- README.mdで各ファイルの用途を明記
- 定期的なクリーンアップが推奨

### 新しいテスト用画像の追加手順

1. **基本テスト画像の追加**:
   - 正常なPNG形式でtest/test-assets/に配置
   - 適切な命名規則に従う（例: `new_test_image.png`）

2. **期待値画像の追加**:
   - `expected-` プレフィックスを使用
   - APIから実際の出力を取得して作成
   - 必ず正常なPNG形式で保存

3. **テストスクリプトの更新**:
   - 新しい画像を使用するテストケースを追加
   - 期待値との比較ロジックを実装

### トラブルシューティング

#### 期待値画像が開けない場合
```bash
# 1. ファイル形式を確認
file test/test-assets/expected-*.png

# 2. base64テキストファイルの場合は修正
python3 scripts/fix-test-assets.py

# 3. 修正後の確認
file test/test-assets/expected-*.png
```

#### テストが失敗する場合
```bash
# 1. 期待値画像の再生成
python3 scripts/regenerate-expected-images.py --all

# 2. テスト実行
npm run test:api-validation

# 3. 結果確認
ls -la test/test-assets/expected-*.png
```

### 品質保証

- 全ての期待値画像は画像プレビューアで開けること
- ファイルサイズが適切であること（通常20KB-300KB程度）
- テスト実行時にエラーが発生しないこと
- 期待値と実際の出力が一致すること