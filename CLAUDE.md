# Image Compositor - 開発ガイド

## 仕様駆動開発

このプロジェクトはKiro/QDevによる仕様駆動開発を採用しています。実装は必ず仕様に基づいて行ってください。

### 仕様ファイル（必読）

| ファイル | 内容 |
|---------|------|
| `.kiro/specs/image-composition/requirements.md` | 画像合成要件定義（18要件、受入基準付き） |
| `.kiro/specs/image-composition/design.md` | 画像合成統合設計書 |
| `.kiro/specs/image-composition/tasks.md` | 画像合成実装タスク一覧 |
| `.kiro/specs/strands-agent/requirements.md` | チャットエージェント要件定義（12要件） |
| `.kiro/specs/strands-agent/design.md` | チャットエージェント設計書 |
| `.kiro/specs/strands-agent/tasks.md` | チャットエージェント実装タスク一覧 |

### 仕様駆動開発ルール

1. **実装前に仕様確認**: 実装着手前に`tasks.md`の該当タスクと`requirements.md`の関連要件を必ず確認する
2. **受入基準の遵守**: `requirements.md`のAcceptance Criteriaをテストケースとして実装に反映する
3. **タスク進捗更新**: 実装完了時に`tasks.md`のチェックボックスを`[x]`に更新する
4. **設計準拠**: コンポーネント構造、データモデル、API設計は`design.md`に従う
5. **要件トレーサビリティ**: 各タスクの `_要件: X.X_` を参照し、対応する要件が満たされていることを確認する

### 環境戦略

単一AWSアカウント内で3環境を運用。スタック名サフィックスで分離。

