# カスタムルールプロンプト機能 - 実装タスク

## 関連ドキュメント

- [requirements.md](requirements.md) — 要件・受入基準
- [design.md](design.md) — 設計（API/データモデル/UI構成）
- [../strands-agent/](../strands-agent/) — 基盤Agent仕様（前提）

---

## 作業フロー別チェックリスト

> 各タイミングで以下のチェックリストを実行し、関連ドキュメントを参照する。

### 🟢 作業開始時（feature ブランチ作成・worktree 切り出し時）

- [ ] requirements.md の対象Req（issue #8 → Req 1-7、issue #9 → Req 8-12）を読み返す
- [ ] design.md の関連セクション（API設計 / Lambda実装 / CDK / フロント設計）を確認する
- [ ] tasks.md の「Issue #8 タスク」または「Issue #9 タスク」のうち、未着手タスクを確認する
- [ ] [`.kiro/steering/git.md`](../../steering/git.md) のブランチ命名・worktree運用ルールを確認する
- [ ] 依存タスク（Issue #8 → Issue #9）の前提状態を確認する

### 🟡 各タスク実装前

- [ ] 該当タスクの `_要件: X.X_` を requirements.md で参照し、Acceptance Criteria を確認
- [ ] design.md の該当箇所のインターフェース・データモデルが現在の実装と整合しているか確認
- [ ] [`.kiro/steering/conventions.md`](../../steering/conventions.md) のコーディング規約を確認
- [ ] [`.kiro/steering/testing.md`](../../steering/testing.md) のテスト方針を確認
- [ ] テストファイル（単体/統合/E2E）を先に追加 or 雛形を整える（TDD推奨）

### 🟠 コミット前

- [ ] 実装が requirements.md の Acceptance Criteria を満たしているか目視確認
- [ ] 該当タスクのチェックボックスを `[x]` に更新（このファイル）
- [ ] テストがローカルで通ること（`PYTHONPATH=lambda/python python3 -m unittest discover -s test/lambda` / `npm test` 等）
- [ ] 既存機能への影響を確認（`POST /chat` 既存形式 / 既存UIの動作）
- [ ] `cdk synth` が通ること（CDK変更時）
- [ ] [`.kiro/steering/git.md`](../../steering/git.md) のコミットメッセージ規約に沿うか

### 🔴 PR作成前

- [ ] 全タスクのチェックボックスが更新されている
- [ ] requirements.md の対象Reqの全Acceptance Criteriaが満たされている
- [ ] design.md と実装の差分が大きい場合は design.md を更新する
- [ ] CHANGELOG的な観点で重要な変更を PR 説明に箇条書きする
- [ ] テスト計画（単体/E2E）と結果を PR 説明に記載する
- [ ] 関連issue（#8 / #9）への参照リンクを PR 説明に含める

### 🟣 PRマージ後

- [ ] dev環境で動作確認（staging自動デプロイ後）
- [ ] worktree を削除（`git worktree remove ../<dir>`）してローカルブランチを掃除
- [ ] 後続タスクが unblock されたか確認（issue #8 マージ → issue #9 着手可能）

---

## Issue #8: API実装タスク（feature/issue8-custom-rules-api）

### タスク1: spec準備とブランチ準備
_要件: 全Req（読み込み）_

- [ ] 1.1 worktree作成: `git worktree add ../image-composite-agent-issue8 -b feature/issue8-custom-rules-api dev`
- [ ] 1.2 requirements.md / design.md を読み返す
- [ ] 1.3 `.env.local` の存在を確認

### タスク2: シードデータとデフォルトルール本文
_要件: 6.1, 6.3, 6.6_

- [ ] 2.1 ディレクトリ作成: `assets/seed-rules/`
- [ ] 2.2 JAA字幕ハンドブックPDFから画像合成関連規定を要点抽出（セーフゾーン / テロップ位置 / 文字サイズ目安 / 種別ガイド / 禁止事項）
- [ ] 2.3 `assets/seed-rules/jaa-rule.import.jsonl` を ND-JSON（DynamoDB Import）形式で作成
- [ ] 2.4 `assets/seed-rules/jaa-rule.put.json` を put-item 用形式（`Item` キーなし）で作成
- [ ] 2.5 本文MarkdownをコードレビューしやすいようヒアドキュメントでなくJSON文字列にエスケープ
- [ ] 2.6 2ファイル間で属性内容が一致していることをPRレビューで確認する旨を README に記載（任意）

