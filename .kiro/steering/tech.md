---
inclusion: auto
---

# 技術スタック

## バックエンド

- ランタイム: AWS Lambda上のPython 3.12
- アーキテクチャ: X86_64（ライブラリ互換性重視）
- 画像処理: Pillow 10.0.0（LANCZOS補間、ImageDraw/ImageFontによるテキスト描画）
- 動画処理: ffmpeg（Lambda Layer経由）
- AWS SDK: boto3 1.34.0、botocore 1.34.0
- HTTP: requests 2.31.0

## フロントエンド

- フレームワーク: Vue.js 3.4.0
- ビルドツール: Vite 5.0.0
- 状態管理: Pinia 3.0.3
- HTTPクライアント: axios 1.11.0
- スタイリング: Tailwind CSS 4.1.11
- テスト: Vitest 1.2.0、Playwright 1.53.2

## インフラストラクチャ

- IaC: AWS CDK 2.110.0 (TypeScript)
- 言語: TypeScript 5.6.3
- Node.js: 22以上
- パッケージマネージャー: npm

## AIエージェント

- Strands Agents SDK: `strands-agents>=0.1.0,<1.0.0`（AIエージェントフレームワーク）
- Strands Agents Tools: `strands-agents-tools>=0.1.0,<1.0.0`
- Anthropic SDK: `anthropic>=0.40.0,<1.0.0`（型定義・補助）
- AWS Bedrock: LLM推論（Claude Sonnet 4.5、Haiku等マルチモデル対応）
- BedrockModel: US Cross-Region推論プロファイル
- DynamoDB: 会話履歴管理（ChatHistoryテーブル、TTL=7日）

依存パッケージは `lambda/layers/agent-deps/requirements.txt` で管理し、Lambda Layer として配布する。

### Bedrock US Cross-Region 推論プロファイル

Strands Agents は推論プロファイル経由でBedrockを呼び出す。Lambda IAMロールには2種類の権限が必要:

1. **推論プロファイルへの InvokeModel 権限**:
   - リソースARN形式: `arn:aws:bedrock:us-east-1:{account}:inference-profile/{profile-id}`
2. **基盤モデルへの InvokeModel 権限**（推論プロファイル経由でのみ使用）:
   - リソースARN形式: `arn:aws:bedrock:{region}::foundation-model/{model-id}`
   - 対象リージョン: `us-east-1`, `us-east-2`, `us-west-2`
   - 条件: `bedrock:InferenceProfileArn` が許可された推論プロファイルARNと一致する場合のみ

加えて、Bedrock Marketplaceでのモデル自動サブスクリプション用に `aws-marketplace:ViewSubscriptions / Subscribe / Unsubscribe` 権限を付与する。

#### 許可モデル（推論プロファイルID）

| モデル | 推論プロファイルID | 備考 |
|--------|-----------------|------|
| Claude Sonnet 4.5 | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` | デフォルト・高精度バランス型 |
| Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` | 高速・低コスト |
| Nova 2 Lite | `us.amazon.nova-2-lite-v1:0` | AWS製・低コスト・マルチモーダル |
| Nova Micro | `us.amazon.nova-micro-v1:0` | AWS製・最小コスト |

`agent_handler.py` の `ALLOWED_MODELS` で許可リストを管理し、リクエスト時の `modelId` バリデーションでインジェクションを防止する。

## AWSサービス

- Lambda（画像処理、アップロード管理、Chat Agent）
- API Gateway（バイナリメディア対応のREST API）
- S3（4つのバケット: リソース、テスト画像、アップロード、フロントエンド）
- CloudFront（最適化されたキャッシュポリシーを持つCDN）
- CloudWatch（ログ、メトリクス、アラーム、ダッシュボード）
- DynamoDB（会話履歴管理）
- Bedrock（AI推論）
- SQS（デッドレターキュー）
- IAM OIDC（GitHub Actions連携）

## CI/CD

