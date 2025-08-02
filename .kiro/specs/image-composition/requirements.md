# 画像合成REST APIシステム - 要件定義

## 概要

高性能・アルファチャンネル対応の画像合成REST APIシステム。AWS CDK + Lambda + API Gateway + S3構成で、2つまたは3つの画像を合成してPNG形式で出力する。Vue.js 3フロントエンドによる直感的なWebインターフェースを提供し、テスト画像とS3画像の両方に対応する。

## 要件

### Requirement 1: 基本的な画像合成機能

**User Story:** ユーザーとして、2つまたは3つの画像を指定して合成画像を生成したい。そうすることで、複雑で豊かな画像コンテンツを作成できる。

#### Acceptance Criteria

1. WHEN ユーザーが2つの画像パラメータ（image1, image2）を指定する THEN システムは2画像合成処理を実行する
2. WHEN ユーザーが3つの画像パラメータ（image1, image2, image3）を指定する THEN システムは3画像合成処理を実行する
3. WHEN 画像合成処理が完了する THEN 高品質なPNG形式の画像が生成される
4. WHEN 画像にアルファチャンネル（透過情報）がある THEN 透過情報を保持して合成される
5. WHEN 複数の画像が重なる場合 THEN image1 → image2 → image3の順序で前面に表示される
6. WHEN image3パラメータが指定されない THEN 従来通り2画像合成処理を実行する（後方互換性）

### Requirement 2: 画像の位置・サイズ調整機能

**User Story:** ユーザーとして、各画像の位置とサイズを自由に調整したい。そうすることで、理想的なレイアウトの合成画像を作成できる。

#### Acceptance Criteria

1. WHEN 各画像の位置パラメータ（imageXX, imageXY）を指定する THEN 指定した位置に画像が配置される
2. WHEN 各画像のサイズパラメータ（imageXWidth, imageXHeight）を指定する THEN 指定したサイズに画像がリサイズされる
3. WHEN 位置パラメータが指定されない THEN デフォルトの位置に画像が配置される
4. WHEN サイズパラメータが指定されない THEN デフォルトのサイズで画像が表示される
5. WHEN 複数の画像が重なる場合 THEN 適切な重ね順で表示される

### Requirement 3: 画像取得・管理機能

**User Story:** 開発者として、S3とテスト画像の両方から画像を取得したい。そうすることで、柔軟な画像ソースに対応できる。

#### Acceptance Criteria

1. WHEN S3パス（s3://bucket/path）を指定する THEN S3から画像を取得する
2. WHEN HTTP/HTTPSのURLを指定する THEN Webから画像を取得する
3. WHEN "test"を指定する THEN 適切なテスト画像を自動選択する
4. WHEN 複数の画像を取得する THEN 並列処理で高速化する
5. WHEN 画像取得に失敗する THEN 適切なエラーメッセージを返す

### Requirement 4: レスポンス形式の選択機能

**User Story:** ユーザーとして、HTML表示またはPNG直接ダウンロードを選択したい。そうすることで、用途に応じた出力形式を利用できる。

#### Acceptance Criteria

1. WHEN format=htmlを指定する THEN 技術情報付きのHTML表示を返す
2. WHEN format=pngを指定する THEN PNG画像を直接返す
3. WHEN formatが指定されない THEN デフォルトでHTML表示を返す
4. WHEN HTMLレスポンスを表示する THEN JavaScriptダウンロード機能を提供する
5. WHEN エラーが発生する THEN 適切なエラーレスポンスを返す

### Requirement 5: フロントエンドWebインターフェース

**User Story:** ユーザーとして、直感的なWebインターフェースで画像合成を行いたい。そうすることで、技術的な知識なしに機能を利用できる。

#### Acceptance Criteria

1. WHEN フロントエンドにアクセスする THEN レスポンシブなWebUIが表示される
2. WHEN 画像選択フォームを操作する THEN テスト画像とS3画像を選択できる
3. WHEN 位置・サイズ調整フォームを操作する THEN 数値入力で配置を調整できる
4. WHEN 画像合成を実行する THEN API経由で画像が合成される
5. WHEN 使用例を選択する THEN プリセットパラメータで実行される

### Requirement 6: インフラストラクチャとセキュリティ

**User Story:** 開発者として、セキュアで拡張可能なインフラストラクチャを構築したい。そうすることで、本番環境での安定運用を実現できる。

#### Acceptance Criteria

1. WHEN システムをデプロイする THEN AWS CDKによるIaC管理を実行する
2. WHEN APIにアクセスする THEN API Gatewayによる適切なルーティングを実行する
3. WHEN 画像を保存する THEN S3による安全なストレージを使用する
4. WHEN フロントエンドを配信する THEN CloudFrontによるセキュアな配信を実行する
5. WHEN 権限を管理する THEN IAMによる最小権限の原則を適用する

### Requirement 7: テストとデバッグ機能

**User Story:** 開発者として、包括的なテストとデバッグ機能を実装したい。そうすることで、システムの品質と信頼性を確保できる。

#### Acceptance Criteria

1. WHEN Lambda関数をテストする THEN ユニットテストで各機能を検証する
2. WHEN APIをテストする THEN 統合テストでエンドポイントを検証する
3. WHEN フロントエンドをテストする THEN E2Eテストでユーザー操作を検証する
4. WHEN エラーが発生する THEN 詳細なログとエラーハンドリングを提供する
5. WHEN 全体をテストする THEN 統合テストで完全な動作を検証する