### タスク3: RulesTable / S3シードバケット / Import (CDK)
_要件: 1.1-1.5, 7.1-7.3, 7.6_

- [ ] 3.1 `lib/image-processor-api-stack.ts` に `RulesTable` を追加（PK ruleId、PAY_PER_REQUEST、removalPolicy 環境別）
- [ ] 3.2 `RulesSeedBucket` を追加し、`BucketDeployment` で `assets/seed-rules/` を配置（`*.put.json` は exclude）
- [ ] 3.3 `RulesTable` の `importSource` を S3 シードバケット（`*.import.jsonl`）に設定
- [ ] 3.4 `cdk synth` 成功を確認

### タスク4: ルール CRUD バックエンド実装
_要件: 2.1-2.8, 5.1, 5.4_

- [ ] 4.1 `lambda/python/rules_repository.py` 新規作成（list/get/create/update/delete/list_active/batch_get）
- [ ] 4.2 `lambda/python/rules_validator.py` 新規作成（validate_single, truncate_combined, RuleLimits）
- [ ] 4.3 `lambda/python/agent_handler.py` 拡張: `/chat/rules`, `/chat/rules/{ruleId}` ルーティング
- [ ] 4.4 UUID採番、createdAt/updatedAt付与、`isDefault=false`デフォルト
- [ ] 4.5 デフォルトルール削除拒否（403）

### タスク5: system prompt注入ロジック
_要件: 3.1-3.5, 4.1-4.4, 5.2, 5.3, 11.1-11.4_

- [ ] 5.1 `lambda/python/agent_prompts.py` に `build_full_prompt(rules, inline_rules, limits)` 追加
- [ ] 5.2 `agent_handler.handle_chat` を拡張: `ruleIds` / `inlineRules` リクエストフィールドの取り込み
- [ ] 5.3 ルール取得キャッシュ（10秒TTL）の実装
- [ ] 5.4 `/chat/rules/preview` エンドポイント実装
- [ ] 5.5 best-effort: ルール取得失敗時もチャット応答自体は返す

### タスク6: API Gateway / IAM (CDK)
_要件: 7.4, 7.5_

- [ ] 6.1 `/chat/rules` リソース追加（GET/POST）
- [ ] 6.2 `/chat/rules/preview` リソース追加（GET）— **`{ruleId}` より先に定義する**
- [ ] 6.3 `/chat/rules/{ruleId}` リソース追加（GET/PUT/DELETE）
- [ ] 6.4 ハンドラ側で `ruleId == "preview"` を400で reject（防御）
- [ ] 6.5 全エンドポイントを `AuthorizationType.NONE` で設定
- [ ] 6.6 CORS設定統一
- [ ] 6.7 Agent Lambda の IAMポリシーに RulesTable CRUD 権限を追加（最小権限）
- [ ] 6.8 環境変数 `RULES_TABLE`, `RULES_MAX_*` を Lambda に設定

### タスク7: シードスクリプト
_要件: 6.4, 6.5_

- [ ] 7.1 `scripts/seed-rules.sh` 新規作成（`*.put.json` を読み込む）
- [ ] 7.2 デフォルト動作（`attribute_not_exists` で冪等）
- [ ] 7.3 `--overwrite` オプション（強制上書き）
- [ ] 7.4 環境別テーブル名解決ロジック（`ImageCompositor-Rules-{dev|staging}` / `ImageCompositor-Rules`、既存`ChatHistory`命名と統一）

### タスク8: 単体テスト
_要件: 13.1, 13.2_

