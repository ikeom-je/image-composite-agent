# 画像合成REST API実装ガイド

このドキュメントでは、AWS CDKを使用して画像合成REST APIを実装する手順を説明します。Python + Pillowライブラリを使用してLambda関数で画像処理を行い、それをAPI Gatewayで公開します。

## アーキテクチャ概要

このソリューションは以下のコンポーネントで構成されています：

- **AWS Lambda**: Python 3.12ランタイムを使用し、画像処理ロジックを実装
- **Amazon API Gateway**: RESTful APIエンドポイントを提供
- **Amazon S3**: 画像リソースとテスト画像を保存
- **AWS CDK**: インフラストラクチャをコードとして定義・管理

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

- Node.js 18以上
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
```

### Lambda関数の設定（uvを使用したパッケージ管理）

Python Lambda関数を設定し、uvを使用した高速パッケージ管理を実装します：

```typescript
const imageProcessorFunction = new lambda.Function(this, 'ImageProcessorFunction', {
  runtime: lambda.Runtime.PYTHON_3_12,
  architecture: lambda.Architecture.ARM_64,
  handler: 'image_processor.handler',
  code: lambda.Code.fromAsset(path.join(__dirname, '../lambda/python'), {
    bundling: {
      image: lambda.Runtime.PYTHON_3_12.bundlingImage,
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
   cdk deploy
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
