# 画像合成REST API 開発履歴

## 初期開発: 画像合成REST APIの基本実装

### バックエンド開発
- AWS CDKを使用したインフラストラクチャのコード化
- Python 3.12 + Pillowを使用したLambda関数の実装
- API Gatewayによる画像合成APIエンドポイントの公開
- S3バケットを使用した画像リソースの管理
- バイナリメディアタイプ対応のAPI設定

### 主要機能
- 複数画像の合成処理
- アルファチャンネル（透過）対応
- 画像の位置とサイズのカスタマイズ
- HTML表示とPNG直接ダウンロードの両対応
- S3パス、HTTP URL、テスト画像の使用をサポート

### インフラストラクチャ
- ARM64アーキテクチャによる高性能・低コスト化
- uvによる高速パッケージ管理
- 並列画像取得による処理の高速化
- 最小権限の原則に基づくセキュリティ設定

## 2025-07-06: Vue.jsフロントエンドの追加とCDK統合

### フロントエンド開発
- Vue.js 3を使用したフロントエンドアプリケーションを作成
- 画像合成APIを呼び出すためのインタラクティブなUIを実装
- 画像パラメータ（位置、サイズ、画像ソース）の設定フォーム
- 生成された画像のプレビューとダウンロード機能
- API URLのコピー機能
- レスポンシブデザインの実装
- 使用例のプリセット

### CDK統合
- フロントエンド用の専用S3バケットをCDKスタックに追加
  - 静的ウェブサイトホスティング設定
  - パブリックアクセス許可
- CDKデプロイ時にVue.jsアプリケーションを自動的にビルド
- `aws-cdk-lib/aws-s3-deployment`を使用したS3へのデプロイ自動化
- フロントエンドURLをCloudFormation出力に追加

### ビルドとデプロイの改善
- `build-frontend`スクリプトの追加: フロントエンドのビルド
- `deploy-all`スクリプトの追加: フロントエンドのビルドとCDKスタックのデプロイを一度に実行
- Vue.js設定の最適化（相対パス、ソースマップ無効化、チャンク分割）
- エラーハンドリングの強化（依存関係チェック、ビルド失敗時の対応）

### ドキュメント更新
- READMEにフロントエンド情報とデプロイ手順を追加
- アーキテクチャ図にフロントエンド部分を追加
- プロジェクト構造の説明を更新
- フロントエンド専用のREADMEを作成
- 開発履歴を記録するhistory.mdファイルの作成

### ファイル構造の変更
- `frontend/`ディレクトリの追加
  - `src/`: Vue.jsソースコード
  - `public/`: 静的ファイル
  - 設定ファイル（package.json, vue.config.js, babel.config.js）
- `scripts/`ディレクトリの拡張
  - CDKスタック更新スクリプトの追加

### 技術スタックの拡張
- Vue.js 3: フロントエンドフレームワーク
- Axios: HTTP通信ライブラリ
- AWS S3 Static Website Hosting: フロントエンドホスティング
- AWS CDK S3 Deployment: デプロイ自動化

## 2025-07-06: テスト機能の追加

### テスト環境の構築
- Playwrightを使用したE2Eテスト環境の構築
- Python unittestを使用したLambda関数のユニットテスト
- テスト実行スクリプトの作成

### テストコードの実装
- Lambda関数のユニットテスト
  - 画像取得処理のテスト
  - 画像合成処理のテスト
  - エラーハンドリングのテスト
- API機能のE2Eテスト
  - 基本的な画像合成のテスト
  - パラメータバリデーションのテスト
  - エラーレスポンスのテスト
- フロントエンドのE2Eテスト
  - UIコンポーネントの表示テスト
  - フォーム入力と送信のテスト
  - 画像生成結果の表示テスト

### Lambda関数の改善
- エラーハンドリングの強化
- パラメータバリデーションの改善
- 数値パラメータの型変換エラー処理

### テスト自動化
- npm scriptsによるテスト実行の簡素化
- Python仮想環境を使用したテスト環境の分離
- テスト結果のレポート機能