- [ ] 8.1 `test/lambda/test_rules_repository.py` - moto等でDynamoDBモック、CRUDテスト・UUID採番・デフォルト削除保護
- [ ] 8.2 `test/lambda/test_rules_validator.py` - 単一/件数/結合上限テスト
- [ ] 8.3 `test/lambda/test_agent_prompts.py` 拡張 - build_full_prompt のケース網羅（0件/1件/上限超過/inline混在）
- [ ] 8.4 `test/lambda/test_agent_handler.py` 拡張 - 各エンドポイント・ruleIds/inlineRules適用・`ruleId="preview"` reject

### タスク9: API統合テスト
_要件: 13.3, 13.4_

- [ ] 9.1 `test/e2e/rules.api.spec.ts` 新規作成 - CRUDフロー
- [ ] 9.2 デフォルトルール削除拒否テスト
- [ ] 9.3 preview エンドポイントテスト
- [ ] 9.4 バリデーションエラーケース
- [ ] 9.5 `test/e2e/chat-agent.api.spec.ts` 拡張 - inlineRules適用

### タスク10: dev環境デプロイ・動作確認
_要件: 全Req_

- [ ] 10.1 `ENVIRONMENT=dev ./scripts/deploy.sh` でdev環境にデプロイ
- [ ] 10.2 デフォルトルール（JAA）が自動投入されたことを確認（`aws dynamodb scan`）
- [ ] 10.3 CRUDをcurl/Postmanで動作確認
- [ ] 10.4 `POST /chat` で `ruleIds` / `inlineRules` が反映されることを動作確認

### タスク11: PR作成・レビュー
_要件: 全Req_

- [ ] 11.1 PR作成前チェックリスト（上部）を実行
- [ ] 11.2 PRをdevブランチへ向けて作成、issue #8 を参照
- [ ] 11.3 レビュー対応・マージ
- [ ] 11.4 worktree削除

---

## Issue #9: UI実装タスク（feature/issue9-rules-admin-ui）

> ⚠️ Issue #8 のマージ後に着手すること（API依存）

### タスク12: spec準備とブランチ準備
_要件: 8.1-8.3_

- [ ] 12.1 worktree作成: `git worktree add ../image-composite-agent-issue9 -b feature/issue9-rules-admin-ui dev`
- [ ] 12.2 requirements.md / design.md（フロントエンド設計）を読み返す
- [ ] 12.3 dev環境のAPI（issue #8）が動作中であることを確認

### タスク13: ナビゲーション追加
_要件: 8.1-8.3_

- [ ] 13.1 `frontend/src/router/index.ts` に `/settings` ルート追加
- [ ] 13.2 `frontend/src/components/AppShell.vue` のナビゲーションに `Settings` タブ追加

### タスク14: 型定義 / API クライアント / Pinia store
_要件: 9.1-9.6, 10.1-10.8, 11.1-11.4_

- [ ] 14.1 `frontend/src/types/rules.ts` 新規作成（`Rule`, `InlineRule`, `RulesPreviewResponse`, `RuleDraft`）
- [ ] 14.2 `frontend/src/composables/useRulesApi.ts` 新規作成（CRUD + preview、`types/rules.ts` を使用）
- [ ] 14.3 `frontend/src/stores/rules.ts` 新規作成（Pinia store）
- [ ] 14.4 fetchAll, create, update, remove, fetchPreview の実装
- [ ] 14.5 ローディング/エラー状態の管理

### タスク15: ルール一覧UI
_要件: 9.1-9.6_

- [ ] 15.1 `frontend/src/pages/SettingsPage.vue` 新規作成（メインレイアウト）
- [ ] 15.2 `frontend/src/components/settings/RuleList.vue` 新規作成
- [ ] 15.3 `frontend/src/components/settings/RuleListItem.vue` 新規作成（カード）
- [ ] 15.4 isActive トグル実装、即時API反映
- [ ] 15.5 デフォルトルールバッジ表示
- [ ] 15.6 削除ボタン（デフォルトルールでは非表示）+ 確認ダイアログ
- [ ] 15.7 「+ 新規作成」ボタン

### タスク16: ルール編集UI
_要件: 10.1-10.8_

