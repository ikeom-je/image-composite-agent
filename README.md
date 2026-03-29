# 🎨 Image Compositor

高性能・アルファチャンネル対応の画像合成REST APIシステムです。**3画像同時合成**・**自然言語チャットエージェント**に対応し、AWS CDK、Lambda、API Gatewayを使用して構築されたプロダクション対応システムです。

## ✨ 主な特徴

- **🎨 3画像同時合成**: 最大3つの画像を同時に合成（後方互換性完全保持）
- **📝 テキストオーバーレイ**: 最大3つのテキストテロップを画像上に配置（日本語対応・折り返し・背景矩形）
- **🤖 Chat Agent**: 自然言語で画像合成を指示（Strands Agents SDK + AWS Bedrock マルチモデル対応）
- **🔄 マルチモデル対応**: Claude Sonnet 4.5、Haiku等の利用可能モデルを動的に切り替え
- **📁 画像アップロード機能**: ドラッグ&ドロップによる直接S3アップロード
- **🎯 アルファチャンネル対応**: 透過情報を保持した高品質な画像合成
- **⚡ 並列処理**: 最大3画像の同時取得による高速化
- **🔧 柔軟な画像指定**: HTTP URL、S3パス、テスト画像、アップロード画像に対応
- **📊 動的設定管理**: 環境別設定ファイルによる柔軟な構成管理
- **🔍 包括的監視**: CloudWatch ダッシュボード、アラーム、ログ機能
- **🛡️ セキュリティ強化**: 署名付きURL、使用量制限、CORS設定
- **🌍 CDN配信**: CloudFront による高速コンテンツ配信

## 🏗️ アーキテクチャ

```
┌──────────────────┐    ┌───────────────────┐    ┌─────────────────┐
│   API Gateway    │───▶│ Image Processor   │───▶│   Amazon S3     │
│                  │    │ Lambda (Py 3.12)  │    │  (画像/動画)     │
│ /images/composite│    │ + Pillow + boto3  │    └────────┬────────┘
│ /upload          │    └───────────────────┘             │
│ /chat            │    ┌───────────────────┐    ┌────────▼────────┐
│                  │───▶│ Agent Lambda      │───▶│  CloudFront     │
└──────────────────┘    │ (Py 3.12, ARM64)  │    │  Distribution   │
                        │ Strands Agent SDK │    └────────┬────────┘
        ┌───────────────┤                   │             │
        │               └───────────────────┘    ┌────────▼────────┐
        ▼                        │               │   S3 Bucket     │
┌───────────────┐       ┌───────▼───────┐       │  Vue.js 3       │
│   DynamoDB    │       │  AWS Bedrock  │       │  フロントエンド   │
│ ChatHistory   │       │ Claude 4.5    │       └─────────────────┘
└───────────────┘       └───────────────┘
```

## 🚀 クイックスタート

## 🌐 デプロイ環境

### 環境設定

デプロイ後、以下の環境変数またはCloudFormation出力から必要な情報を取得してください：

- **API エンドポイント**: `${CloudFormation出力: ApiUrl}`
- **Chat API エンドポイント**: `${CloudFormation出力: ChatApiUrl}`
- **フロントエンド URL**: `${CloudFormation出力: FrontendUrl}`
- **アップロード API URL**: `${CloudFormation出力: UploadApiUrl}`
- **監視ダッシュボード**: `${CloudFormation出力: DashboardUrl}`

### API 使用例

```bash
# 環境変数を設定（デプロイ後に取得）
export API_URL="$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)"

# 2画像合成（後方互換性）
curl "${API_URL}?image1=test&image2=test&format=png" | base64 -d > result.png

# 3画像合成（新機能）
curl "${API_URL}?image1=test&image2=test&image3=test&format=png" | base64 -d > result_3images.png

# パラメータ付き合成
curl "${API_URL}?image1=test&image2=test&img1_x=100&img1_y=100&img2_x=300&img2_y=200&format=png" | base64 -d > custom_result.png
```

### システム機能

- ✅ 2画像合成の後方互換性維持
- ✅ 3画像合成機能
- ✅ 画像アップロード機能
- ✅ 動的設定ファイルの配信
- ✅ パフォーマンス要件（5秒未満）
- ✅ RGBA対応・透過情報保持
- ✅ テスト画像の自動配信

## 🚀 ローカル開発

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

### 環境変数の設定

デプロイ後、以下のスクリプトで環境変数を設定できます：

```bash
# 環境変数設定スクリプト（.env.local として保存推奨）
export API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)
export FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`FrontendUrl`].OutputValue' --output text)
export UPLOAD_API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`UploadApiUrl`].OutputValue' --output text)
export UPLOAD_BUCKET=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`UploadBucketName`].OutputValue' --output text)

echo "環境変数が設定されました:"
echo "API_URL: ${API_URL}"
echo "FRONTEND_URL: ${FRONTEND_URL}"
echo "UPLOAD_API_URL: ${UPLOAD_API_URL}"
echo "UPLOAD_BUCKET: ${UPLOAD_BUCKET}"
```