- GitHub Actions: CI（ビルド・テスト）+ CD（3環境デプロイ）+ E2Eテスト
- ワークフロー: `.github/workflows/ci.yml`, `deploy.yml`, `e2e-test.yml`
- AWS認証: OIDC（`aws-actions/configure-aws-credentials@v4`）
- デプロイロール: `github-actions-image-compositor-deploy`

## よく使うコマンド

### 開発

```bash
# 依存関係のインストール
npm install

# TypeScriptのビルド
npm run build

# ウォッチモード
npm run watch

# フロントエンドのビルド
npm run build-frontend
cd frontend && npm install && npm run build
```

### デプロイ

```bash
# CDKのブートストラップ（初回のみ）
cdk bootstrap

# 全スタックのデプロイ
npm run deploy

# 特定のスタックのデプロイ
npm run deploy:api
npm run deploy:frontend

# CloudFormationの合成
npm run synth

# 差分の確認
npm run diff

# スタックの削除
npm run destroy
```

### テスト

テストコマンド・テストピラミッド・デプロイ後検証フローは [testing.md](testing.md) を参照（一元管理）。

### 環境セットアップ

```bash
# 環境変数の設定（デプロイ後）
npm run setup-env

# テスト画像のS3へのアップロード
cd scripts && ./upload-test-images.sh auto
```

### ユーティリティ

```bash
# 期待されるテスト画像の再生成
npm run regenerate-expected-images

# テストアセット形式の修正
npm run fix-test-assets
```

## 設定ファイル

- `cdk.json` - CDKアプリの設定
- `package.json` - Node.js依存関係とスクリプト
- `tsconfig.json` - TypeScriptコンパイラオプション
- `frontend/vite.config.js` - Viteビルド設定
- `frontend/vitest.config.ts` - Vitest設定（jsdom + Vue plugin）
- `frontend/package.json` - フロントエンド依存関係
- `frontend/public/composite-default.json` - 画像合成デフォルト値の単一ソース（Issue #58）。手動編集対象。Vite ビルドで `dist/` にコピー（CloudFront 配信）、`scripts/deploy.sh` と CI/CD で `lambda/python/composite_defaults.json` にもコピー（CDK バンドリングで Lambda に同梱）。`config.json`（デプロイ時動的生成）とは性質が異なる
- `lambda/python/requirements.txt` - Python依存関係
- `test/playwright.config.ts` - Playwrightテスト設定
- `test/playwright-api.config.ts` - APIテスト設定

## 環境変数

Lambda関数で使用（共通）:
- `S3_RESOURCES_BUCKET` - リソースバケット名
- `TEST_BUCKET` - テスト画像バケット名
- `UPLOAD_BUCKET` - アップロードバケット名
- `CLOUDFRONT_DOMAIN` - CloudFrontディストリビューションドメイン
- `VERSION` - アプリケーションバージョン
- `LOG_LEVEL` - ログレベル（INFO、DEBUG、ERROR）
- `PYTHONPATH` - Pythonモジュールパス
- `PATH` - バイナリパス（ffmpegを含む）

Agent Lambda固有:
- `AGENT_MODEL_ID` - デフォルト推論プロファイルID（例: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`）。`ALLOWED_MODELS` に存在しない値が指定された場合は内部フォールバック値に切り替わる
- `BEDROCK_REGION` - BedrockModel が呼び出すリージョン（デフォルト: `us-east-1`）
- `CHAT_HISTORY_TABLE` - DynamoDB会話履歴テーブル名（PK=`sessionId`, SK=`timestamp`, TTL=`ttl`）

## ビルドシステム

- CDKバンドリングはLambda関数にDockerを使用
- フロントエンドは高速HMRと最適化された本番ビルドにViteを使用
- ffmpegバイナリ用のLambdaレイヤー（動画生成）
- 最適化を伴うアセットバンドリング（pycの削除、dist-infoのクリーンアップ）
- フォントバンドリング（Noto Sans JP、`fonts/`ディレクトリ経由）
