---
inclusion: auto
---

# ワークフロールール

## 開発ワークフロー

### 1. セットアップ
```bash
git clone <repository>
cd image-processor-api
npm install
cd frontend && npm install && cd ..
```

### 2. ローカル開発
```bash
# ターミナル1: TypeScriptビルド
npm run watch

# ターミナル2: フロントエンド開発サーバー
cd frontend && npm run dev

# ターミナル3: CDK操作
npm run synth  # 変更を確認
npm run diff   # 差分をチェック
```

### 3. ローカルテスト
```bash
# ユニットテストを実行
npm run test:lambda

# ビルドと合成
npm run build
npm run synth
```

### 4. dev環境へのデプロイ + e2eテスト（段階的検証）

バックエンド→APIテスト→フロントエンド→E2Eテストの順に段階的に検証する。

具体的なコマンドは [testing.md](testing.md) の「デプロイ後の検証フロー」を参照。

### 環境別デプロイ

3環境（dev / staging / production）の構成・スタック名・設定差異は [architecture.md](architecture.md) の「環境戦略」を参照。

## 機能開発ワークフロー

### ステップ0: 着手前チェック（必須・全エージェント共通）

> 複数のAIエージェント・開発者が並行作業する前提のため、各タスク開始前に下記を必ず確認する。省略すると仕様・規約・運用方針のドリフトが発生する。