### スタック構成

このプロジェクトは `ImageProcessorApiStack` として構成されます：

**スタック情報:**
- スタック名: `ImageProcessorApiStack`
- リージョン: `ap-northeast-1`（デフォルト）
- 主要リソース: API Gateway、Lambda関数x2、S3バケット、CloudFront、DynamoDB、Bedrock

**デプロイ後の情報取得:**
```bash
# CloudFormation出力の確認
aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs'

# 主要URLの取得
export API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)
export FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`FrontendUrl`].OutputValue' --output text)
```

### 1. デプロイ

```bash
# 依存関係のインストール
npm install

# CDKブートストラップ（初回のみ）
cdk bootstrap

# スタックのデプロイ
npm run deploy

# 環境変数の設定（デプロイ後）
npm run setup-env
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
```bash
# フロントエンドURLを取得してアクセス
export FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`FrontendUrl`].OutputValue' --output text)
echo "フロントエンドURL: ${FRONTEND_URL}"
```

または、APIエンドポイントで直接テスト：
```bash
# API URLを取得
export API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)

# 2画像合成（従来機能）
curl "${API_URL}?baseImage=test&image1=test&image2=test"

# 3画像合成（新機能）
curl "${API_URL}?baseImage=test&image1=test&image2=test&image3=test"
```

## 🧪 包括的テストスイート

### テスト環境

- **ユニットテスト**: Python unittest（Lambda関数、Agent）
- **統合テスト**: Playwright（画像合成API、Chat Agent API）
- **E2Eテスト**: Playwright（フロントエンド、Chat Agent UI）
- **テスト対象**: Lambda関数、API、アップロード機能、画像選択、統合ワークフロー、Chat Agent

### テストの実行

```bash
# 包括的テスト（全テスト実行）
npm run test:comprehensive

# 個別テスト実行
npm run test:lambda          # Lambda関数ユニットテスト
npm run test:api            # API統合テスト
npm run test:upload         # アップロード機能E2Eテスト
npm run test:selection      # 画像選択機能E2Eテスト
npm run test:integration    # 統合ワークフローE2Eテスト
npm run test:all-e2e        # 全E2Eテスト実行

# Chat Agent テスト
npm run test:agent                                        # Agentユニットテスト
CHAT_API_URL=... npx playwright test --config=test/playwright-api.config.ts --grep "Chat Agent"  # API統合テスト
FRONTEND_URL=... npx playwright test --project=chat-agent-tests                                   # E2Eテスト
```

### テスト構成

- `test/lambda/`: Lambda関数のユニットテスト
  - `test_image_processor.py`: 画像処理機能のテスト
  - `test_upload_manager.py`: アップロード管理機能のテスト
  - `test_agent_handler.py`: Agentハンドラーのテスト
  - `test_agent_tools.py`: Agentツールのテスト
  - `test_chat_history.py`: 会話履歴管理のテスト
- `test/e2e/`: PlaywrightによるE2Eテスト
  - `api-validation.api.spec.ts`: API機能の検証テスト
  - `image-processor.api.spec.ts`: API機能のテスト
  - `chat-agent.api.spec.ts`: Chat Agent API統合テスト
  - `chat-agent.spec.ts`: Chat Agent E2Eテスト
  - `upload-functionality.spec.ts`: アップロード機能のテスト
  - `image-selection.spec.ts`: 画像選択機能のテスト
  - `integration-workflow.spec.ts`: 統合ワークフローのテスト
- `test/test-assets/`: テスト用画像データ
  - `expected-*.png`: 期待値画像（正しいPNG形式で管理）
  - 基本テスト画像（lambda/python/images/内の正常なPNG画像）
- `test/test-results/`: テスト実行時の出力ファイル（一時的、削除可能）
- `scripts/fix-test-assets.py`: 期待値画像修正スクリプト
- `scripts/regenerate-expected-images.py`: 期待値画像再生成スクリプト

### テスト用画像管理

期待値画像は正しいPNG形式で管理されており、以下のスクリプトで維持できます：

```bash
# 期待値画像の形式確認と修正
npm run fix-test-assets