- [ ] 16.1 `frontend/src/components/settings/RuleEditor.vue` 新規作成
- [ ] 16.2 名前/本文/Active のフォーム実装
- [ ] 16.3 Markdownプレビュートグル（`marked` + `DOMPurify`）
- [ ] 16.4 文字数カウント表示と上限警告
- [ ] 16.5 保存ボタン（POST/PUT 自動切替）
- [ ] 16.6 未保存変更検知（draftDirty 状態管理）
- [ ] 16.7 `beforeRouteLeave` ガード
- [ ] 16.8 `beforeunload` ガード

### タスク17: System prompt プレビュー
_要件: 11.1-11.4_

- [ ] 17.1 `frontend/src/components/settings/PromptPreview.vue` 新規作成
- [ ] 17.2 `GET /chat/rules/preview` 呼び出し
- [ ] 17.3 結合プロンプトの Markdown レンダリング
- [ ] 17.4 ルール数・文字数の表示
- [ ] 17.5 ルール変更後のプレビュー再取得

### タスク18: テスト送信機能
_要件: 4.1-4.4, 12.1-12.5_

- [ ] 18.1 RuleEditor に「テスト送信」ボタン追加
- [ ] 18.2 localStorage `__rule_draft__` 保存→`/chat-agent`遷移
- [ ] 18.3 `frontend/src/components/settings/DraftBanner.vue` 新規作成
- [ ] 18.4 ChatPage で localStorage 検出→バナー表示
- [ ] 18.5 ChatPage の useChatAgent.ts 拡張: 送信時に `inlineRules` を含める
- [ ] 18.6 「解除」ボタン・会話リセットで localStorage 消去

### タスク19: フロント単体/E2Eテスト
_要件: 13.5_

- [ ] 19.1 `test/e2e/settings.spec.ts` 新規作成
- [ ] 19.2 ナビゲーション表示テスト
- [ ] 19.3 一覧表示・トグル・削除テスト
- [ ] 19.4 編集・保存・文字数警告テスト
- [ ] 19.5 デフォルトルール保護テスト
- [ ] 19.6 プレビュー表示テスト
- [ ] 19.7 テスト送信→ChatPageバナー表示テスト

### タスク20: dev環境でのE2E動作確認
_要件: 全Req_

- [ ] 20.1 `npm run frontend:dev` でローカル起動・動作確認
- [ ] 20.2 dev環境（CloudFront配信）にデプロイ後、ブラウザで動作確認
- [ ] 20.3 `/settings` ルートが SPA fallback で動作することを確認
- [ ] 20.4 既存の ChatAgent ページが影響なく動作することを確認

### タスク21: PR作成・レビュー
_要件: 全Req_

- [ ] 21.1 PR作成前チェックリスト（上部）を実行
- [ ] 21.2 PRをdevブランチへ向けて作成、issue #9 を参照
- [ ] 21.3 レビュー対応・マージ
- [ ] 21.4 worktree削除

---

## トレーサビリティ早見表

| タスク群 | 主担当Req | 関連ファイル |
|---|---|---|
| 1〜2 | Req 6 | `assets/seed-rules/` |
| 3 | Req 1, 7 | `lib/image-processor-api-stack.ts` |
| 4 | Req 2, 5 | `lambda/python/rules_*.py`, `agent_handler.py` |
| 5 | Req 3, 4, 5, 11 | `lambda/python/agent_prompts.py`, `agent_handler.py` |
| 6 | Req 7 | `lib/image-processor-api-stack.ts` |
| 7 | Req 6 | `scripts/seed-rules.sh` |
| 8 | Req 13 | `test/lambda/` |
| 9 | Req 13 | `test/e2e/` |
| 13 | Req 8 | `frontend/src/router/`, `AppShell.vue` |
| 14 | Req 9, 10, 11 | `frontend/src/types/rules.ts`, `stores/rules.ts`, `composables/useRulesApi.ts` |
| 15 | Req 9 | `frontend/src/components/settings/Rule{List,ListItem}.vue` |
| 16 | Req 10 | `frontend/src/components/settings/RuleEditor.vue` |
| 17 | Req 11 | `frontend/src/components/settings/PromptPreview.vue` |
| 18 | Req 4, 12 | `DraftBanner.vue`, `ChatPage.vue`, `useChatAgent.ts` |
| 19 | Req 13 | `test/e2e/settings.spec.ts` |