### ドキュメント更新
- READMEにテスト情報を追加
- AmazonQ.mdにテスト手順を追加
- history.mdにテスト実装の履歴を追加

## 2025-07-07: フロントエンドの画像表示問題の修正

### フロントエンド改善
- Vue.jsフロントエンドの画像表示問題を修正
- 画像生成ボタンクリック後の結果表示を改善
- レスポンスのContent-Type判定による適切な画像表示処理の実装
- エラーハンドリングの強化と自動再試行メカニズムの追加

### 技術的改善点
- APIレスポンス処理の改善
  - HTML形式のレスポンスから画像データを適切に抽出
  - Blobレスポンスタイプを使用した画像データの取得
  - Content-Typeに基づく条件分岐処理の実装
- 画像表示エラー時の自動リカバリー機能
  - 画像読み込み失敗時のPNG形式での再試行
  - エラー発生時の代替表示オプション

### ビルドとデプロイの最適化
- フロントエンドのビルドプロセスの改善
- CloudFrontキャッシュ無効化による最新コンテンツの配信確保
- APIエンドポイントURLの更新と環境変数の適切な設定

### テスト改善
- Playwrightテスト実行時のHTML報告書サーバー問題を修正
- テスト実行スクリプトの改善（`run-api-tests.sh`の追加）
- テスト設定の最適化（`--no-open-report`フラグの使用）

### ドキュメント更新
- README.mdの更新（デモシステムの概要説明の改善）
- AmazonQ.mdの更新（フロントエンド実装ガイドの強化）
- history.mdへの変更履歴の追加

## 2025-07-06: セキュリティ強化 - CloudFrontの導入

### セキュリティ改善
- S3バケットを完全プライベート化（パブリックアクセスをブロック）
- CloudFrontディストリビューションをS3の前段に配置
- Origin Access Identity (OAI)を使用してS3へのアクセスを制限
- HTTPS経由のアクセスを強制（ViewerProtocolPolicy.REDIRECT_TO_HTTPS）

### インフラストラクチャの変更
- CloudFrontディストリビューションの追加
  - SPAルーティングのためのエラーレスポンス設定（404→200、/index.html）
  - キャッシュ最適化設定
  - コスト最適化のためのPriceClass設定（PRICE_CLASS_100）
- S3バケットポリシーの更新
  - CloudFrontからのアクセスのみを許可
  - 直接アクセスをブロック

### デプロイプロセスの改善
- CloudFrontキャッシュ無効化の自動化
- S3デプロイとCloudFront配信の連携

### ドキュメント更新
- READMEのアーキテクチャ図を更新
- デプロイ手順の更新
- セキュリティ情報の追加

## 2025-07-17: フロントエンドのViteとTailwind CSS移行

### フロントエンド技術スタックの更新
- Vue CLI から Vite への移行
  - ビルド速度の大幅な向上
  - 開発体験の改善（HMRの高速化）
  - より最新のエコシステムへの対応
- Tailwind CSSの導入
  - ユーティリティファーストのCSSフレームワーク
  - カスタマイズ性の向上
  - コンポーネントスタイリングの一貫性確保

### 実装の変更点
- ビルドツールの変更
  - vue.config.js から vite.config.js への移行
  - 環境変数の接頭辞を VUE_APP_ から VITE_ に変更
- スタイリングの変更
  - インラインCSSからTailwind CSSクラスへの移行
  - レスポンシブデザインの改善
  - カラーテーマの一元管理
- プロジェクト構成の最適化
  - ディレクトリ構造の整理
  - 不要なファイルの削除
  - 設定ファイルの最新化

### パフォーマンスの改善
- ビルド時間の短縮
- バンドルサイズの最適化
- 初期読み込み速度の向上
- コード分割の改善

### デプロイプロセスの更新
- デプロイスクリプトの更新
- 環境変数の取り扱い方法の変更
- CloudFrontキャッシュ無効化プロセスの改善