### Requirement 8: テスト画像とリソース管理

**User Story:** 開発者として、テスト用の画像リソースを管理したい。そうすることで、機能のテストと動作確認ができる。

#### Acceptance Criteria

1. WHEN テスト画像を生成する THEN 円・四角・三角の図形画像を作成する
2. WHEN テスト画像を保存する THEN アルファチャンネル対応のPNG形式で保存する
3. WHEN テスト画像をアップロードする THEN S3の適切な場所に配置する
4. WHEN "test"を指定する THEN 画像タイプに応じて適切なテスト画像を選択する
5. WHEN テスト画像を使用する THEN 高品質な合成処理を実行する
6. WHEN "triangle_green.png"という三角形画像を生成する THEN 緑色の三角形画像がPNG形式で作成される
7. WHEN image3="test"を指定する THEN 三角形画像が自動的に選択される

### Requirement 9: 動的設定管理機能

**User Story:** 開発者として、デプロイ時に動的にURL設定を管理したい。そうすることで、環境に依存しない柔軟なシステムを構築できる。

#### Acceptance Criteria

1. WHEN CDKをデプロイする THEN API GatewayとCloudFrontのURLを自動取得する
2. WHEN 設定ファイルを生成する THEN config.jsonを動的に作成してS3にデプロイする
3. WHEN フロントエンドを起動する THEN config.jsonから設定を読み込む
4. WHEN 環境変数を設定する THEN 設定をオーバーライドできる
5. WHEN 設定読み込みに失敗する THEN フォールバック機能で堅牢性を確保する

### Requirement 10: パフォーマンスと拡張性

**User Story:** 開発者として、高性能で拡張可能なシステムを構築したい。そうすることで、大量のリクエストに対応できる。

#### Acceptance Criteria

1. WHEN 複数の画像を取得する THEN 並列処理で処理時間を短縮する
2. WHEN 画像を合成する THEN 高品質なLANCOS補間を使用する
3. WHEN レスポンスを返す THEN 適切なキャッシュヘッダーを設定する
4. WHEN 負荷が増加する THEN Lambdaの自動スケーリングで対応する
5. WHEN CDNを使用する THEN CloudFrontでグローバル配信を実現する

### Requirement 11: S3画像アップロード機能

**User Story:** ユーザーとして、画像ファイルをS3にアップロードしたい。そうすることで、画像コンテンツを安全に保存し、後で画像合成に利用できる。

#### Acceptance Criteria

1. WHEN ユーザーが画像ファイルを選択する THEN フロントエンドで画像ファイルの検証を実行する
2. WHEN 画像ファイルが有効である THEN S3への署名付きURLを生成する
3. WHEN 署名付きURLを取得する THEN 画像ファイルを直接S3にアップロードする
4. WHEN アップロードが完了する THEN アップロード成功の確認メッセージを表示する
5. WHEN アップロードに失敗する THEN 適切なエラーメッセージを表示する
6. WHEN 画像ファイルサイズが制限を超える THEN アップロード前にエラーを表示する
7. WHEN 対応していない画像形式を選択する THEN 適切なエラーメッセージを表示する
8. WHEN 画像がアップロードされる THEN 自動的にPNG形式のサムネイルを生成する

### Requirement 12: 画像合成用画像選択機能

**User Story:** ユーザーとして、画像合成のimage1、image2、image3として使用する画像を選択したい。そうすることで、未選択・テスト画像・S3アップロード画像から適切な画像を選択できる。

#### Acceptance Criteria

1. WHEN 画像選択ドロップダウンを開く THEN 「未選択」「既存テスト画像」「S3アップロード画像」の選択肢を表示する
2. WHEN 「未選択」を選択する THEN その画像スロットを空にして1画像合成モードにする
3. WHEN 「既存テスト画像」を選択する THEN circle_red.png、rectangle_blue.png、triangle_green.pngから選択できる
4. WHEN 「S3アップロード画像」を選択する THEN S3バケット内の画像一覧をPNG形式のサムネイル付きで表示する
5. WHEN S3画像を選択する THEN 画像合成フォームに自動的にS3パスが設定される
6. WHEN S3画像一覧の読み込みに失敗する THEN 適切なエラーメッセージを表示する
7. WHEN S3に画像が存在しない THEN 「アップロードされた画像がありません」メッセージを表示する
8. WHEN サムネイルが存在しない THEN 元画像をサムネイルとして表示する

## 技術的制約

- AWS CDK + Lambda + API Gateway + S3 + CloudFront構成
- Python 3.12 + Pillowライブラリによる画像処理
- Vue.js 3 + Vite + Tailwind CSSフロントエンド
- RESTエンドポイント（/images/composite）
- アルファチャンネル（透過情報）の完全サポート
- 後方互換性の完全な保持（2画像合成）
- セキュリティベストプラクティスの適用
- 対応画像形式：JPEG、PNG、GIF、WebP、TIFF、TGA

## 成功基準

1. 2つまたは3つの画像の高品質な合成処理
2. 直感的で使いやすいWebインターフェース
3. セキュアで拡張可能なクラウドインフラストラクチャ
4. 包括的なテストカバレッジ
5. 高いパフォーマンスと可用性
6. 完全な後方互換性の保持
7. アルファチャンネル対応の継続
8. 動的設定管理による環境非依存性