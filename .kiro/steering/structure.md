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
- `image_compositor.py` - 画像合成ロジック（テキストパラメータ解析含む）
- `text_renderer.py` - テキスト描画エンジン（Pillow ImageDraw、Noto Sans JP対応）
- `image_fetcher.py` - 並列画像取得
- `video_generator.py` - 画像からの動画生成
- `test_image_generator.py` - テスト画像生成
- `error_handler.py` - 集中エラーハンドリング
- `agent_handler.py` - Chat Agent Lambdaハンドラー（マルチモデル対応）
- `agent_tools.py` - Strands @tool 定義
- `agent_prompts.py` - システムプロンプト・座標マッピング
- `chat_history.py` - DynamoDB会話履歴管理
- `requirements.txt` - Python依存関係

### Lambda モジュール間の依存関係

#### Chat Agent Lambda（agent_handler の起動経路）

```
agent_handler.py
   ├─ agent_tools.py          (compose_images / generate_video / list_uploaded_images / delete_uploaded_image / get_help)
   │     └─ agent_prompts.py  (resolve_position, resolve_size)
   ├─ agent_prompts.py        (SYSTEM_PROMPT)
   └─ chat_history.py         (ChatHistoryManager — DynamoDB)
```

- `agent_tools._last_media_result` はモジュールグローバル変数。`agent_handler.handle_chat` が呼び出し前にリセット → ツール実行後に取得（コンテキスト超過対策のための受け渡し）。
- 循環依存はない。`agent_prompts` と `chat_history` は他モジュールに依存しない葉ノード。

#### Image Processor Lambda（image_processor の起動経路）

```
image_processor.py
   ├─ image_compositor.py     (create_composite_image, parse_image_parameters, parse_text_parameters)
   │     └─ text_renderer.py  (render_text_overlay, load_font)
   ├─ image_fetcher.py        (fetch_images_parallel)
   ├─ video_generator.py      (generate_video_from_image, get_video_mime_type, get_video_extension — ffmpeg呼び出し)
   ├─ test_image_generator.py (generate_circle_image, generate_rectangle_image, generate_triangle_image)
   └─ error_handler.py        (ParameterError, ImageFetchError, ImageProcessingError)
```

- `text_renderer` は `image_compositor` のみが利用する。直接 `image_processor` から呼ばない。
- `error_handler` は全モジュールから利用される共通の例外定義。
- `image_processor` は `upload_manager` を import しない。後者は独立した `UploadManagerFunction` Lambda として動作する（下記参照）。

#### Upload Manager Lambda（upload_manager の起動経路）

```
upload_manager.py
   └─ (外部のみ: boto3, PIL, botocore)
```

S3署名付きURL発行・アップロード済み画像一覧の独立Lambda。プロジェクト内の他Pythonモジュールには依存しない。Image Processor Lambda とは API Gateway 上で別パス（`/upload/*`）にマッピングされる。

フォント:
- `fonts/NotoSansJP-Regular.ttf` - 日本語フォント（テキストオーバーレイ用）

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
- `ImageConfigTable.vue` - 画像・テキストパラメータ設定
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
│   ├── test_text_renderer.py
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

## CI/CD（`.github/`）

- `.github/workflows/ci.yml` - CI: ビルド検証 + テスト（4並列ジョブ）
- `.github/workflows/deploy.yml` - CD: 3環境自動デプロイ + e2eテスト呼び出し
- `.github/workflows/e2e-test.yml` - デプロイ後e2eテスト（Playwright）
- `.github/oidc-deploy-role.yml` - OIDC + IAMロール作成用CloudFormationテンプレート

## ドキュメント

- `README.md` - メインプロジェクトドキュメント（日本語）
- `CLAUDE.md` - Claude Code開発ガイド
- `docs/api-testing-guide.md` - APIテストガイド
- `history.md` - 変更履歴
- `prompts.md` - 開発プロンプト
