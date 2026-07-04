# Strands Agent チャットエージェント - 実装タスク

## タスク1: プロジェクトセットアップと依存関係
_要件: 1.1, 1.5, 8.5_

- [x] 1.1 Lambda Layer用ディレクトリ作成 (`lambda/layers/agent-deps/`)
- [x] 1.2 Strands Agents SDK + Anthropic SDK の依存関係定義 (`requirements.txt`)
- [x] 1.3 Lambda Layer ビルドスクリプト作成 (`scripts/build-agent-layer.sh`)
- [x] 1.4 package.json にAgent関連スクリプト追加

## タスク2: 会話履歴管理（DynamoDB）
_要件: 5.1, 5.2, 5.3, 5.4, 5.5_

- [x] 2.1 `chat_history.py` - ChatHistoryManagerクラス実装
- [x] 2.2 メッセージ保存（save_message）実装
- [x] 2.3 履歴取得（get_history）実装 - 最新N件取得
- [x] 2.4 履歴削除（delete_history）実装 - BatchWriteItem
- [x] 2.5 Agent形式変換（to_agent_messages）実装
- [x] 2.6 TTL計算（7日後のUnixタイムスタンプ）実装

## タスク3: エージェントツール定義
_要件: 2.1-2.6, 3.1-3.4, 4.1-4.3_

- [x] 3.1 `agent_tools.py` - compose_images ツール実装
- [x] 3.2 自然言語位置→座標変換ロジック実装
- [x] 3.3 generate_video ツール実装
- [x] 3.4 list_uploaded_images ツール実装
- [x] 3.5 delete_uploaded_image ツール実装
- [x] 3.6 get_help ツール実装

## タスク4: システムプロンプト定義
_要件: 10.1-10.5_

- [x] 4.1 `agent_prompts.py` - SYSTEM_PROMPT定義
- [x] 4.2 位置解釈ガイドの座標マッピング定義
- [x] 4.3 画像ソース説明の定義
- [x] 4.4 ルール・制約の定義

## タスク5: Agent Lambdaハンドラー
_要件: 1.1-1.5, 6.1-6.5, 7.1-7.3, 11.1-11.5_

- [x] 5.1 `agent_handler.py` - メインハンドラー実装
- [x] 5.2 POST /chat ルーティング実装
- [x] 5.3 GET /chat/history/{sessionId} ルーティング実装
- [x] 5.4 DELETE /chat/history/{sessionId} ルーティング実装
- [x] 5.5 Secrets ManagerからのAPIキー取得実装
- [x] 5.6 Strands Agent初期化（Anthropicモデル + ツール + プロンプト）
- [x] 5.7 会話履歴を含むAgent実行フロー実装
- [x] 5.8 レスポンス形式変換（Agent結果→API応答JSON）
- [x] 5.9 エラーハンドリング実装（全ケース）
- [x] 5.10 構造化ログ出力実装

## タスク6: CDKインフラストラクチャ
_要件: 8.1-8.6_

- [x] 6.1 DynamoDB ChatHistoryテーブル定義
- [x] 6.2 Secrets Manager参照設定
- [x] 6.3 Agent Lambda関数定義（Python 3.12, 2048MB, 90s, ARM64）
- [x] 6.4 Lambda Layer定義（Agent依存パッケージ）
- [x] 6.5 API Gateway `/chat` リソース追加（POST/GET/DELETE）
- [x] 6.6 IAMポリシー設定（最小権限）
- [x] 6.7 CORS設定
- [x] 6.8 CDK synth で構文エラーがないことを確認

## タスク7: フロントエンド改修
_要件: 9.1-9.6_

- [x] 7.1 `stores/chat.ts` - sessionId管理追加
- [x] 7.2 `useChatAgent.ts` - Agent API呼び出しに改修
- [x] 7.3 履歴ロード機能実装（GET /chat/history）
- [x] 7.4 会話リセット機能改修（DELETE /chat/history + 新セッション）
- [x] 7.5 メディア表示対応（Base64画像、動画URL）
- [x] 7.6 ローディング/エラー表示改善

