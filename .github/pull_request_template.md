<!--
PRタイトルは以下の形式に従ってください:
  <type>(<scope>): <内容>
  例: feat(api): baseOpacity追加 / fix(agent): Bedrockリージョン設定修正

詳細は .kiro/steering/git.md の「コミットメッセージ」「プルリクエストガイドライン」を参照。
-->

## 概要

<!-- この変更の目的を1〜3文で簡潔に説明 -->

## 変更内容

<!-- 主な変更点を箇条書きで -->

-
-

## テスト

<!-- 該当するチェックボックスにチェックを入れる -->

- [ ] ユニットテストが通過（`npm run test:lambda`）
- [ ] APIテストが通過（`npm run test:api`）
- [ ] E2Eテストが通過（`npm run test:all-e2e` 等）
- [ ] Chat Agent APIテストが通過（該当する場合: `CHAT_API_URL=... npm run test:chat-agent` 等）
- [ ] 手動テスト完了（dev/staging環境で動作確認）

## ドキュメント更新確認

<!-- 該当する変更がある場合、対応ドキュメントの更新確認チェックを入れる。詳細は .kiro/steering/git.md の「ドキュメント更新チェックリスト」参照 -->

- [ ] **新APIパラメータ**を追加した → `specs/<feature>/requirements.md` (AC追加) + `specs/<feature>/design.md` (パラメータ表) + `steering/architecture.md` (エンドポイント表) を更新
- [ ] **新Lambdaエンドポイント**を追加した → `steering/architecture.md` (エンドポイント表) + `specs/<feature>/requirements.md` (Req追加) + `specs/<feature>/design.md` (API設計) を更新
- [ ] **新環境変数**を追加した → `steering/tech.md` (環境変数一覧) + 該当する `specs/<feature>/design.md` を更新
- [ ] **新Lambda関数**を追加した → `steering/architecture.md` + `steering/structure.md` (依存関係図) + `specs/<feature>/design.md` を更新
- [ ] **デプロイ手順**を変更した → `steering/workflow.md` + `CLAUDE.md` (デプロイセクション) を更新
- [ ] **新テストコマンド**を追加した → `steering/testing.md` + `package.json` を更新
- [ ] **依存パッケージ**を追加・更新した → `steering/tech.md` (バージョン制約も) を更新
- [ ] **CI/CDワークフロー**を変更した → `steering/testing.md` (GitHub Actions節) + `steering/workflow.md` (CI/CDパイプライン節) を更新
- [ ] **バージョン更新**を行った（リリース時）→ `package.json` + `steering/product.md` のみを更新（他ファイルにバージョン直書き禁止）
- [ ] **モジュール間依存**を変更した → `steering/structure.md` (Lambda依存関係図) を更新
- [ ] **`tasks.md` のチェックボックス**を `[x]` に更新した（仕様駆動開発ルール3）
- [ ] 上記いずれにも該当しない（実装変更なし or バグ修正のみ等）

## スクリーンショット（該当する場合）

<!-- UI変更がある場合、変更前後のスクリーンショットを添付 -->

## 関連Issue

<!-- 例: Closes #123, Refs #456 -->