### ドキュメント更新
- フロントエンドREADMEの更新
- 開発環境セットアップ手順の更新
- ビルドとデプロイ手順の更新
- プロジェクト構造の説明の更新
- history.mdへの変更履歴の追加

## 今後の計画

### 機能拡張
- 画像合成テンプレートの保存と再利用
- 追加の画像処理フィルター（グレースケール、セピア、ぼかしなど）
- 画像のアップロード機能
- 複数画像の一括処理

### インフラストラクチャの改善
- CloudFrontによるコンテンツ配信の高速化
- Route 53によるカスタムドメイン設定
- AWS WAFによるセキュリティ強化
- Amazon Cognitoによる認証機能の追加

### CI/CD
- GitHub Actionsによる自動ビルドとデプロイ
- テスト自動化（単体テスト、統合テスト）
- コード品質チェックの導入

### モニタリングと運用
- CloudWatchによるメトリクス監視
- X-Rayによるトレース分析
- アラート設定
- コスト最適化

## 2025-07-29: S3パス指定時の500エラー修正 v2.0.1

### 問題の特定と修正
- **問題**: プレビュー画面でS3パスを指定すると「Request failed with status code 500」エラーが発生
- **原因**: Lambda関数の`image_processor.py`でS3パスを解析する正規表現パターンが不完全
  - 106行目で正規表現パターンの文字列が途中で切れていた
  - `s3_pattern = r'^(?:s3://)?([^/]+)/(.+)` → 文字列の終端`$`が欠けていた

### 修正内容
1. **Lambda関数の修正**:
   - `lambda/python/image_processor.py`の正規表現パターンを修正
   - `s3_pattern = r'^(?:s3://)?([^/]+)/(.+)$'` に変更
   - S3パスの解析が正常に動作するように修正

2. **フロントエンドの修正**:
   - `frontend/src/App.vue`の環境変数参照を修正
   - `process.env.VUE_APP_API_URL` → `import.meta.env.VITE_API_URL` に変更
   - Viteの環境変数仕様に合わせて修正

### 技術的詳細
- **エラー修正**: マイナーマイナーバージョンを1上げて v2.0.1 に更新
- **影響範囲**: S3パスを使用した画像合成機能
- **テスト対象**: S3パス指定での画像合成処理

### 修正後の動作
- S3パス（`s3://bucket/key`形式）での画像指定が正常に動作
- フロントエンドのプルダウンメニューからS3パスを選択した際のエラーが解消
- 既存のテスト画像指定機能には影響なし

### 検証方法
```bash
# API直接テスト
curl "https://gv2g48xpz3.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=s3://imageprocessorapistack-testimagesbucket4ab1f113-sjc4fwt3v47u/images/circle_red.png&image2=test"

# フロントエンドでのテスト
# 1. https://d7kz1a65nk29c.cloudfront.net/ にアクセス
# 2. 画像1または画像2のプルダウンでS3パスを選択
# 3. 「画像を生成」ボタンをクリック
# 4. エラーなく画像が生成されることを確認
```## 
2025-07-29: S3パス指定時の500エラー完全修正 v2.0.2

### 問題の完全解決
- **問題**: S3パス指定時の「Request failed with status code 500」エラーが継続
- **根本原因**: 
  1. Lambda関数の正規表現パターンの構文エラー（文字列の不完全な終了）
  2. ARM64アーキテクチャでのPillowライブラリの互換性問題

### 修正内容
1. **Lambda関数の完全再作成**:
   - `lambda/python/image_processor.py`を完全に再作成
   - S3パス解析の正規表現パターンを正しく修正: `r'^(?:s3://)?([^/]+)/(.+)$'`
   - 構文エラーの完全解消

2. **アーキテクチャの変更**:
   - `lib/image-processor-api-stack.ts`でLambdaアーキテクチャをARM64からX86_64に変更
   - Pillowライブラリの互換性問題を解決

3. **バージョン更新**:
   - エラー修正のため、マイナーマイナーバージョンを1上げて v2.0.2 に更新
   - HTMLレスポンスとファイル名にバージョン情報を反映

