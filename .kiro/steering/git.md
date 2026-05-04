---
inclusion: auto
---

# Gitルール

## ブランチ戦略

### メインブランチ
- `main` - 本番環境（production）対応コード。安定稼働バージョンのみ
- `dev` - 統合ブランチ。staging環境へデプロイして統合テストを実施

### ブランチとデプロイ環境の対応

| ブランチ | デプロイ先 | 用途 |
|---------|----------|------|
| `feature/*`, `bugfix/*` | dev環境 | 開発中の機能・修正のe2eテスト確認 |
| `dev` | staging環境 | 統合テスト（feature→devマージ後） |
| `main` | production環境 | 安定リリース（dev→mainマージ後） |

各環境のスタック名サフィックス・設定差異は [architecture.md](architecture.md) の「環境戦略」を参照。

### 機能ブランチ
- 形式: `feature/短い説明` または `feature/issue番号-説明`
- 例: `feature/video-generation`、`feature/123-s3-upload`
- 分岐元: `dev`
- マージ先: `dev`（プルリクエスト経由）
- dev環境にデプロイしてe2eテスト確認後にマージ

### バグ修正ブランチ
- 形式: `bugfix/短い説明` または `bugfix/issue番号-説明`
- 例: `bugfix/image-upload-error`、`bugfix/456-cors-issue`
- 分岐元: `dev`
- マージ先: `dev`（プルリクエスト経由）

### ホットフィックスブランチ
- 形式: `hotfix/バージョン-説明`
- 例: `hotfix/3.1.2-lambda-timeout`
- 分岐元: `main`
- マージ先: `main` と `dev` の両方

## Git Worktree

複数のIssueを並行して作業する場合や、現在の作業ブランチを汚さずに別タスクに着手する場合はgit worktreeを使う。

### ディレクトリ

- 配置先: `.worktrees/<ブランチ名>/`（プロジェクトルート直下、`.gitignore`で除外済み）
- グローバル配置は使わない（プロジェクトローカルに統一）

### 作成手順

```bash
# worktreeを作成して新ブランチを切る
git worktree add .worktrees/<ブランチ名> -b <ブランチ名>

# 例: issue38対応
git worktree add .worktrees/feature-issue38-spec -b feature/issue38-spec
```

### ブランチ命名

worktree用ブランチも通常ブランチと同じ命名規則に従う。

| 種別 | 形式 | 例 |
|------|------|-----|
| 機能 | `feature/issue番号-説明` | `feature/issue38-spec-base-opacity` |
| バグ修正 | `bugfix/issue番号-説明` | `bugfix/issue42-opacity-validation` |

### セットアップ

worktree作成後は依存関係を確認して作業開始する。

```bash
cd .worktrees/<ブランチ名>

# Node.js依存関係（package.jsonがある場合）
npm install

# Python依存関係（requirements.txtがある場合）
pip install -r lambda/python/requirements.txt
```

### 削除

作業完了・PRマージ後はworktreeを削除する。

```bash
# worktreeを削除
git worktree remove .worktrees/<ブランチ名>

# リモートにプッシュ済みのブランチを削除
git branch -d <ブランチ名>
```

### .gitignore

`.worktrees/`は`.gitignore`に追加されており、worktree内の変更が誤ってコミットされる心配はない。

```
# Git worktrees
.worktrees/
```

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

### レビュー基準（レビュアー観点）

- [ ] コードが規約に従っている（[conventions.md](conventions.md)）
- [ ] テストが包括的（ユニット + API + E2E）
- [ ] セキュリティ問題なし（IAM最小権限、入力バリデーション）
- [ ] パフォーマンスが許容範囲
- [ ] ドキュメントが完全（仕様書・steeringの該当ファイル）
- [ ] CDK変更がレビュー済み
- [ ] 不要なコード・デバッグコードがない
- [ ] 不要な依存関係がない

### レビュープロセス

