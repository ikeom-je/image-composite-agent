# カスタムルールプロンプト機能 - 要件定義

## 概要

Strands Agent の system prompt に外部から **表現規定ルール（カスタムルールプロンプト）** を注入・永続化する仕組みと、それを管理する **管理画面UI** を提供する。動画オーバーレイにおける字幕・テロップの配置規定など、業界・案件ごとの制約条件をAgentが理解し、合成時に遵守するようにする。

## スコープと前提

- 関連issue: [#8 feat(api): カスタムルールプロンプト対応](https://github.com/ikeom-je/image-composite-agent/issues/8) / [#9 feat(frontend): 管理画面タブ — 表現ルールプロンプト編集UI](https://github.com/ikeom-je/image-composite-agent/issues/9)
- 関連spec: [`../strands-agent/`](../strands-agent/) のRequirements/Designに準拠（基盤コア・既存ツール・既存UI）
- 実装順: API（issue #8）→ UI（issue #9）

## 用語

| 用語 | 定義 |
|---|---|
| ルール / カスタムルール | system promptに注入される表現規定の本文（Markdown） |
| デフォルトルール | システムが初期投入する固定IDのルール（例: JAA字幕ハンドブック準拠） |
| アクティブルール | `isActive=true` のルール。`POST /chat` で `ruleIds` 未指定時に自動注入される |
| インラインルール | `POST /chat` リクエストに直接埋め込まれた一時ルール（テスト送信用、永続化しない） |

---

## Req 1: ルールプロンプトのデータモデル

**説明**: カスタムルールを永続化するためのDynamoDBテーブル設計。

**Acceptance Criteria**:
- AC 1.1: 新規DynamoDBテーブル（`RulesTable`）が定義され、PK は `ruleId` (String) であること
- AC 1.2: 属性として `name`, `prompt`, `isDefault`, `isActive`, `createdAt`, `updatedAt` を持つこと
- AC 1.3: BillingMode は `PAY_PER_REQUEST` であること
- AC 1.4: `removalPolicy` は dev/staging で `DESTROY`、production で `RETAIN` であること
- AC 1.5: TTL設定は持たない（永続化）

---

## Req 2: ルールCRUD API

**説明**: ルールプロンプトをHTTP API経由で作成・取得・更新・削除する。

**Acceptance Criteria**:
- AC 2.1: `GET /chat/rules` で全ルール一覧を取得できること
- AC 2.2: `GET /chat/rules/{ruleId}` で個別ルールを取得できること
- AC 2.3: `POST /chat/rules` でルールを新規作成できること（リクエスト: `{ name, prompt, isActive? }`、レスポンス: `{ rule: Rule }`、`ruleId` は UUID v4 で自動採番）
- AC 2.4: `PUT /chat/rules/{ruleId}` でルールを更新できること（部分更新可）
- AC 2.5: `DELETE /chat/rules/{ruleId}` でルールを削除できること
- AC 2.6: デフォルトルール（`isDefault=true`）に対する DELETE は 403 を返すこと
- AC 2.7: 全エンドポイントが `AuthorizationType.NONE`（認証なし、既存APIと整合）
- AC 2.8: CORS設定が既存APIと同様に適用されていること

---

## Req 3: system promptへのルール注入

**説明**: `POST /chat` 実行時、Agent初期化のsystem promptにアクティブルールを自動注入する。

**Acceptance Criteria**:
- AC 3.1: `POST /chat` の `ruleIds` 未指定時、`isActive=true` のルール全件を結合してsystem promptに注入すること
- AC 3.2: `POST /chat` の `ruleIds` 指定時、指定されたID群のみを注入すること（アクティブ状態は無視）
- AC 3.3: 注入セクションは見出し `## 表現規定ルール` 配下に `### {name}` + 本文の形式で連結されること
- AC 3.4: ルールが0件の場合は基本system promptのみで動作し、既存動作と差分が無いこと
- AC 3.5: ルール取得失敗時もチャット応答自体は返却できること（best-effort、ルールなしで継続）

---

## Req 4: インラインルール（テスト送信）

**説明**: ルール編集中の保存前ドラフトを `POST /chat` に直接埋め込み、保存せずに試行できるようにする。

**Acceptance Criteria**:
- AC 4.1: `POST /chat` リクエストに `inlineRules: [{ name, prompt }]` を指定できること
- AC 4.2: `ruleIds` と `inlineRules` は併用可能で、両者が結合されてsystem promptに注入されること
- AC 4.3: `inlineRules` は永続化されないこと（DBに書き込まれない）
- AC 4.4: `inlineRules` にも本文サイズ・ルール数の制約（Req 5）が適用されること

---

## Req 5: サイズ・件数ガード

**説明**: system promptの肥大化を防ぐためのガードを設ける。

**Acceptance Criteria**:
- AC 5.1: 1つのルール本文（`prompt`）は最大 10,000 文字とし、超過時は POST/PUT で 400 を返すこと
- AC 5.2: 適用される（永続+インライン合算）ルール数は最大 5 件とし、超過時は400を返すこと
- AC 5.3: 結合後の追加プロンプト総文字数は最大 20,000 文字とし、超過時は超過分のルールを末尾から除外しログに警告を出力すること
- AC 5.4: 各上限値は環境変数で上書き可能であること（`RULES_MAX_PROMPT_CHARS`, `RULES_MAX_COUNT`, `RULES_MAX_COMBINED_CHARS`）

---

## Req 6: デフォルトルール（JAA字幕ハンドブック準拠）

**説明**: 初期プリセットとして、日本広告業協会(JAA)の字幕ハンドブックに基づく表現規定を組み込む。

**Acceptance Criteria**:
- AC 6.1: デフォルトルールが固定ID `jaa-subtitle-handbook-v1` で登録されていること
- AC 6.2: デフォルトルールは `isDefault=true` で、削除不可（無効化のみ可）であること
- AC 6.3: 本文は [JAA字幕ハンドブック](https://www.jaa.or.jp/assets/uploads/docs/jimaku_handbook.pdf) から画像合成に関連する規定（セーフゾーン / テロップ位置 / 文字サイズ目安 / テロップ種別ガイド / 禁止事項）を要点抽出してMarkdownで定義していること
- AC 6.4: 初期投入はDynamoDB `Import from S3` 機能で自動実行されること（テーブル作成時）
- AC 6.5: 補助スクリプト `scripts/seed-rules.sh` で再投入・リセットが可能であること（`batch-write-item` ベース、冪等性は `attribute_not_exists` または明示の上書きフラグで制御）
- AC 6.6: シードデータ（JSON）は git 管理下（`assets/seed-rules/`）に置かれ diff レビュー可能であること

---

## Req 7: CDKインフラストラクチャ

**説明**: 本機能のAWSリソースをCDKで定義する。

**Acceptance Criteria**:
- AC 7.1: `RulesTable` がCDKで定義されていること（Req 1 を満たす）
- AC 7.2: `BucketDeployment` で `assets/seed-rules/` の内容を S3 シードバケットへ配置すること
- AC 7.3: `RulesTable` の `importSource` で S3 パスが設定されており、初回作成時に DynamoDB が import を実行すること
- AC 7.4: API Gateway に `/chat/rules`, `/chat/rules/{ruleId}`, `/chat/rules/preview` リソースが追加されていること（静的パス `preview` は `{ruleId}` より先に定義し、誤マッチを防ぐこと）
- AC 7.5: Agent Lambdaに `RulesTable` への CRUD 用 IAMポリシー（最小権限）が付与されていること
- AC 7.6: `cdk synth` が構文エラーなく成功すること

---

## Req 8: 管理画面ナビゲーション

**説明**: ルール管理画面へのナビゲーションを既存UIに追加する。

**Acceptance Criteria**:
- AC 8.1: ナビゲーションタブに `Settings` が追加されていること（`Portal | APIDemo | ChatAgent | Settings`）
- AC 8.2: `/settings` ルートが追加されており、SettingsPageコンポーネントが表示されること
- AC 8.3: 既存のナビゲーション動作（active状態、レスポンシブ）が維持されていること

---

## Req 9: ルール一覧UI

**説明**: 登録済みルールの一覧表示と基本操作。

**Acceptance Criteria**:
- AC 9.1: ルール一覧がカード形式で表示され、各カードに `name`, `isActive`トグル, 最終更新日時, 本文先頭プレビューが表示されること
- AC 9.2: `isActive` トグルで PUT /chat/rules/{ruleId} を呼び出し、表示が即時反映されること
- AC 9.3: デフォルトルール（`isDefault=true`）には「デフォルト」バッジが表示されること
- AC 9.4: デフォルトルールには削除ボタンが表示されないこと（無効化トグルのみ）
- AC 9.5: 一覧の取得は `GET /chat/rules` を呼び出し、ロード中はスケルトン/スピナーが表示されること
- AC 9.6: 取得失敗時はエラーメッセージが表示され、再試行ボタンが提供されること

---

## Req 10: ルール編集UI

**説明**: ルールの新規作成・編集フォーム。

**Acceptance Criteria**:
- AC 10.1: ルール名（`name`）をテキスト入力で編集できること
- AC 10.2: 本文（`prompt`）をテキストエリアで編集できること（行数可変、十分な高さ）
- AC 10.3: 本文のMarkdownプレビューを切替表示できること（`marked` ライブラリ使用）
- AC 10.4: 保存ボタンで POST /chat/rules（新規）または PUT /chat/rules/{ruleId}（更新）を呼び出すこと
- AC 10.5: 文字数カウントが表示され、上限（10,000字）を超過時は警告表示・保存ボタン無効化されること
- AC 10.6: 削除ボタンで確認ダイアログを表示し、承認時に DELETE /chat/rules/{ruleId} を呼び出すこと（デフォルトルールでは非表示）
- AC 10.7: 未保存変更がある状態でルート遷移しようとした場合、`beforeRouteLeave` で警告ダイアログを表示すること
- AC 10.8: 未保存変更がある状態でブラウザを閉じようとした場合、`beforeunload` で警告すること

---

## Req 11: 結合済みsystem promptプレビュー

**説明**: 基本プロンプト + アクティブカスタムルールが結合された最終的なsystem prompt全文を表示する読み取り専用UI。

**Acceptance Criteria**:
- AC 11.1: SettingsPage 内に「現在のsystem prompt全文」プレビューセクションが存在すること
- AC 11.2: バックエンドAPI（後述: `GET /chat/rules/preview`）から取得した結合済みプロンプトを Markdown レンダリングして表示すること
- AC 11.3: 文字数とルール数を表示すること
- AC 11.4: ルール変更後、プレビューが再取得されて最新の結合状態が反映されること

> 補足: Req 11 のサポートのため、API側に `GET /chat/rules/preview` を追加する（Req 2 の補助エンドポイント、リクエスト: `?ruleIds=...`(任意)）。

---

## Req 12: テスト送信機能（簡易版）

**説明**: 編集中のドラフトルールをChatPageに引き継ぎ、保存せず試行できるようにする。

**Acceptance Criteria**:
- AC 12.1: ルール編集UI から「このドラフトでテスト送信」ボタンを提供すること
- AC 12.2: クリック時、編集中本文を localStorage キー `__rule_draft__` に保存して `/chat-agent` へ遷移すること
- AC 12.3: ChatPage は localStorage の `__rule_draft__` を検出し、当該セッションの `POST /chat` リクエストに `inlineRules: [draft]` を含めること
- AC 12.4: ChatPage 上に「ドラフトルール適用中」のバナーと「解除」ボタンが表示されること
- AC 12.5: 解除ボタンまたはセッションリセットで localStorage が消去されること

---

## Req 13: テスト

**説明**: 本機能の品質を保証するテスト。

**Acceptance Criteria**:
- AC 13.1: Lambda単体テスト3ファイルが整備されていること:
  - `test/lambda/test_rules_repository.py`: CRUD全パス・デフォルト削除保護・UUID採番
  - `test/lambda/test_rules_validator.py`: 単一サイズ超過/件数超過/結合超過の切り詰め
  - `test/lambda/test_agent_handler.py`（拡張）: 各エンドポイント・ruleIds/inlineRules適用
- AC 13.2: Lambda単体テスト（`test_agent_prompts.py` 拡張）で注入ロジック（ruleIds指定/非指定/inlineRules/ガード超過）が検証されていること
- AC 13.3: API E2Eテスト（`test/e2e/rules.api.spec.ts`）でCRUDフローが検証されていること
- AC 13.4: API E2Eテスト（`test/e2e/chat-agent.api.spec.ts` 拡張）で `inlineRules` 適用時の応答が検証されていること
- AC 13.5: フロントE2Eテスト（`test/e2e/settings.spec.ts`）で一覧/編集/保存/トグル/プレビュー/テスト送信フローが検証されていること
- AC 13.6: 全テストがCI環境で実行可能であること

---

## 非機能要件

- **後方互換性**: 既存の `POST /chat` 形式は維持される（`ruleIds`/`inlineRules` は任意フィールド）
- **パフォーマンス**: ルール取得は Lambda インスタンス内で短時間キャッシュ（10秒）
- **セキュリティ**: 全エンドポイント `AuthorizationType.NONE`（既存と整合）。XSS対策のためMarkdownレンダリング時はサニタイズ（`marked` の `sanitize` または `DOMPurify`）
- **国際化**: 当面日本語UIのみ対応

---

## トレーサビリティ早見表

| Req | 関連issue 受入基準 | 依存 |
|---|---|---|
| Req 1, 2, 3, 5, 6, 7 | issue #8 | — |
| Req 4 | issue #8（API側）+ issue #9（UI側） | Req 12 |
| Req 8, 9, 10, 11, 12 | issue #9 | issue #8 |
| Req 13 | 両issue | 全Req |