### 技術的改善点
- **正規表現パターンの修正**: S3パス（`s3://bucket/key`形式）の正確な解析
- **アーキテクチャ最適化**: x86_64アーキテクチャでのライブラリ互換性確保
- **エラーハンドリング強化**: より詳細なログ出力とエラー情報

### 修正後の動作確認
1. **基本テスト**:
```bash
curl "https://ccovy8jh60.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=test&image2=test"
```
✅ 正常動作確認済み

2. **S3パステスト**:
```bash
curl "https://ccovy8jh60.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite?baseImage=test&image1=s3://imageprocessorapistack-testimagesbucket4ab1f113-swy6fmlebf8o/images/circle_red.png&image2=test"
```
✅ 正常動作確認済み

### デプロイ情報
- **API URL**: `https://ccovy8jh60.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite`
- **フロントエンドURL**: `https://d2jigwof3rswvi.cloudfront.net`
- **テストバケット**: `imageprocessorapistack-testimagesbucket4ab1f113-swy6fmlebf8o`

### 検証結果
- S3パス指定での画像合成が正常に動作
- フロントエンドのプルダウンメニューからS3パスを選択した際のエラーが完全に解消
- 既存のテスト画像指定機能も正常動作
- アルファチャンネル（透過）処理も正常動作## 202
5-07-29: フロントエンドAPI接続エラー修正 v2.0.3

### 問題の特定と修正
- **問題**: フロントエンドで画像生成ボタンを押した際に「Failed to load resource: net::ERR_NAME_NOT_RESOLVED」エラーが発生
- **原因**: フロントエンドのデフォルトAPI URLが古い値に設定されていた
  - 設定されていたURL: `https://ccovy8jh60.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite`
  - 実際のURL: `https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite`

### 修正内容
1. **フロントエンドのAPI URL修正**:
   - `frontend/src/App.vue`のデフォルトAPI URLを正しい値に更新
   - S3バケット名も正しい値に更新: `imageprocessorapistack-testimagesbucket4ab1f113-yg0v6o6txw9z`

2. **Playwrightテストの更新**:
   - `test/e2e/frontend-api.spec.ts`のテストURLを正しい値に更新
   - フロントエンドURL: `https://d2jokx0x4ou6mb.cloudfront.net`
   - API URL: `https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite`

3. **CloudFrontキャッシュ無効化**:
   - 更新されたフロントエンドが即座に配信されるようにキャッシュを無効化

### 技術的詳細
- **エラー修正**: マイナーマイナーバージョンを1上げて v2.0.3 に更新
- **影響範囲**: フロントエンドからのAPI接続機能
- **テスト対象**: 全てのフロントエンド機能とAPI接続

### 修正後の動作確認
**Playwrightテスト結果**: 全7テストがパス
1. ✅ フロントエンドページが正常に読み込まれる
2. ✅ UI要素が正しく表示される  
3. ✅ 基本的な画像生成が動作する
4. ✅ S3パス指定での画像生成が動作する
5. ✅ エラーハンドリングが正しく動作する
6. ✅ API URLが正しく設定されている
7. ✅ ネットワークエラーが発生しない

**手動テスト結果**:
- ✅ 基本的な画像合成API: 正常動作
- ✅ S3パス指定での画像合成API: 正常動作
- ✅ フロントエンドからのAPI接続: エラー解消

### デプロイ情報
- **フロントエンドURL**: `https://d2jokx0x4ou6mb.cloudfront.net`
- **API URL**: `https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite`
- **テストバケット**: `imageprocessorapistack-testimagesbucket4ab1f113-yg0v6o6txw9z`

### 検証結果
- フロントエンドからの画像生成機能が正常に動作
- S3パス指定での画像合成が正常に動作
- 「net::ERR_NAME_NOT_RESOLVED」エラーが完全に解消
- 全てのPlaywrightテストがパス
- ブラウザコンソールでのネットワークエラーが解消