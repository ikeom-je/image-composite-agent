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

### 4. AWSへのデプロイ
```bash
# 初回のみ
cdk bootstrap

# デプロイ
npm run deploy

# 環境をセットアップ
npm run setup-env

# テスト画像をアップロード
cd scripts && ./upload-test-images.sh auto
```

### 5. 統合テストの実行
```bash
# デプロイ後
npm run test:api
npm run test:all-e2e
```

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

### ステップ4: テスト（ローカル + AWS E2E）
```bash
# ローカルテスト
npm run build
npm run test:lambda
npm run synth

# デプロイ + E2Eテスト
./scripts/deploy.sh
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

### ステップ7: プルリクエスト
- ブランチをプッシュ
- テンプレートを使用してPRを作成
- レビューを依頼
- フィードバックに対応
- **devブランチへのマージは指示があるまで行わない**

### ステップ8: マージとデプロイ
- 指示を受けてからdevにマージ
- リリースにタグ付け
- 本番環境にデプロイ
- CloudWatchを監視

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

### デプロイ前チェックリスト
- [ ] すべてのテストが通過
- [ ] CDK合成が成功
- [ ] TypeScriptエラーなし
- [ ] ドキュメントが更新済み
- [ ] バージョンが更新済み（リリースの場合）
- [ ] 破壊的変更が文書化済み

### デプロイ手順
```bash
# 1. ビルド
npm run build

# 2. 合成とレビュー
npm run synth
npm run diff

# 3. デプロイ
npm run deploy

# 4. 検証
# CloudFormation出力を確認
# APIエンドポイントをテスト
# CloudWatchログを確認
```

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
6. リリースにタグ付け: `git tag -a v2.7.0 -m "Release v2.7.0"`
7. タグをプッシュ: `git push origin v2.7.0`
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
