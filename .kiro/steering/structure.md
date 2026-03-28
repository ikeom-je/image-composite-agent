---
inclusion: auto
---

# プロジェクト構造

## ルートディレクトリ

```
image-processor-api/
├── bin/                    # CDKアプリエントリーポイント
├── lib/                    # CDKスタック定義
├── lambda/                 # Lambda関数コード
├── frontend/               # Vue.jsフロントエンドアプリケーション
├── test/                   # テストスイート
├── scripts/                # ユーティリティスクリプト
├── docs/                   # ドキュメント
├── .kiro/                  # Kiro設定
└── lambda-layers/          # Lambdaレイヤー（ffmpeg）
```

## CDKインフラストラクチャ（`lib/`）

- `image-processor-api-stack.ts` - メインCDKスタック
  - API Gateway設定
  - Lambda関数（画像プロセッサ、アップロードマネージャー）
  - S3バケット（4つ）
  - CloudFrontディストリビューション
  - CloudWatch監視
  - IAMロールとポリシー

## Lambda関数（`lambda/python/`）

コアモジュール:
- `image_processor.py` - メインハンドラー（画像合成 + 動画生成）
- `upload_manager.py` - アップロード管理（署名付きURL、画像一覧）
- `image_compositor.py` - 画像合成ロジック
- `image_fetcher.py` - 並列画像取得
- `video_generator.py` - 画像からの動画生成
- `test_image_generator.py` - テスト画像生成
- `error_handler.py` - 集中エラーハンドリング
- `agent_handler.py` - Chat Agent Lambdaハンドラー（マルチモデル対応）
- `agent_tools.py` - Strands @tool 定義
- `agent_prompts.py` - システムプロンプト・座標マッピング
- `chat_history.py` - DynamoDB会話履歴管理
- `requirements.txt` - Python依存関係

テスト画像:
- `images/default-base.png` - ベース画像（黒背景）
- `images/circle_red.png` - テスト図形1
- `images/rectangle_blue.png` - テスト図形2
- `images/triangle_green.png` - テスト図形3


## フロントエンド（`frontend/`）

```
frontend/
├── src/
│   ├── pages/             # ページコンポーネント
│   ├── components/         # Vueコンポーネント
│   ├── composables/       # Composables（useChatAgent等）
│   ├── stores/            # Pinia状態管理
│   ├── router/            # Vue Router設定
│   ├── types/             # TypeScript型定義
│   ├── utils/             # ユーティリティ関数
│   ├── assets/            # 静的アセット
│   ├── App.vue            # メインアプリケーションコンポーネント
│   └── main.ts            # アプリケーションエントリーポイント
├── dist/                  # ビルド出力（生成）
├── index.html             # HTMLテンプレート
├── vite.config.js         # Vite設定
└── package.json           # フロントエンド依存関係
```

### ページ

- `PortalPage.vue` - ポータル
- `ApiPage.vue` - API Demo
- `ChatPage.vue` - Chat Agent
- `SettingsPage.vue` - Agent設定（モデル選択）

### コンポーネント

- `ImageUploader.vue` - ドラッグ&ドロップS3アップロード
- `ImageSelector.vue` - 画像ソース選択（テスト/S3/URL）
- `ImageConfigTable.vue` - 画像パラメータ設定
- `ResultDisplay.vue` - 結果プレビューとダウンロード
- `NotificationSystem.vue` - トースト通知
- `LoadingOverlay.vue` - ローディング状態
- `PerformanceMonitor.vue` - デバッグパフォーマンスメトリクス
- `ExampleCards.vue` - 使用例
- `chat/` - チャットUIコンポーネント群

### ストア（Pinia）

- `app.ts` - アプリケーション状態（ローディング、エラー）
- `config.ts` - 設定管理
- `image.ts` - 画像状態管理
- `notification.ts` - 通知キュー
- `chat.ts` - チャット状態管理（セッション、モデル選択）

### ユーティリティ

- `api.ts` - エラーハンドリング付きAPIクライアント
- `errorHandler.ts` - エラー処理
- `requestQueue.ts` - リクエストキューイングとリトライロジック

## テスト（`test/`）

```
test/
├── e2e/                   # E2Eテスト（Playwright）
│   ├── api-validation.api.spec.ts
│   ├── image-processor.api.spec.ts
│   ├── upload-functionality.spec.ts
│   ├── image-selection.spec.ts
│   ├── integration-workflow.spec.ts
│   ├── video-generation.spec.ts
│   ├── chat-agent.api.spec.ts
│   └── chat-agent.spec.ts
├── lambda/                # Lambdaユニットテスト（Python）
│   ├── test_image_processor.py
│   ├── test_upload_manager.py
│   ├── test_image_compositor_test.py
│   ├── test_image_fetcher_test.py
│   ├── test_agent_handler.py
│   ├── test_agent_tools.py
│   └── test_chat_history.py
├── test-assets/           # テスト画像と期待される出力
├── playwright.config.ts   # Playwright設定
└── playwright-api.config.ts  # APIテスト設定
```

## スクリプト（`scripts/`）

- `upload-test-images.sh` - テスト画像のS3へのアップロード
- `setup-env.sh` - 環境変数の設定
- `regenerate-expected-images.py` - テスト期待値の再生成
- `fix-test-assets.py` - テスト画像形式の修正
- `generate_triangle_image.py` - 三角形テスト画像の生成
- `create-ffmpeg-layer.sh` - ffmpeg Lambdaレイヤーの作成

## 命名規則

### ファイル
- CDKスタック: `kebab-case-stack.ts`
- Lambdaハンドラー: `snake_case.py`
- Vueコンポーネント: `PascalCase.vue`
- TypeScriptファイル: `camelCase.ts`
- テストファイル: `test_*.py` または `*.spec.ts`

### コード
- Python: 関数/変数は`snake_case`、クラスは`PascalCase`
- TypeScript: 関数/変数は`camelCase`、クラス/インターフェースは`PascalCase`
- Vue: コンポーネントは`PascalCase`、props/メソッドは`camelCase`

### AWSリソース
- スタック名: `ImageProcessorApiStack`
- Lambda関数: `ImageProcessorFunction`、`UploadManagerFunction`
- S3バケット: `ImageResourcesBucket`、`TestImagesBucket`、`UploadBucket`、`FrontendBucket`
- API Gateway: `ImageProcessorApi`
- CloudFront: `FrontendDistribution`

## ビルド成果物

生成されるディレクトリ（バージョン管理外）:
- `cdk.out/` - CDK合成出力
- `node_modules/` - Node.js依存関係
- `frontend/dist/` - フロントエンドビルド出力
- `frontend/node_modules/` - フロントエンド依存関係
- `test/test-results/` - テスト実行結果
- `playwright-report/` - Playwrightテストレポート
- `.venv/` - Python仮想環境（ローカル使用時）

## ドキュメント

- `README.md` - メインプロジェクトドキュメント（日本語）
- `docs/api-testing-guide.md` - APIテストガイド
- `history.md` - 変更履歴
- `prompts.md` - 開発プロンプト
- `AmazonQ.md` - Amazon Q統合メモ
- `CLAUDE.md` - Claude統合メモ