1. 自動チェックが通過（CI/CD）
2. 作成者による自己レビュー
3. ピアレビュー（1名以上の承認）
4. フィードバックに対応 → 修正→再テスト→再レビューのサイクル
5. 最終承認
6. マージ（指示があるまで作業者はマージしない）

## ドキュメント更新チェックリスト（機能追加・変更時）

新機能・バグ修正・インフラ変更を行う際、変更の種別ごとに更新すべきドキュメントを以下に示す。PR作成前にこのチェックリストで漏れを確認する（PRテンプレートにも同等の確認項目あり）。

### 変更種別ごとの更新先

| 変更種別 | 更新すべきファイル | 補足 |
|---------|----------------|------|
| **新APIパラメータ追加**（例: `baseOpacity`） | `specs/<feature>/requirements.md` (Req or AC追加) + `specs/<feature>/design.md` (パラメータ表) + `steering/architecture.md` (エンドポイント表) | バリデーション・デフォルト値・後方互換性も明記 |
| **新Lambdaエンドポイント追加**（例: `/chat/models`） | `steering/architecture.md` (エンドポイント表) + `specs/<feature>/requirements.md` (Req追加) + `specs/<feature>/design.md` (API設計セクション) | リクエスト/レスポンス形式・エラー応答も記載 |
| **新環境変数追加**（例: `BEDROCK_REGION`） | `steering/tech.md` (環境変数一覧) + `specs/<feature>/design.md` (該当Lambda の環境変数表) | デフォルト値・用途・スコープを明記 |
| **新Lambda関数追加** | `steering/architecture.md` (Lambda設計) + `steering/structure.md` (依存関係図) + `specs/<feature>/design.md` | メモリ・タイムアウト・アーキテクチャ（X86_64/ARM_64） |
| **デプロイ手順変更** | `steering/workflow.md` + `CLAUDE.md`（デプロイセクション） | scripts/deploy.sh 変更時はコメント・Usage も更新 |
| **新テストコマンド追加** | `steering/testing.md` + `package.json` (scripts) | コマンド名・用途・引数を明記 |
| **新依存パッケージ追加** | `steering/tech.md` (バックエンド/フロントエンド/AIエージェントの該当節) | バージョン制約も記載 |
| **CI/CDワークフロー変更** | `steering/testing.md` (GitHub Actions節) + `steering/workflow.md` (CI/CDパイプライン節) | トリガー・実行内容を反映 |
| **バージョン更新（リリース時）** | `package.json` (version) + `steering/product.md` (バージョンセクション) | 他ファイルにバージョン記載は禁止（プレースホルダ化済み） |
| **モジュール間依存変更** | `steering/structure.md` (Lambda モジュール間の依存関係 図) | import 構造の変更時 |

### 検証方法

- [ ] 変更したコードファイルに対応する仕様書（`requirements.md`/`design.md`）の該当セクションが更新されているか
- [ ] 変更が `steering/` のいずれかのルールに該当する場合、そのファイルが更新されているか
- [ ] 仕様書に記載のAcceptance Criteriaが実装と一致しているか（Phase 1 整合性検証参照）
- [ ] `tasks.md` の該当タスクのチェックボックスが `[x]` になっているか（仕様駆動開発ルール3）

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
- 現在のバージョンは [product.md](product.md) を参照

### タグ作成
```bash
# アノテーション付きタグ（VERSIONは package.json と一致させる）
git tag -a v<VERSION> -m "Release v<VERSION>: <主な変更>"

# タグをプッシュ
git push origin v<VERSION>

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
- `dev`ブランチへの直接プッシュを禁止
- PRレビュー必須（1名以上）
- ステータスチェック必須（CI/CD）

### 開発フロー
```
feature/* ──PR──▶ dev ──PR──▶ main
    │               │              │
    ▼               ▼              ▼
  dev環境       staging環境   production環境
  (e2eテスト)  (統合テスト)    (安定リリース)
```

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