# APIから期待値画像を再生成（統合された機能）
npm run regenerate-expected-images
```

### テストカバレッジ

✅ Lambda関数のユニットテスト（画像処理・アップロード管理）
✅ API統合テスト（エンドポイント・エラーハンドリング）
✅ アップロード機能E2Eテスト（UI・ファイル処理・エラー）
✅ 画像選択機能E2Eテスト（3択選択・S3一覧・モード切り替え）
✅ 統合ワークフローE2Eテスト（完全フロー・互換性・パフォーマンス）
✅ Chat Agent ユニットテスト（ハンドラー・ツール・履歴管理: 42件）
✅ Chat Agent API統合テスト（POST/GET/DELETE: 13件）
✅ Chat Agent E2Eテスト（UI操作・メッセージ送受信: 14件）

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

### オプションパラメータ（テキストオーバーレイ）

text1〜text3まで最大3つのテキストレイヤーを指定可能（text2/text3は省略可）:

| パラメータ | 説明 | デフォルト |
|-----------|------|-----------|
| `text1` | テキスト内容（指定時にテキスト描画有効） | - |
| `text1X` | X座標 | 0 |
| `text1Y` | Y座標 | 0 |
| `text1FontSize` | フォントサイズ(px) | 48 |
| `text1FontColor` | 文字色（`#RRGGBB`形式） | `#FFFFFF` |
| `text1FontFamily` | フォント名 | `NotoSansJP` |
| `text1BgColor` | テロップ背景色（省略時は背景なし） | - |
| `text1BgOpacity` | 背景の不透明度 (0.0-1.0) | 0.7 |
| `text1Wrap` | 折り返し改行の有無 (`true`/`false`) | `false` |
| `text1MaxWidth` | 折り返し時の最大幅(px) | - |
| `text1Padding` | テロップ背景のパディング(px) | 10 |

テキストのみ（画像なし）のリクエストも可能です（`image1`を省略し、`text1`等を指定）。

## 📁 S3画像アップロード機能

### アップロード機能の特徴

- **📁 ドラッグ&ドロップ対応**: 画像ファイルを直接ドラッグ&ドロップでアップロード
- **🔒 セキュア**: 署名付きURLによる安全な直接S3アップロード
- **🖼️ サムネイル自動生成**: PNG形式200x200pxサムネイル
- **📱 レスポンシブUI**: モバイル対応の画像選択インターフェース
- **⚡ 高速**: 並列処理とページネーション対応

### アップロード API エンドポイント

```bash
# アップロードAPIのベースURLを取得
export UPLOAD_API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`UploadApiUrl`].OutputValue' --output text)

# 署名付きURL生成
curl -X POST "${UPLOAD_API_URL}/presigned-url" \
  -H "Content-Type: application/json" \
  -d '{"fileName":"my-image.png","fileType":"image/png","fileSize":1024000}'

# アップロード画像一覧取得
curl "${UPLOAD_API_URL}/images?maxKeys=20"

# S3画像を使用した合成（バケット名は動的に取得）
export API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)
curl "${API_URL}?image1=s3://[UPLOAD_BUCKET]/uploads/images/my-image.png&image2=test&image3=test"
```

### フロントエンド新機能

1. **画像アップロード**: ドラッグ&ドロップまたはファイル選択でアップロード
2. **3択画像選択**: 未選択・テスト画像・S3アップロード画像から選択
3. **サムネイル一覧**: アップロードした画像をサムネイル付きで表示
4. **動的モード切り替え**: 1画像・2画像・3画像合成モードの自動切り替え

## 🎯 使用例

### 基本的な使用例

```bash
# API URLを環境変数として設定
export API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`ApiUrl`].OutputValue' --output text)

# 2画像合成（従来機能）
curl "${API_URL}?baseImage=test&image1=test&image2=test"

# 3画像合成（新機能）
curl "${API_URL}?baseImage=test&image1=test&image2=test&image3=test"

# PNG形式で直接ダウンロード
curl "${API_URL}?baseImage=test&image1=test&image2=test&image3=test&format=png" -o composite.png
```

### カスタム配置

```bash
# 3画像の位置とサイズを指定
curl "${API_URL}?baseImage=test&image1=test&image2=test&image3=test&image1X=100&image1Y=100&image1Width=400&image1Height=300&image3X=800&image3Y=400"
```

### S3画像の使用

```bash
# アップロードバケット名を取得
export UPLOAD_BUCKET=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack --query 'Stacks[0].Outputs[?OutputKey==`UploadBucketName`].OutputValue' --output text)

# S3に保存された画像を使用
curl "${API_URL}?baseImage=s3://${UPLOAD_BUCKET}/uploads/images/base.png&image1=s3://${UPLOAD_BUCKET}/uploads/images/circle.png&image2=s3://${UPLOAD_BUCKET}/uploads/images/rectangle.png&image3=s3://${UPLOAD_BUCKET}/uploads/images/triangle.png"
```

## 🛠️ 技術仕様

### Lambda関数

| Lambda | ランタイム | アーキテクチャ | メモリ | タイムアウト | 用途 |
|--------|----------|--------------|--------|------------|------|
| ImageProcessorFunction | Python 3.12 | X86_64 | 2048MB | 90秒 | 画像合成・動画生成 |
| AgentFunction | Python 3.12 | ARM_64 | 2048MB | 90秒 | Chat Agent (Bedrock) |