1. **`CLAUDE.md` を冒頭から再参照** — 「作業開始前のチェック」「仕様駆動開発ルール」「変更時の更新トリガー」を確認
2. **仕様書を確認** — `.kiro/specs/<feature>/{requirements.md, design.md, tasks.md}` の該当部分
3. **タスクに該当する steering ファイルを確認**（[CLAUDE.md の対応表](../../CLAUDE.md#作業開始前のチェック必読全エージェント共通) 参照）
4. **親Issue / 関連Issue / 進行中PRの状態確認** — `gh issue view <N>` / `gh pr list`
5. **並行作業の場合は git worktree を作成** — [git.md の「Git Worktree」](git.md#git-worktree) 参照

### ステップ1: 計画
- GitHubイシューを作成
- 要件を定義
- ソリューションを設計
- 工数を見積もり

### ステップ2: ブランチ作成
```bash
git checkout -b feature/feature-name
```

### ステップ3: 実装
- 規約に従ってコードを記述
- ユニットテストを追加
- ドキュメントを更新

### ステップ4: テスト（ローカル + dev環境 E2E）

```bash
# ローカルビルド・テスト
npm run build
npm run test:lambda
npm run synth

# dev環境デプロイ
ENVIRONMENT=dev ./scripts/deploy.sh
```

dev環境デプロイ後のe2eテスト手順は [testing.md](testing.md) の「デプロイ後の検証フロー」を参照。

### ステップ5: コードレビュー

テストPASS後、実装内容をコードレビューする。レビュー観点・プロセスの詳細は [git.md](git.md) の「プルリクエストガイドライン」を参照。

### ステップ6: コミット + Issue コメント
- テストPASS後にコミット（機能単位で適宜コミット）
- 該当Issueにコメントとしてコミットハッシュと対応内容を追加
- コミットハッシュは7桁短縮形、バッククォートなし（GitHubリンク生成のため）

### ステップ7: プルリクエスト（→ dev）
- ブランチをプッシュ
- PRを作成（ベースブランチ: `dev`）。タイトル・説明テンプレートは [git.md](git.md) の「プルリクエストガイドライン」参照
- レビュー → フィードバック対応
- **devブランチへのマージは指示があるまで行わない**

### ステップ8: devへマージ → staging環境で統合テスト
- 指示を受けてからdevにマージ
- CI/CDがstaging環境に自動デプロイ
- staging環境でe2e統合テスト実施
- CloudWatchを監視

### ステップ9: mainへマージ → productionリリース
- staging環境での統合テスト合格後
- devからmainへPRを作成
- CI/CDがproduction環境に自動デプロイ
- リリースにタグ付け（`v{MAJOR}.{MINOR}.{PATCH}`）

## バグ修正ワークフロー

### ステップ1: 再現
- バグの存在を確認
- CloudWatchログをチェック
- 根本原因を特定
- テストケースを作成

### ステップ2: 修正
```bash
git checkout -b bugfix/bug-description
# 最小限の修正を実施
# リグレッションテストを追加
```

### ステップ3: 検証

```bash
npm run test:lambda
ENVIRONMENT=dev ./scripts/deploy.sh
```

APIテスト・E2Eテストの詳細コマンドは [testing.md](testing.md) を参照。

### ステップ4: デプロイ
- PRを作成
- レビューを迅速化
- 即座にデプロイ
- 本番環境で修正を確認

## デプロイワークフロー

環境戦略（3環境の構成・スタック名・設定差異）は [architecture.md](architecture.md) の「環境戦略」を参照。

### デプロイ前チェックリスト
- [ ] すべてのテストが通過
- [ ] CDK合成が成功
- [ ] TypeScriptエラーなし
- [ ] ドキュメントが更新済み
- [ ] バージョンが更新済み（リリースの場合）
- [ ] 破壊的変更が文書化済み

### デプロイ手順（手動 / dev環境）
```bash
# 1. ビルド
npm run build

# 2. 合成とレビュー
npm run synth
npm run diff

# 3. dev環境にデプロイ
ENVIRONMENT=dev ./scripts/deploy.sh

# 4. 検証（e2eテスト）
npm run test:api
npm run test:all-e2e
```

### CI/CDパイプライン（staging / production）

`.github/workflows/deploy.yml` が **`push` イベントで自動発火** する。手動 `gh workflow run` は通常不要。

| ブランチ push | 環境 | スタックサフィックス | e2e-test |
|--------------|------|------------------|----------|
| `dev` | staging | `-Staging` | api スイート自動実行 |
| `main` | production | （なし） | api スイート自動実行 |

**自動実行ジョブ順序**（deploy.yml）:
1. `resolve-env` - ブランチ名から環境名/スタックサフィックスを決定
2. `ci-check` - `ci.yml` を呼び出し（ユニット・型・lint）
3. `deploy-backend` - `ImageProcessorApiStack[suffix]` を `cdk deploy`
4. `deploy-frontend` - `config.json` 生成 → frontend ビルド → `FrontendStack[suffix]` を `cdk deploy` → Lambda の `CLOUDFRONT_DOMAIN` 環境変数を更新
5. `e2e-test` - `e2e-test.yml` を `test_suite: api` で呼び出し

> 手動オーバーライド: `workflow_dispatch` で環境（staging/production）と対象（all/backend/frontend）を選択して再デプロイ可能。緊急修正後の差分デプロイ等で利用。

ワークフロー定義: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`, `.github/workflows/e2e-test.yml`

### デプロイ後の確認

CI/CD で自動デプロイされた直後、以下を順に確認する:

1. **GitHub Actions の成否確認**
   ```bash
   gh run list --workflow deploy.yml --limit 3
   gh run view <run-id> --log-failed  # 失敗時のみ
   ```
2. **CloudFormation スタック状態**
   ```bash
   # production
   aws cloudformation describe-stacks --stack-name ImageProcessorApiStack \
     --query "Stacks[0].StackStatus" --output text
   aws cloudformation describe-stacks --stack-name FrontendStack \
     --query "Stacks[0].StackStatus" --output text
   # 期待値: UPDATE_COMPLETE / CREATE_COMPLETE
   ```
3. **スモークテスト（API 1リクエスト）**
   ```bash
   API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack \
     --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
   curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
     "${API_URL}images/composite?image1=test&image2=transparent&format=png"
   # 期待値: HTTP 200
   ```
4. **フロントエンド表示確認**
   - CloudFront URL を開いて画面表示 / ヘッダーのバージョン表記を確認
   - `config.json` の `version` / `buildHash` が新しいことを確認
5. **CloudFront キャッシュ無効化**（必要な場合のみ）
   - `index.html` 等の即時反映が必要なら手動 invalidation を実行
   - 通常は CloudFront のオリジン更新で `config.json` は短 TTL のため自動的に更新される
6. **CloudWatch Logs / アラームの監視**
   - デプロイ後 5〜10 分は Lambda のエラー率・レイテンシをチェック
   - 該当ロググループ: `/aws/lambda/ImageProcessor*`, `/aws/lambda/AgentFunction*`

### ロールバック手順

production で問題が発生した場合は、**`git revert` ベースの再デプロイ**を第一選択とする（履歴が残るため）。

```bash
# オプション1（推奨）: コミット/PR をリバートして main に push → 自動再デプロイ
git checkout main
git pull github main
git revert <commit-hash>          # マージコミットなら -m 1 を付与
git push github main              # → deploy.yml が自動発火し production に再デプロイ

# オプション2: 以前のリリースタグから手動デプロイ（CI/CD が壊れている等の緊急時）
git checkout <previous-tag>      # 例: v3.1.1
ENVIRONMENT=production ./scripts/deploy.sh

# オプション3: CloudFormation ネイティブロールバック（直前デプロイの取消のみ）
aws cloudformation rollback-stack --stack-name ImageProcessorApiStack          # production
aws cloudformation rollback-stack --stack-name ImageProcessorApiStack-Staging
aws cloudformation rollback-stack --stack-name ImageProcessorApiStack-Dev
```

> 注: production / staging は通常CI/CD自動デプロイ。オプション2/3は緊急時のみ。リバート後は必ず再度デプロイ後の確認手順を実行する。

## リリースワークフロー

### バージョン番号
- MAJOR: 破壊的変更
- MINOR: 新機能（後方互換性あり）
- PATCH: バグ修正

### リリースブランチ命名規則

- 形式: `release/v<MAJOR>.<MINOR>.<PATCH>`
- 例: `release/v3.2.0`, `release/v3.2.1`
- 分岐元: `dev`（staging で検証済みの状態）
- マージ先: `main`（プルリクエスト経由・**Merge Commit**、squash しない）

### リリース手順

1. **dev で staging 検証完了を確認**
   - PR #62 等の staging e2e テスト合格、CloudWatch にエラーなし
2. **バージョン更新 PR を作成**（任意・dev 上で完結する場合は省略可）
   - `package.json` の `version` を更新
   - `steering/product.md` の「バージョン」セクションを更新
   - 他ファイルへのバージョン直書きは禁止（プレースホルダ化済み）
3. **release PR を作成**: `dev` → `main`
   ```bash
   git checkout dev && git pull github dev
   git checkout -b release/v<VERSION>
   git push -u github release/v<VERSION>
   gh pr create --base main --head release/v<VERSION> \
     --title "release(v<VERSION>): <概要>" \
     --body "<release note 形式の本文>"
   ```
   - PR タイトル: `release(v<VERSION>): <概要>` 例: `release(v3.2.0): テキストオーバーレイ機能を本番リリース`
   - PR 本文: 主要変更の箇条書き + 関連 PR 番号 + 検証状況
4. **PR レビュー・マージ**: Merge Commit でマージ（squash しない）
   - main push → `deploy.yml` が自動で production デプロイ + e2e-test 実行
5. **「デプロイ後の確認」を実行**（前節参照）
6. **リリースタグ作成 + push**
   ```bash
   git checkout main && git pull github main
   git tag -a v<VERSION> -m "Release v<VERSION>"
   git push github v<VERSION>
   ```
7. **GitHub Release 作成**
   ```bash
   gh release create v<VERSION> --title "v<VERSION>" --notes "<release note>"
   ```
8. **dev に main を取り込む**（リリース PR が main に merge commit を作る場合、dev に back-merge して履歴を整合させる）
   ```bash
   git checkout dev && git pull github dev
   git merge github/main          # back-merge
   git push github dev
   ```

## 監視ワークフロー

### 日次チェック
- CloudWatchダッシュボード
- エラー率
- Lambda実行時間
- APIレイテンシ
- コストエクスプローラー

### 週次レビュー
- テストカバレッジ
- パフォーマンスメトリクス
- ユーザーフィードバック
- 技術的負債

### Lambda コールドスタート計測（パフォーマンス調査）

新しい依存（フォント・大きなライブラリ等）を Lambda に同梱する際は、**コールドスタートへの影響**を CloudWatch Insights で計測する。

```bash
# Lambda 関数名を取得（例: production の ImageProcessor）
FUNC_NAME=$(aws cloudformation list-stack-resources --stack-name ImageProcessorApiStack \
  --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function' && contains(LogicalResourceId, 'ImageProcessor')].PhysicalResourceId" \
  --output text)

# 直近 1 時間の Init Duration / Duration を集計
aws logs start-query \
  --log-group-name "/aws/lambda/${FUNC_NAME}" \
  --start-time $(($(date +%s) - 3600)) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @initDuration, @duration | filter @type = "REPORT" | stats avg(@initDuration), max(@initDuration), avg(@duration), count() by bin(5m)'
```

- `@initDuration` が記録されるのはコールドスタートのみ（ウォーム時は欠損）
- 機能 ON/OFF による比較は、リクエストパラメータでフィルタした 2 クエリを並べて差分を見る
- 影響が **>500ms 増加** なら最適化検討（Lambda Layer 化、サブセット化、provisioned concurrency 等）

### インシデント対応
1. 検出: CloudWatchアラーム
2. 評価: ログとメトリクスを確認
3. 緩和: ロールバックまたはホットフィックス
4. 解決: 修正をデプロイ
5. 文書化: ポストモーテム

## コードレビューワークフロー

レビュアーチェックリスト・レビュープロセスは [git.md](git.md) の「プルリクエストガイドライン > レビュー基準」を参照。

## メンテナンスワークフロー

### 週次タスク
- 依存関係を更新
- CloudWatchログをレビュー
- セキュリティアドバイザリを確認
- 古いブランチをクリーンアップ

### 月次タスク
- ドキュメントをレビューして更新
- コストトレンドを分析
- パフォーマンス最適化レビュー
- バックアップ検証

### 四半期タスク
- 主要な依存関係の更新
- アーキテクチャレビュー
- セキュリティ監査
- ディザスタリカバリテスト