## タスク8: ユニットテスト
_要件: 12.1, 12.4_

- [x] 8.1 `test/lambda/test_chat_history.py` - ChatHistoryManagerテスト
- [x] 8.2 `test/lambda/test_agent_tools.py` - 各ツールのユニットテスト
- [x] 8.3 `test/lambda/test_agent_handler.py` - ハンドラーテスト（モック使用）
- [x] 8.4 座標変換ロジックのテスト
- [x] 8.5 エラーケースのテスト

## タスク9: API統合テスト
_要件: 12.2_

- [x] 9.1 `test/e2e/chat-agent.api.spec.ts` - POST /chat テスト
- [x] 9.2 GET /chat/history テスト
- [x] 9.3 DELETE /chat/history テスト
- [x] 9.4 エラーケーステスト（不正リクエスト等）

## タスク10: E2Eテスト
_要件: 12.3_

- [x] 10.1 `test/e2e/chat-agent.spec.ts` - チャットUI操作テスト
- [x] 10.2 メッセージ送受信テスト
- [x] 10.3 画像合成結果表示テスト
- [x] 10.4 会話履歴復元テスト
- [x] 10.5 エラー表示テスト

## タスク11: テキストオーバーレイ対応
_要件: 2.7, 2.8, 3.5_

- [x] 11.1 compose_images ツールにtext1〜text3パラメータ追加
- [x] 11.2 generate_video ツールにtext1〜text3パラメータ追加
- [x] 11.3 agent_prompts.py にテキストオーバーレイガイダンス追加
- [x] 11.4 自然言語位置指定でテロップ配置（POSITION_MAP流用）

## タスク12: 相対配置・サイズ指示の解釈（Req 14 / issue #19）
_要件: 14.1-14.7_

- [ ] 12.1 `lambda/python/agent_tools.py` に `estimate_text_size` ツール追加（`text_renderer.load_font` + `calculate_text_bbox` 流用）
- [ ] 12.2 `test/lambda/test_estimate_text_size.py` で代表値 (font_size=24/48/72、日本語/英字/混在/空文字/改行) を検証
- [ ] 12.3 `lambda/python/agent_prompts.py` の SYSTEM_PROMPT に以下を追記:
  - 「## 相対配置の解釈」（9 種の式）
  - 「## サイズ関係の解釈」（6 パターン）
  - ツール使用ガイドに「### estimate_text_size を使うべきケース」
  - 末尾「## 複合指示の解釈例」
- [ ] 12.4 PR open + `preview` ラベルで per-PR ephemeral 環境を deploy
- [ ] 12.5 Preview 環境の /chat で AC 14.1-14.7 を人間検証
- [ ] 12.6 ズレあれば SYSTEM_PROMPT を調整 → push で再 deploy → 再検証を iterate
- [ ] 12.7 dev へ PR merge（stack 自動 destroy）

## タスク13: プリセット機能（Req 15 / issue #59）
_要件: 15.1-15.7_

- [x] 13.1 `frontend/public/composite-default.json` の `presets` に live / promo / subtitle 追加
- [x] 13.2 `lambda/python/agent_tools.py` の compose_images に `preset` 引数追加 + α 方針 merge ロジック
- [x] 13.3 `agent_tools.py` に `list_presets` ツール追加（agent_handler.py で登録）
- [x] 13.4 `lambda/python/agent_prompts.py` の SYSTEM_PROMPT に「preset 使うべきケース」「曖昧時逆質問ルール」追加
- [x] 13.5 `test/lambda/test_preset_merge.py` で preset 変換 / merge / unknown 系 unit test
- [ ] 13.6 PR open + `preview` ラベルで per-PR ephemeral 環境 deploy
- [ ] 13.7 Preview /chat で AC 15.1-15.7 を Nova で人間検証
- [ ] 13.8 dev へ PR merge

> SettingsPage UI（表示 + localStorage 上書き）は本 PR スコープ外。Phase 2 として後続 PR で実装予定。
