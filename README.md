# 🎨 画像合成REST API v2.3.0

高性能・アルファチャンネル対応の画像合成REST APIです。**3画像同時合成**に対応し、AWS CDK、Lambda、API Gatewayを使用して構築され、uvによる高速パッケージ管理を採用しています。Vue.js 3、Vite、Tailwind CSSで構築されたフロントエンドアプリケーションも含まれており、S3にホスティングしてCloudFrontで配信します。

## ✨ 主な特徴

- **🎨 3画像同時合成**: 最大3つの画像を同時に合成（後方互換性完全保持）
- **🔺 新しいテスト画像**: 緑色の三角形画像を追加（円・四角・三角の3形状）
- **🚀 高性能**: ARM64アーキテクチャ + uvによる高速パッケージ管理
- **🎯 アルファチャンネル対応**: 透過情報を保持した高品質な画像合成
- **⚡ 並列処理**: 最大3画像の同時取得による高速化
- **🌐 ブラウザフレンドリー**: 美しいHTML表示 + JavaScriptダウンロード
- **🔧 柔軟な画像指定**: HTTP URL、S3パス、テスト画像に対応
- **📱 レスポンシブ対応**: モバイルデバイスでも快適に利用可能
- **🖥️ テーブル形式UI**: 3画像の設定を横並びで直感的に操作

## 🏗️ アーキテクチャ

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │───▶│   AWS Lambda     │───▶│   Amazon S3     │
│                 │    │  (Python 3.11)  │    │  (画像ストレージ) │
│ REST API        │    │  + uv + venv     │    │                 │
│ /images/        │    │  + Pillow        │    │ - テスト画像     │
│ composite       │    │  + boto3         │    │ - リソース画像   │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                       ▲
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │  CloudFront    │
                                              │  Distribution   │
                                              └───────┬─────────┘
                                                      │
                                                      ▼
                                              ┌─────────────────┐
                                              │   S3 Bucket     │
                                              │  (Private)      │
                                              │  Vue.js 3      │
                                              │  フロントエンド  │
                                              └─────────────────┘
```

## 🚀 クイックスタート

### 前提条件

- AWS CLI設定済み（defaultプロファイル使用）
- Node.js 18以上
- Docker（CDKバンドリング用）

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

### 既存スタックとの整合性

このプロジェクトは既存の `ImageProcessorApiStack` と整合性を保ちます：

**現在のスタック情報:**
- スタック名: `ImageProcessorApiStack`
- API URL: `https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite`
- テストバケット: `imageprocessorapistack-testimagesbucket4ab1f113-yg0v6o6txw9z`
- リソースバケット: `imageprocessorapistack-imageresourcesbucket76f0cd7-lyeuy5nd8rzd`
- フロントエンドURL: `https://d66gmb5py5515.cloudfront.net`

### 1. デプロイ

```bash
# 依存関係のインストール
npm install

# CDKブートストラップ（初回のみ）
cdk bootstrap

# スタックのデプロイ（既存スタックを更新）
npm run deploy
```

### 2. テスト画像のアップロード

```bash
cd scripts
chmod +x upload-test-images.sh
./upload-test-images.sh auto
```

### 3. フロントエンドのデプロイ

フロントエンドは自動的にCDKスタックの一部としてデプロイされます。S3バケットはプライベートに保たれ、CloudFrontを通じてのみアクセス可能です。

```bash
# フロントエンドのビルドとCDKスタックのデプロイを一度に行う
npm run deploy-all

# または個別に実行
npm run build-frontend  # フロントエンドのビルド
npm run deploy          # CDKスタックのデプロイ
```

デプロイ後、CloudFormationの出力に表示される `FrontendUrl` にアクセスしてフロントエンドを確認できます。
このURLはCloudFrontのドメイン名を指し、HTTPS経由でセキュアにアクセスできます。

### 4. 動作確認