- **並列処理**: 最大3画像の同時取得

### 主要ライブラリ

- **Pillow**: 高性能画像処理（ImageDraw/ImageFontによるテキスト描画含む）
- **boto3**: AWS SDK
- **Strands Agents SDK**: AIエージェントフレームワーク
- **AWS Bedrock**: LLM推論（Claude Sonnet 4.5、Haiku等マルチモデル対応）

### 出力仕様

- **画像形式**: PNG (RGBA)
- **出力サイズ**: 1920x1080ピクセル
- **透過サポート**: ✅ あり（3画像すべて対応）
- **エンコード**: Base64（API Gateway制限による）
- **合成順序**: base → image1 → image2 → image3 → text1 → text2 → text3
- **テキスト描画**: Noto Sans JP フォント、日本語完全対応

## 📁 プロジェクト構造

```
image-processor-api/
├── bin/
│   └── image-processor-api.ts             # CDKアプリエントリーポイント
├── lib/
│   └── image-processor-api-stack.ts       # CDKスタック定義（アップロード機能統合）
├── lambda/
│   └── python/
│       ├── image_processor.py             # メインLambda関数（3画像対応）
│       ├── image_compositor.py            # 合成エンジン
│       ├── text_renderer.py              # テキスト描画エンジン（テロップオーバーレイ）
│       ├── image_fetcher.py               # 画像取得（S3/HTTP/テスト画像）
│       ├── upload_manager.py              # アップロード管理Lambda関数
│       ├── video_generator.py             # 動画生成
│       ├── agent_handler.py               # Chat Agent Lambdaハンドラー
│       ├── agent_tools.py                 # Strands @tool 定義
│       ├── agent_prompts.py               # システムプロンプト・座標マッピング
│       ├── chat_history.py                # DynamoDB会話履歴管理
│       ├── requirements.txt               # Python依存関係
│       ├── fonts/                         # フォントファイル（Noto Sans JP）
│       └── images/                        # テスト画像
├── frontend/                             # Vue.js フロントエンド
│   ├── src/
│   │   ├── pages/                        # ページコンポーネント
│   │   │   ├── PortalPage.vue            # ポータル
│   │   │   ├── ApiPage.vue               # API Demo
│   │   │   └── ChatPage.vue              # Chat Agent
│   │   ├── components/
│   │   │   ├── ImageUploader.vue         # 画像アップロード
│   │   │   ├── ImageSelector.vue         # 画像選択
│   │   │   ├── ImageConfigTable.vue      # 画像設定テーブル
│   │   │   ├── ResultDisplay.vue         # 結果表示
│   │   │   └── chat/                     # チャットUIコンポーネント
│   │   ├── composables/
│   │   │   └── useChatAgent.ts           # Agent API統合
│   │   ├── stores/                       # Pinia状態管理
│   │   └── utils/                        # ユーティリティ関数
│   └── package.json                      # 依存関係
├── test/                                 # 包括的テストスイート
│   ├── lambda/
│   │   ├── test_image_processor.py       # 画像処理テスト
│   │   ├── test_upload_manager.py        # アップロード機能テスト
│   │   ├── test_agent_handler.py         # Agentハンドラーテスト
│   │   ├── test_agent_tools.py           # Agentツールテスト
│   │   └── test_chat_history.py          # 会話履歴テスト
│   ├── e2e/
│   │   ├── chat-agent.api.spec.ts        # Chat Agent API統合テスト
│   │   ├── chat-agent.spec.ts            # Chat Agent E2Eテスト
│   │   ├── upload-functionality.spec.ts  # アップロード機能E2Eテスト
│   │   ├── image-selection.spec.ts       # 画像選択機能E2Eテスト
│   │   └── integration-workflow.spec.ts  # 統合ワークフローテスト
│   └── run-comprehensive-tests.sh        # 包括的テスト実行スクリプト
├── scripts/
│   ├── generate_triangle_image.py        # 三角形画像生成スクリプト
│   ├── upload-test-images.sh             # テスト画像アップロード（3画像対応）
│   └── update-cdk-stack.js               # CDKスタック更新スクリプト
├── cdk.json                              # CDK設定
├── package.json                          # Node.js依存関係（テストスクリプト拡張）
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

- 🔄 **並列画像取得**: 複数画像の同時ダウンロード
- 💪 **ARM64アーキテクチャ**: Agent Lambda（高性能・低コスト）
- 🎯 **効率的なメモリ使用**: 画像処理の最適化
- 🤖 **Bedrock推論**: US Cross-Region推論プロファイルによる安定したAI推論

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

**Image Compositor** - 高性能画像合成 + AIチャットエージェント 🎨🤖