| 環境 | ブランチ | デプロイ | スタック名例 |
|------|---------|---------|------------|
| dev | feature/*, bugfix/* | 手動 | `ImageProcessorApiStack-Dev` |
| staging | dev | CI/CD自動 | `ImageProcessorApiStack-Staging` |
| production | main | CI/CD自動 | `ImageProcessorApiStack` |

開発フロー: `feature/* → dev(staging) → main(production)`

### 環境変数

デプロイ前に`.env.local`を読み込むこと（`source .env.local`）。設定項目は`.env.local.example`を参照。

## プロジェクト構成

```
├── lib/                          # AWS CDK スタック（TypeScript）
├── lambda/python/                # Lambda関数（Python 3.12）
│   ├── image_processor.py        # メイン合成ハンドラー
│   ├── image_compositor.py       # 合成エンジン
│   ├── text_renderer.py          # テキスト描画エンジン（テロップオーバーレイ）
│   ├── image_fetcher.py          # 画像取得（S3/HTTP/テスト画像）
│   ├── upload_manager.py         # S3アップロード管理
│   ├── video_generator.py        # 動画生成
│   ├── error_handler.py          # エラー処理
│   ├── fonts/                    # フォントファイル（Noto Sans JP）
│   ├── agent_handler.py          # Chat Agent Lambdaハンドラー
│   ├── agent_tools.py            # Strands @tool 定義
│   ├── agent_prompts.py          # システムプロンプト・座標マッピング
│   └── chat_history.py           # DynamoDB会話履歴管理
├── frontend/                     # Vue.js 3 アプリケーション
│   └── src/
│       ├── pages/                # ページコンポーネント
│       │   ├── PortalPage.vue        # ポータル
│       │   ├── ApiPage.vue           # API Demo
│       │   ├── ChatPage.vue          # Chat Agent
│       │   └── SettingsPage.vue      # Agent設定（モデル選択）
│       ├── components/           # Vueコンポーネント
│       │   ├── ImageConfigTable.vue  # パラメータ設定テーブル
│       │   ├── ImageSelector.vue     # 画像選択
│       │   ├── ImageUploader.vue     # S3アップロード
│       │   ├── ResultDisplay.vue     # 結果表示
│       │   └── chat/                 # チャットUIコンポーネント
│       ├── composables/          # Composables
│       │   └── useChatAgent.ts       # Agent API統合
│       ├── stores/               # Pinia ストア
│       ├── utils/                # ユーティリティ
│       └── types/                # TypeScript型定義
├── test/                         # テストスイート
│   ├── e2e/                      # Playwright E2Eテスト
│   ├── lambda/                   # Python単体テスト
│   └── test-assets/              # テスト用画像
├── scripts/                      # ビルド/デプロイ/ユーティリティスクリプト
├── .github/workflows/            # GitHub Actions CI/CD
│   ├── ci.yml                    # CI: ビルド検証 + テスト（4並列ジョブ）
│   ├── deploy.yml                # CD: 3環境自動デプロイ（dev/staging/production）
│   └── e2e-test.yml              # デプロイ後e2eテスト（Playwright）
└── .kiro/specs/                  # 仕様書（要件・設計・タスク）
    ├── image-composition/        # 画像合成機能仕様
    └── strands-agent/            # チャットエージェント仕様
```

## 技術スタック

- **バックエンド**: AWS CDK (TypeScript), Lambda (Python 3.12), Pillow, boto3
- **チャットエージェント**: Strands Agents SDK, AWS Bedrock (Claude Sonnet 4.5等マルチモデル対応), DynamoDB
- **フロントエンド**: Vue.js 3, Vite 5, Pinia 3, Tailwind CSS 4.1, Axios
- **テスト**: Playwright (E2E/API統合), Python unittest
- **インフラ**: API Gateway, S3, CloudFront, CloudWatch, DynamoDB, Bedrock

### Lambda構成

| Lambda | ランタイム | アーキテクチャ | メモリ | 用途 |
|--------|----------|--------------|--------|------|
| ImageProcessorFunction | Python 3.12 | X86_64 | 2048MB | 画像合成・動画生成 |
| AgentFunction | Python 3.12 | ARM_64 | 2048MB | Chat Agent (Bedrock) |

## 開発規約

### フロントエンド

- **フレームワーク**: Vue.js 3 Composition API (`<script setup>`)
- **状態管理**: Pinia ストア（config, app, notification, image, chat）
- **スタイリング**: Tailwind CSS。カラーコーディング: 赤(Image1), 青(Image2), 緑(Image3), 紫(Text)
- **キャンバスサイズ**: 1920x1080固定。プレビューは1:5スケール（384x216）
- **コンポーネント設計**: `design.md`のコンポーネントアーキテクチャに従う

### バックエンド（Lambda/Python）

- **画像処理**: Pillow (PIL)、RGBAモード、LANCZOS補間
- **テキスト描画**: Pillow ImageDraw + Noto Sans JP（`#RRGGBB`/`#RRGGBBAA`形式のみ対応）
- **並列処理**: ThreadPoolExecutor による画像取得
- **レスポンス形式**: HTML（デフォルト）またはPNG
- **Agent**: Strands Agents SDK + BedrockModel、環境変数`AGENT_MODEL_ID`でデフォルトモデル指定、リクエスト時にモデル切り替え可能（マルチモデル対応）

### テスト

- **Lambda単体テスト**: `PYTHONPATH=lambda/python python3 -m unittest discover -s test/lambda`
- **APIテスト**: `API_URL=... npm run test:api`（設定: `test/playwright-api.config.ts`）
- **フロントエンドE2E**: `FRONTEND_URL=... npm run test:all-e2e`（設定: `test/playwright.config.ts`）
- **Agent APIテスト**: `CHAT_API_URL=... npx playwright test --config=test/playwright-api.config.ts --grep "Chat Agent"`
- **Agent E2Eテスト**: `FRONTEND_URL=... npx playwright test --project=chat-agent-tests`
- **テスト画像**: `test/test-assets/`（期待値画像は正しいPNG形式で管理）
- **CI/CD**: `.github/workflows/ci.yml`（ビルド+テスト）、`deploy.yml`（デプロイ）、`e2e-test.yml`（デプロイ後e2e）

### コミット

- 日本語でコミットメッセージを記述
- 機能単位でコミット

### デプロイ

```bash
source .env.local  # 環境変数読み込み（AGENTMODEL等）

# dev環境（手動・作業ブランチの動作確認用）
ENVIRONMENT=dev ./scripts/deploy.sh

# staging/production環境はCI/CDで自動デプロイ
# staging: devブランチへマージ時に自動実行
# production: mainブランチへマージ時に自動実行
```

## 重要な設計原則

1. **後方互換性**: 既存の2画像合成APIパラメータ名を維持
2. **アルファチャンネル完全対応**: 透過情報を保持
3. **テキストオーバーレイ**: 最大3テキストレイヤー、Z-order=画像→テキスト、text_params省略時は既存動作
3. **環境非依存**: 動的設定管理（config.json）によるURL自動設定
4. **v2.3.0 UIデザイン復活**: テーブルベースのパラメータ設定UI
5. **セキュリティ**: IAM最小権限、CORS適切設定、入力バリデーション
6. **Bedrock IAM認証**: APIキー不要、IAMロールベース認証