フロントエンドインターフェースで3画像合成機能を試す：
```
https://d66gmb5py5515.cloudfront.net/
```

または、APIエンドポイントで直接テスト：
```bash
# 2画像合成（従来機能）
https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test

# 3画像合成（新機能）
https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test&image3=test
```

## 🧪 テスト

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

## 📖 API仕様

### エンドポイント

```
GET /images/composite
```

### 必須パラメータ

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `image1` | 合成する1つ目の画像 | `test`, `s3://bucket/key`, `https://example.com/image.png` |
| `image2` | 合成する2つ目の画像 | `test`, `s3://bucket/key`, `https://example.com/image.png` |

### オプションパラメータ（画像指定）

| パラメータ | 説明 | 例 |
|-----------|------|-----|
| `image3` | 合成する3つ目の画像（オプション） | `test`, `s3://bucket/key`, `https://example.com/image.png` |

### オプションパラメータ（配置・形式）

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `baseImage` | ベース画像 | 透明背景 |
| `format` | 出力形式 (`html` or `png`) | `html` |
| `image1Width` | 1つ目の画像の幅 | 300 |
| `image1Height` | 1つ目の画像の高さ | 200 |
| `image1X` | 1つ目の画像のX座標 | 右端から20px |
| `image1Y` | 1つ目の画像のY座標 | 20 |
| `image2Width` | 2つ目の画像の幅 | 300 |
| `image2Height` | 2つ目の画像の高さ | 200 |
| `image2X` | 2つ目の画像のX座標 | 右端から20px |
| `image2Y` | 2つ目の画像のY座標 | 1つ目の画像の下 |
| `image3Width` | 3つ目の画像の幅 | 300 |
| `image3Height` | 3つ目の画像の高さ | 200 |
| `image3X` | 3つ目の画像のX座標 | 20 |
| `image3Y` | 3つ目の画像のY座標 | 20 |

## 🎯 使用例

### 基本的な使用例

```bash
# 2画像合成（従来機能）
curl "https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test"

# 3画像合成（新機能）
curl "https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test&image3=test"

# PNG形式で直接ダウンロード
curl "https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test&image3=test&format=png" -o composite.png
```

### カスタム配置

```bash
# 3画像の位置とサイズを指定
curl "https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test&image3=test&image1X=100&image1Y=100&image1Width=400&image1Height=300&image3X=800&image3Y=400"
```

### S3画像の使用

```bash
# S3に保存された3画像を使用
curl "https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=s3://my-bucket/base.png&image1=s3://my-bucket/circle.png&image2=s3://my-bucket/rectangle.png&image3=s3://my-bucket/triangle.png"
```

## 🛠️ 技術仕様

### Lambda関数

- **ランタイム**: Python 3.12
- **アーキテクチャ**: X86_64（ライブラリ互換性重視）
- **メモリ**: 1024MB
- **タイムアウト**: 30秒
- **パッケージ管理**: uv（高速Pythonパッケージマネージャー）
- **並列処理**: 最大3画像の同時取得

### 主要ライブラリ

- **Pillow**: 高性能画像処理
- **boto3**: AWS SDK
- **requests**: HTTP通信

### 出力仕様

- **画像形式**: PNG (RGBA)
- **出力サイズ**: 1920x1080ピクセル
- **透過サポート**: ✅ あり（3画像すべて対応）
- **エンコード**: Base64（API Gateway制限による）
- **合成順序**: base → image1 → image2 → image3

## 📁 プロジェクト構造

