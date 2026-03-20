# Strands Agent チャットエージェント - 実装タスク

## タスク1: プロジェクトセットアップと依存関係
_要件: 1.1, 1.5, 8.5_

- [ ] 1.1 Lambda Layer用ディレクトリ作成 (`lambda/layers/agent-deps/`)
- [ ] 1.2 Strands Agents SDK + Anthropic SDK の依存関係定義 (`requirements.txt`)
- [ ] 1.3 Lambda Layer ビルドスクリプト作成 (`scripts/build-agent-layer.sh`)
- [ ] 1.4 package.json にAgent関連スクリプト追加

## タスク2: 会話履歴管理（DynamoDB）
_要件: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 2.1 `chat_history.py` - ChatHistoryManagerクラス実装
- [ ] 2.2 メッセージ保存（save_message）実装
- [ ] 2.3 履歴取得（get_history）実装 - 最新N件取得
- [ ] 2.4 履歴削除（delete_history）実装 - BatchWriteItem
- [ ] 2.5 Agent形式変換（to_agent_messages）実装
- [ ] 2.6 TTL計算（7日後のUnixタイムスタンプ）実装

## タスク3: エージェントツール定義
_要件: 2.1-2.6, 3.1-3.4, 4.1-4.3_

- [ ] 3.1 `agent_tools.py` - compose_images ツール実装
- [ ] 3.2 自然言語位置→座標変換ロジック実装
- [ ] 3.3 generate_video ツール実装
- [ ] 3.4 list_uploaded_images ツール実装
- [ ] 3.5 delete_uploaded_image ツール実装
- [ ] 3.6 get_help ツール実装

## タスク4: システムプロンプト定義
_要件: 10.1-10.5_

- [ ] 4.1 `agent_prompts.py` - SYSTEM_PROMPT定義
- [ ] 4.2 位置解釈ガイドの座標マッピング定義
- [ ] 4.3 画像ソース説明の定義
- [ ] 4.4 ルール・制約の定義

## タスク5: Agent Lambdaハンドラー
_要件: 1.1-1.5, 6.1-6.5, 7.1-7.3, 11.1-11.5_

- [ ] 5.1 `agent_handler.py` - メインハンドラー実装
- [ ] 5.2 POST /chat ルーティング実装
- [ ] 5.3 GET /chat/history/{sessionId} ルーティング実装
- [ ] 5.4 DELETE /chat/history/{sessionId} ルーティング実装
- [ ] 5.5 Secrets ManagerからのAPIキー取得実装
- [ ] 5.6 Strands Agent初期化（Anthropicモデル + ツール + プロンプト）
- [ ] 5.7 会話履歴を含むAgent実行フロー実装
- [ ] 5.8 レスポンス形式変換（Agent結果→API応答JSON）
- [ ] 5.9 エラーハンドリング実装（全ケース）
- [ ] 5.10 構造化ログ出力実装

## タスク6: CDKインフラストラクチャ
_要件: 8.1-8.6_

- [ ] 6.1 DynamoDB ChatHistoryテーブル定義
- [ ] 6.2 Secrets Manager参照設定
- [ ] 6.3 Agent Lambda関数定義（Python 3.11, 512MB, 90s, ARM64）
- [ ] 6.4 Lambda Layer定義（Agent依存パッケージ）
- [ ] 6.5 API Gateway `/chat` リソース追加（POST/GET/DELETE）
- [ ] 6.6 IAMポリシー設定（最小権限）
- [ ] 6.7 CORS設定
- [ ] 6.8 CDK synth で構文エラーがないことを確認

## タスク7: フロントエンド改修
_要件: 9.1-9.6_

- [ ] 7.1 `stores/chat.ts` - sessionId管理追加
- [ ] 7.2 `useChatAgent.ts` - Agent API呼び出しに改修
- [ ] 7.3 履歴ロード機能実装（GET /chat/history）
- [ ] 7.4 会話リセット機能改修（DELETE /chat/history + 新セッション）
- [ ] 7.5 メディア表示対応（Base64画像、動画URL）
- [ ] 7.6 ローディング/エラー表示改善

## タスク8: ユニットテスト
_要件: 12.1, 12.4_

- [ ] 8.1 `test/lambda/test_chat_history.py` - ChatHistoryManagerテスト
- [ ] 8.2 `test/lambda/test_agent_tools.py` - 各ツールのユニットテスト
- [ ] 8.3 `test/lambda/test_agent_handler.py` - ハンドラーテスト（モック使用）
- [ ] 8.4 座標変換ロジックのテスト
- [ ] 8.5 エラーケースのテスト

## タスク9: API統合テスト
_要件: 12.2_

- [ ] 9.1 `test/e2e/chat-agent.api.spec.ts` - POST /chat テスト
- [ ] 9.2 GET /chat/history テスト
- [ ] 9.3 DELETE /chat/history テスト
- [ ] 9.4 エラーケーステスト（不正リクエスト等）

## タスク10: E2Eテスト
_要件: 12.3_

- [ ] 10.1 `test/e2e/chat-agent.spec.ts` - チャットUI操作テスト
- [ ] 10.2 メッセージ送受信テスト
- [ ] 10.3 画像合成結果表示テスト
- [ ] 10.4 会話履歴復元テスト
- [ ] 10.5 エラー表示テスト
