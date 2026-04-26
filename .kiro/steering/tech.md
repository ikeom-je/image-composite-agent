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

- Strands Agents SDK: AIエージェントフレームワーク
- AWS Bedrock: LLM推論（Claude Sonnet 4.5、Haiku等マルチモデル対応）
- BedrockModel: US Cross-Region推論プロファイル
- DynamoDB: 会話履歴管理（ChatHistoryテーブル）

## AWSサービス

- Lambda（画像処理、アップロード管理、Chat Agent）
- API Gateway（バイナリメディア対応のREST API）
- S3（4つのバケット: リソース、テスト画像、アップロード、フロントエンド）
- CloudFront（最適化されたキャッシュポリシーを持つCDN）
- CloudWatch（ログ、メトリクス、アラーム、ダッシュボード）
- DynamoDB（会話履歴管理）
- Bedrock（AI推論）
- SQS（デッドレターキュー）

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

```bash
# 全テストの実行
npm run test:comprehensive

# Lambdaユニットテスト
npm run test:lambda

# API統合テスト
npm run test:api

# E2Eテスト
npm run test:upload          # アップロード機能
npm run test:selection       # 画像選択
npm run test:integration     # 完全なワークフロー
npm run test:all-e2e        # 全E2Eテスト

# フロントエンドテスト
npm run test:frontend

# 動画生成テスト
npm test:video-generation
```

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
- `frontend/package.json` - フロントエンド依存関係
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
- `AGENT_MODEL_ID` - デフォルトモデルID（例: us.anthropic.claude-sonnet-4-5-20250929-v1:0）
- `CHAT_HISTORY_TABLE` - DynamoDB会話履歴テーブル名

## ビルドシステム

- CDKバンドリングはLambda関数にDockerを使用
- フロントエンドは高速HMRと最適化された本番ビルドにViteを使用
- ffmpegバイナリ用のLambdaレイヤー（動画生成）
- 最適化を伴うアセットバンドリング（pycの削除、dist-infoのクリーンアップ）
- フォントバンドリング（Noto Sans JP、`fonts/`ディレクトリ経由）
