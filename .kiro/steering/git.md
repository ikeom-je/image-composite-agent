---
inclusion: auto
---

# Gitルール

## ブランチ戦略

### メインブランチ
- `main` - 本番環境対応コードのみ
- `develop` - 機能の統合ブランチ（GitFlowを使用する場合）

### 機能ブランチ
- 形式: `feature/短い説明` または `feature/issue番号-説明`
- 例: `feature/video-generation`、`feature/123-s3-upload`
- 分岐元: `main` または `develop`
- マージ先: `main` または `develop`（プルリクエスト経由）

### バグ修正ブランチ
- 形式: `bugfix/短い説明` または `bugfix/issue番号-説明`
- 例: `bugfix/image-upload-error`、`bugfix/456-cors-issue`
- 分岐元: `main` または `develop`
- マージ先: `main` または `develop`（プルリクエスト経由）

### ホットフィックスブランチ
- 形式: `hotfix/バージョン-説明`
- 例: `hotfix/3.1.2-lambda-timeout`
- 分岐元: `main`
- マージ先: `main` と `develop` の両方

## コミットメッセージ

### 形式
```
<type>(<scope>): <subject>

<body>

<footer>
```

### タイプ
- `feat` - 新機能
- `fix` - バグ修正
- `docs` - ドキュメント変更
- `style` - コードスタイル変更（フォーマット、ロジック変更なし）
- `refactor` - コードリファクタリング（機能変更なし）
- `perf` - パフォーマンス改善
- `test` - テストの追加または更新
- `chore` - ビルドプロセス、依存関係、ツール
- `ci` - CI/CD設定変更

### スコープ（オプション）
- `lambda` - Lambda関数の変更
- `frontend` - フロントエンドの変更
- `cdk` - インフラストラクチャの変更
- `api` - API Gatewayの変更
- `s3` - S3バケットの変更
- `video` - 動画生成機能
- `upload` - アップロード機能

### 例
```
feat(video): MP4動画生成サポートを追加

ffmpegを使用した合成画像からの動画生成を実装。
MP4、WEBM、AVI形式をサポート。

Closes #123

---

fix(lambda): 大きな画像のタイムアウト問題を解決

動画生成のためLambdaタイムアウトを30秒から90秒に増加。
画像処理パイプラインを最適化。

---

docs(readme): デプロイ手順を更新

動画生成機能のドキュメントを追加。
環境変数セクションを更新。

---

test(e2e): 動画生成テストスイートを追加

動画生成API用の包括的なテストを追加。
形式検証とエラーハンドリングテストを含む。
```


## プルリクエストガイドライン

### PRタイトル
- コミットメッセージ形式に従う: `<type>(<scope>): <subject>`
- 例: `feat(video): 動画生成機能を追加`

### PR説明
```markdown
## 概要
この変更の目的を簡潔に説明

## 変更内容
- 変更点1
- 変更点2

## テスト
- [ ] ユニットテストが通過
- [ ] APIテストが通過
- [ ] E2Eテストが通過
- [ ] 手動テスト完了

## スクリーンショット（該当する場合）
[画像を追加]

## 関連Issue
Closes #123
```

### レビュー基準
- コードが規約に従っている
- テストが包括的
- セキュリティ問題がない
- パフォーマンスが許容範囲
- ドキュメントが完全
- CDK変更がレビュー済み

## Issue・PRでのコミットハッシュ参照ルール

### 基本ルール
GitHubのIssueコメントやPR本文でコミットを参照する際、GitHubが自動リンクを生成するために以下を守る。

- **7桁の短縮ハッシュを使用**（基本）
- ハッシュが被る場合のみフルSHA（40桁）を使用
- **バッククォート（`` ` ``）でハッシュを囲まない**（インラインコード扱いになりリンクが無効になる）

### 記述例
```markdown
### コミット
- 3c0d5a6 feat(api): サムネイルURL追加
- 7c817ce feat(front): グリッド表示追加
```

### 禁止事項
- `` `3c0d5a6` `` のようにバッククォートで囲まない
- `` `3c0d5a6f2b7eefecd72baf70962a8b809c0b4c52` `` も同様にNG

## コミットプラクティス

### 頻度
- 小さく頻繁にコミット
- 論理的な単位でコミット
- 作業終了時にコミット

### コミット前チェック
```bash
# ビルド確認
npm run build

# テスト実行
npm run test:lambda

# CDK合成確認
npm run synth

# リント確認
npm run lint
```

### コミット内容
- 1つのコミットで1つの変更
- 無関係な変更を混在させない
- デバッグコードを含めない
- コメントアウトされたコードを削除

## ファイル除外（.gitignore）

### 必須除外
```
# 依存関係
node_modules/
.venv/

# ビルド成果物
cdk.out/
frontend/dist/
*.pyc
__pycache__/

# 環境変数
.env
.env.local

# IDE設定
.vscode/
.idea/

# テスト結果
test-results/
playwright-report/
coverage/

# ログ
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db
```

## バージョンタグ付け

### タグ形式
- セマンティックバージョニング: `v{MAJOR}.{MINOR}.{PATCH}`
- 例: `v3.1.1`

### タグ作成
```bash
# アノテーション付きタグ
git tag -a v3.1.1 -m "Release v3.1.1: マルチモデル対応"

# タグをプッシュ
git push origin v3.1.1

# すべてのタグをプッシュ
git push origin --tags
```

### タグ命名規則
- `v{version}` - 本番リリース
- `v{version}-rc.{n}` - リリース候補
- `v{version}-beta.{n}` - ベータ版

## マージ戦略

### 推奨: Squash and Merge
- 機能ブランチの複数コミットを1つに統合
- クリーンな履歴を維持
- PRごとに1コミット

### 使用場面
- **Squash and Merge**: 機能ブランチ（推奨）
- **Merge Commit**: リリースブランチ
- **Rebase and Merge**: ホットフィックス

## プリコミットチェック

### 手動チェック
```bash
# すべてのチェックを実行
npm run build && npm run test:lambda && npm run synth
```

### 自動化（オプション）
```bash
# Huskyをインストール（必要に応じて）
npm install --save-dev husky

# プリコミットフックを設定
npx husky add .husky/pre-commit "npm run build && npm run test:lambda"
```

## コラボレーション

### ブランチ保護
- `main`ブランチへの直接プッシュを禁止
- PRレビュー必須（1名以上）
- ステータスチェック必須（CI/CD）

### コンフリクト解決
```bash
# 最新のmainを取得
git checkout main
git pull origin main

# 機能ブランチにマージ
git checkout feature/my-feature
git merge main

# コンフリクトを解決
# ファイルを編集してコンフリクトマーカーを削除

# 解決をコミット
git add .
git commit -m "fix: mainとのコンフリクトを解決"
```

## 緊急手順

### ホットフィックス
```bash
# mainから分岐
git checkout main
git pull origin main
git checkout -b hotfix/2.7.1-critical-bug

# 修正を実装
# テスト

# コミットとプッシュ
git add .
git commit -m "fix: 重大なバグを修正"
git push origin hotfix/2.7.1-critical-bug

# PRを作成（レビューを迅速化）
# mainとdevelopの両方にマージ
```

### リバート
```bash
# 特定のコミットをリバート
git revert <commit-hash>
git push origin main

# マージをリバート
git revert -m 1 <merge-commit-hash>
git push origin main
```

### 強制プッシュ（注意）
```bash
# 機能ブランチのみで使用（mainでは絶対に使用しない）
git push --force-with-lease origin feature/my-feature
```
