---
inclusion: auto
---

# アーキテクチャルール

## サーバーレス原則

- コンピュートにはLambdaを使用（ステートレス関数）
- ストレージにはS3を使用（4つのバケット: resources、test、upload、frontend）
- HTTPエンドポイントにはAPI Gatewayを使用
- CDNとキャッシングにはCloudFrontを使用
- 監視とログにはCloudWatchを使用
- 会話履歴にはDynamoDBを使用
- AI推論にはBedrock（マルチモデル対応）を使用

## Lambda設計

### 関数の責務
- `ImageProcessorFunction`: 画像合成 + テキスト描画 + 動画生成（X86_64）
- `UploadManagerFunction`: 署名付きURL + 画像一覧（X86_64）
- `AgentFunction`: Chat Agent — Bedrock推論 + 会話管理（ARM_64）

### 設定
- メモリ: 2048MB
- タイムアウト: 90秒
- アーキテクチャ: X86_64（ImageProcessor/UploadManager）、ARM_64（Agent）
- 同時実行数: 10（コスト管理）
- デッドレターキュー: 常に設定
- リトライ回数: 2回

### ベストプラクティス
- 関数を集中させる（単一責任）
- 設定には環境変数を使用
- 適切なエラーハンドリングを実装
- 構造化形式でログを記録
- トレース用にリクエストIDを使用
- コールドスタート時間を最適化

## API Gateway設計

### エンドポイント
- `/images/composite` - 画像合成
- `/upload/presigned-url` - アップロードURL取得
- `/upload/images` - アップロード済み画像一覧
- `/chat` - Chat Agent（POST: メッセージ送信）
- `/chat/history` - 会話履歴（GET: 取得、DELETE: 削除）
- `/chat/models` - 利用可能モデル一覧（GET）

### 設定
- バイナリメディアタイプ: 明示的に設定
- CORS: すべてのオリジンで有効（開発環境）
- スロットリング: 100 req/s、バースト200
- 使用量プラン: 10,000 req/日
- エラーレスポンス: 400、500にCORSヘッダー付き

## S3バケット戦略

### バケットの目的
1. **ResourcesBucket**: 生成された動画、共有リソース（RETAIN）
2. **TestImagesBucket**: API用テスト画像（DESTROY）
3. **UploadBucket**: ユーザーアップロード画像（DESTROY）
4. **FrontendBucket**: Vue.js SPA（DESTROY）

### セキュリティ
- すべてのバケット: プライベートアクセスのみ
- CloudFront OAI: フロントエンド/リソースアクセス用
- 署名付きURL: アップロードバケット用（1時間有効期限）
- 暗号化: S3管理（SSE-S3）

## CloudFront戦略

### キャッシュポリシー
- HTML: デフォルト5秒、最大5分（高速更新）
- JS/CSS: デフォルト5秒、最大1時間（開発環境）
- 画像: デフォルト7日、最大365日
- 動画: デフォルト24時間、最大365日

### ビヘイビア
- デフォルト: フロントエンドSPA
- `/generated-videos/*`: リソースバケットからの動画ファイル
- エラーレスポンス: 404/403 → index.html（SPAルーティング）

## 状態管理

### バックエンド（Lambda）
- ステートレス: Lambdaにセッション状態なし
- 一時的: 処理には/tmpを使用（512MB制限）
- 永続的: S3に保存

### フロントエンド（Vue.js）
- Piniaストア: app、config、image、notification、chat
- ローカル状態: コンポーネントのref/reactive
- localStorageなし: S3からの動的設定を使用

## エラーハンドリング

### Lambda
- カスタム例外: ParameterError、ImageFetchError、ImageProcessingError
- 構造化レスポンス: statusCode、headers、body
- リクエストID: ログ全体でトラッキング
- DLQ: 失敗した呼び出しをキャプチャ

### フロントエンド
- 通知システム: トーストメッセージ
- エラーバウンダリ: コンポーネントレベル
- リトライロジック: 指数バックオフ
- ユーザーフレンドリーなメッセージ: スタックトレースなし

## 監視

### CloudWatchアラーム
- Lambdaエラー: 10分間で5回以上
- Lambda実行時間: 平均50秒以上
- API Gateway 4XX: 10分間で10回以上
- API Gatewayレイテンシ: 平均5秒以上

### ログ
- Lambda: /aws/lambda/{function-name}
- 保持期間: 1週間
- 構造化: リクエストID付きJSON形式

## セキュリティ

### IAM原則
- 最小権限: 最小限のアクセス許可
- Lambda実行ロール: S3読み取りのみ（画像プロセッサ）
- Lambda実行ロール: S3読み書き（アップロードマネージャー）
- ハードコードされた認証情報なし: IAMロールを使用

### APIセキュリティ
- 認証なし: パブリックAPI（必要に応じて追加）
- レート制限: 使用量プラン
- 入力検証: Lambda関数レベル
- CORS: 本番環境では制限的に設定

## パフォーマンス

### Lambda最適化
- 並列処理: 画像用ThreadPoolExecutor
- メモリ割り当て: プロファイリングに基づく
- コールドスタート: 依存関係を最小化
- バンドルサイズ: 不要なファイルを削除

### フロントエンド最適化
- コード分割: Vite自動
- 遅延ロード: ルートベース
- 画像最適化: アップロード前に圧縮
- CDN: すべての静的アセットにCloudFront

## スケーラビリティ

### オートスケーリング
- Lambda: 自動（同時実行制限まで）
- API Gateway: 自動
- S3: 無制限
- CloudFront: グローバルエッジロケーション

### 制限
- Lambda同時実行: 10（設定可能）
- APIスロットル: 100 req/s（設定可能）
- S3オブジェクトサイズ: 最大5GB
- Lambda /tmp: 512MB
