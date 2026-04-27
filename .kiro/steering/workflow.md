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

```bash
source .env.local

# 4-1. バックエンドデプロイ
npm run build
npx cdk deploy ImageProcessorApiStack --require-approval never

# 4-2. API e2eテスト（バックエンド単体の動作確認）
export API_URL=$(aws cloudformation describe-stacks --stack-name ImageProcessorApiStack \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
npm run test:api

# 4-3. フロントエンドビルド + デプロイ
cd frontend && npm run build && cd ..
npx cdk deploy FrontendStack --require-approval never

# 4-4. フロントエンドE2Eテスト
export FRONTEND_URL=$(aws cloudformation describe-stacks --stack-name FrontendStack \
  --query "Stacks[0].Outputs[?OutputKey=='FrontendUrl'].OutputValue" --output text)
npm run test:all-e2e
```

### 環境別デプロイ

| 環境 | ブランチ | トリガー | 目的 |
|------|---------|---------|------|
| dev | feature/*, bugfix/* | 手動 | 開発中機能のe2eテスト確認 |
| staging | dev | CI/CD自動（devへのマージ時） | 統合テスト |
| production | main | CI/CD自動（mainへのマージ時） | 安定リリース |

## 機能開発ワークフロー

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
# ローカルテスト
npm run build
npm run test:lambda
npm run synth

# dev環境にデプロイしてE2Eテスト
ENVIRONMENT=dev ./scripts/deploy.sh
CHAT_API_URL=... npx playwright test test/e2e/chat-agent.api.spec.ts --config=test/playwright-api.config.ts
FRONTEND_URL=... npx playwright test test/e2e/chat-agent.spec.ts --config=test/playwright-chat.config.ts
```

### ステップ5: コードレビュー
テストPASS後、実装内容をコードレビューする。レビュー観点:
- コードが規約に従っている
- テストが包括的（ユニット + API + E2E）
- セキュリティ問題なし（IAM最小権限、入力バリデーション）
- 不要なコード・デバッグコードがない
- CDK変更がある場合は特に注意してレビュー

レビューで修正が必要な場合は修正→再テスト→再レビューのサイクルを回す。

### ステップ6: コミット + Issue コメント
- テストPASS後にコミット（機能単位で適宜コミット）
- 該当Issueにコメントとしてコミットハッシュと対応内容を追加
- コミットハッシュは7桁短縮形、バッククォートなし（GitHubリンク生成のため）

### ステップ7: プルリクエスト（→ dev）
- ブランチをプッシュ
- テンプレートを使用してPRを作成（ベースブランチ: `dev`）
- レビューを依頼
- フィードバックに対応
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
npm run deploy
npm run test:api
```

### ステップ4: デプロイ
- PRを作成
- レビューを迅速化
- 即座にデプロイ
- 本番環境で修正を確認

## デプロイワークフロー

### 環境戦略

単一AWSアカウント内で3環境を運用。CloudFormationスタック名にサフィックスを付けて分離。

| 環境 | スタック名サフィックス | 用途 | デプロイトリガー |
|------|---------------------|------|---------------|
| dev | `-Dev` | 作業ブランチのe2eテスト確認 | 手動（開発者がローカルから） |
| staging | `-Staging` | devブランチの統合テスト | CI/CD（devへのマージ時に自動） |
| production | (なし) | 安定リリース。ユーザー利用環境 | CI/CD（mainへのマージ時に自動） |

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
- **staging**: devブランチへのマージ時にGitHub Actionsが自動デプロイ + e2eテスト
- **production**: mainブランチへのマージ時にGitHub Actionsが自動デプロイ
- ワークフロー定義: `.github/workflows/ci.yml`, `.github/workflows/deploy.yml`

### デプロイ後
- スモークテストを実行
- CloudWatchアラームを監視
- エラー率を確認
- 機能を検証

### ロールバック手順
```bash
# オプション1: コミットをリバートして再デプロイ
git revert <commit-hash>
npm run deploy

# オプション2: CloudFormationロールバック
aws cloudformation rollback-stack --stack-name ImageProcessorApiStack

# オプション3: 以前のバージョン
git checkout <previous-tag>
npm run deploy
```

## リリースワークフロー

### バージョン番号
- MAJOR: 破壊的変更
- MINOR: 新機能（後方互換性あり）
- PATCH: バグ修正

### リリース手順
1. `package.json`のバージョンを更新
2. CHANGELOGを更新
3. リリースブランチを作成
4. 最終テスト
5. mainにマージ
6. リリースにタグ付け: `git tag -a v3.2.0 -m "Release v3.2.0"`
7. タグをプッシュ: `git push origin v3.2.0`
8. 本番環境にデプロイ
9. リリースノート付きでGitHubリリースを作成

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

### インシデント対応
1. 検出: CloudWatchアラーム
2. 評価: ログとメトリクスを確認
3. 緩和: ロールバックまたはホットフィックス
4. 解決: 修正をデプロイ
5. 文書化: ポストモーテム

## コードレビューワークフロー

### レビュアーチェックリスト
- [ ] コードが規約に従っている
- [ ] テストが包括的
- [ ] セキュリティ問題なし
- [ ] パフォーマンスが許容範囲
- [ ] ドキュメントが完全
- [ ] CDK変更がレビュー済み
- [ ] 不要な依存関係なし

### レビュープロセス
1. 自動チェックが通過
2. 作成者による自己レビュー
3. ピアレビュー（1名以上の承認）
4. フィードバックに対応
5. 最終承認
6. マージ

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
