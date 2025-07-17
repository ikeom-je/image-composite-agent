# 🎨 画像合成REST API

高性能・アルファチャンネル対応の画像合成REST APIです。AWS CDK、Lambda、API Gatewayを使用して構築され、uvによる高速パッケージ管理を採用しています。Vue.js 3、Vite、Tailwind CSSで構築されたフロントエンドアプリケーションも含まれており、S3にホスティングしてCloudFrontで配信します。

## ✨ 主な特徴

- **🚀 高性能**: ARM64アーキテクチャ + uvによる高速パッケージ管理
- **🎯 アルファチャンネル対応**: 透過情報を保持した高品質な画像合成
- **⚡ 並列処理**: 複数画像の同時取得による高速化
- **🌐 ブラウザフレンドリー**: 美しいHTML表示 + JavaScriptダウンロード
- **🔧 柔軟な画像指定**: HTTP URL、S3パス、テスト画像に対応
- **📱 レスポンシブ対応**: モバイルデバイスでも快適に利用可能
- **🖥️ Vue.js フロントエンド**: 直感的なユーザーインターフェースでAPI機能を体験

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

**既存スタック情報:**
- スタック名: `ImageProcessorApiStack`
- API URL: `https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite`
- テストバケット: `imageprocessorapistack-testimagesbucket4ab1f113-sjc4fwt3v47u`
- リソースバケット: `imageprocessorapistack-imageresourcesbucket76f0cd7-buex7dxhtrpd`
- フロントエンドURL: `https://d7kz1a65nk29c.cloudfront.net`

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

フロントエンドインターフェースで画像合成機能を試す：
```
https://d7kz1a65nk29c.cloudfront.net/
```

または、APIエンドポイントで直接テスト：
```
https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test
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

### オプションパラメータ

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

## 🎯 使用例

### 基本的な使用例

```bash
# HTML表示でテスト画像を合成
curl "https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test"

# PNG形式で直接ダウンロード
curl "https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test&format=png" -o composite.png
```

### カスタム配置

```bash
# 画像の位置とサイズを指定
curl "https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test&image1X=100&image1Y=100&image1Width=400&image1Height=300"
```

### S3画像の使用

```bash
# S3に保存された画像を使用
curl "https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=s3://my-bucket/base.png&image1=s3://my-bucket/overlay1.png&image2=s3://my-bucket/overlay2.png"
```

## 🛠️ 技術仕様

### Lambda関数

- **ランタイム**: Python 3.12
- **アーキテクチャ**: ARM64（高性能・低コスト）
- **メモリ**: 1024MB
- **タイムアウト**: 30秒
- **パッケージ管理**: uv（高速Pythonパッケージマネージャー）

### 主要ライブラリ

- **Pillow**: 高性能画像処理
- **boto3**: AWS SDK
- **requests**: HTTP通信

### 出力仕様

- **画像形式**: PNG (RGBA)
- **出力サイズ**: 1920x1080ピクセル
- **透過サポート**: ✅ あり
- **エンコード**: Base64（API Gateway制限による）

## 📁 プロジェクト構造

```
image-processor-api/
├── bin/
│   └── image-processor-api.ts             # CDKアプリエントリーポイント
├── lib/
│   └── image-processor-api-stack.ts       # CDKスタック定義
├── lambda/
│   └── python/
│       ├── image_processor.py             # メインLambda関数
│       ├── requirements.txt               # Python依存関係
│       └── images/                        # テスト画像
│           ├── aws-logo.png              # ベース画像用
│           ├── circle_red.png            # 合成画像1用
│           └── rectangle_blue.png        # 合成画像2用
├── frontend/                             # Vue.js フロントエンド
│   ├── src/                              # ソースコード
│   │   ├── App.vue                       # メインコンポーネント
│   │   └── main.js                       # エントリーポイント
│   ├── public/                           # 静的ファイル
│   │   └── index.html                    # HTMLテンプレート
│   ├── deploy-to-s3.sh                   # S3デプロイスクリプト
│   └── package.json                      # 依存関係
├── scripts/
│   ├── upload-test-images.sh             # テスト画像アップロード
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