```
image-processor-api/
├── bin/
│   └── image-processor-api.ts             # CDKアプリエントリーポイント
├── lib/
│   └── image-processor-api-stack.ts       # CDKスタック定義
├── lambda/
│   └── python/
│       ├── image_processor.py             # メインLambda関数（3画像対応）
│       ├── requirements.txt               # Python依存関係
│       └── images/                        # テスト画像
│           ├── aws-logo.png              # ベース画像用
│           ├── circle_red.png            # 合成画像1用（円）
│           ├── rectangle_blue.png        # 合成画像2用（四角）
│           └── triangle_green.png        # 合成画像3用（三角）← 新規追加
├── frontend/                             # Vue.js フロントエンド
│   ├── src/                              # ソースコード
│   │   ├── App.vue                       # メインコンポーネント
│   │   └── main.js                       # エントリーポイント
│   ├── public/                           # 静的ファイル
│   │   └── index.html                    # HTMLテンプレート
│   ├── deploy-to-s3.sh                   # S3デプロイスクリプト
│   └── package.json                      # 依存関係
├── scripts/
│   ├── generate_triangle_image.py        # 三角形画像生成スクリプト ← 新規追加
│   ├── upload-test-images.sh             # テスト画像アップロード（3画像対応）
│   └── update-cdk-stack.js               # CDKスタック更新スクリプト
├── cdk.json                              # CDK設定
├── package.json                          # Node.js依存関係
└── README.md                             # このファイル
```

## 🔧 開発・カスタマイズ

### ローカル開発

```bash
# CDK合成（デプロイ前の確認）
npm run synth

# 差分確認
npm run diff

# デプロイ
npm run deploy

# 削除
npm run destroy
```

### Lambda関数の修正

Lambda関数を修正した場合：

```bash
# 変更をデプロイ
npm run deploy

# ログの確認
aws logs tail /aws/lambda/ImageProcessorApiStack-ImageProcessorFunction --follow
```

## 🎨 ブラウザ機能

### HTML表示機能

- 🎨 美しいグラデーション背景
- 📊 詳細な技術情報表示
- 🎯 合成パラメータの可視化
- ☁️ S3リソース情報
- 📱 レスポンシブデザイン

### JavaScriptダウンロード

- 🖼️ 正しいPNG形式でのダウンロード
- ✅ ブラウザ互換性の確保
- 🔧 エラーハンドリング
- 📝 コンソールログ出力

## 🚨 トラブルシューティング

### よくある問題

1. **AWS認証エラー**
   ```
   Unable to locate credentials
   ```
   → AWS CLIの設定を確認してください：
   ```bash
   aws configure
   # または
   export AWS_DEFAULT_REGION=ap-northeast-1
   ```

2. **uvインストールエラー**
   ```
   uv installation failed, falling back to pip
   ```
   → 正常な動作です。pipにフォールバックします。

3. **S3バケット権限エラー**
   ```
   Access Denied
   ```
   → IAM権限を確認してください。

4. **Lambda関数タイムアウト**
   ```
   Task timed out after 30.00 seconds
   ```
   → 大きな画像の場合、タイムアウト値を増加してください。

### ログの確認

```bash
# CloudWatch Logsでエラーを確認
aws logs describe-log-groups --log-group-name-prefix "/aws/lambda/ImageProcessorApiStack"

# リアルタイムログ監視
aws logs tail /aws/lambda/ImageProcessorApiStack-ImageProcessorFunction --follow
```

## 🔒 セキュリティ

- 🔐 S3バケットはプライベートアクセスのみ
- 🛡️ Lambda関数は最小権限（S3読み取りのみ）
- 🌐 API GatewayはCORS設定済み
- ✅ 入力値の検証とサニタイゼーション実装

## 📊 パフォーマンス

- ⚡ **uvによる高速パッケージ管理**: 従来のpipより高速
- 🔄 **並列画像取得**: 複数画像の同時ダウンロード
- 💪 **ARM64アーキテクチャ**: 高性能・低コスト
- 🎯 **効率的なメモリ使用**: 画像処理の最適化

## 🤝 貢献

プロジェクトへの貢献を歓迎します：

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 ライセンス

このプロジェクトはMITライセンスの下で公開されています。

## 🆘 サポート

問題や質問がある場合は、GitHubのIssuesページで報告してください。

---

**画像合成REST API** - 高性能・アルファチャンネル対応 🎨✨
