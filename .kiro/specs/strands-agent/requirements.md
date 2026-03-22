# Strands Agent チャットエージェント - 要件定義

## 概要

Image Compositorの全機能を自然言語で操作できるAIチャットエージェントを、Strands Agents SDKとAWS Bedrock（Claude Sonnet 4.5）を用いて構築する。

---

## Req 1: エージェントコア基盤

**説明**: Strands Agents SDKを使用したAIエージェントのコアシステム。AWS Bedrockを通じてClaude Sonnet 4.5を利用し、自然言語で画像合成システムの操作を行う。

**Acceptance Criteria**:
- AC 1.1: Strands Agents SDK (`strands-agents`) を使用してエージェントが初期化できること
- AC 1.2: AWS Bedrock の Claude Sonnet 4.5（US Cross-Region推論プロファイル）をモデルプロバイダーとして設定できること
- AC 1.3: 日本語のシステムプロンプトでエージェントが応答すること
- AC 1.4: `@tool` デコレータで定義されたカスタムツールをエージェントが呼び出せること
- AC 1.5: Lambda関数としてデプロイ可能であること（Python 3.12, ARM64）

---

## Req 2: 画像合成ツール

**説明**: 既存の画像合成APIを自然言語から呼び出すツール。ユーザーの曖昧な指示をAPIパラメータに変換する。

**Acceptance Criteria**:
- AC 2.1: 自然言語の位置指定（「左上」「中央」「右下」等）をx,y座標に変換できること
- AC 2.2: 最大3枚の画像を合成できること
- AC 2.3: ベース画像（test/transparent/S3 URL/HTTP URL）を指定できること
- AC 2.4: 画像ソースとしてtest画像、S3アップロード画像、HTTP URLを指定できること
- AC 2.5: 合成結果をBase64画像データとして返却できること
- AC 2.6: パラメータが不足する場合、デフォルト値を使用し、使用した値をユーザーに通知すること

---

## Req 3: 動画生成ツール

**説明**: 画像を合成して動画を生成するツール。合成パラメータと動画パラメータを一括指定する。

**Acceptance Criteria**:
- AC 3.1: 動画フォーマット（MXF/MP4/WEBM/AVI）を指定できること
- AC 3.2: 動画の長さ（1-30秒）を指定できること
- AC 3.3: 生成された動画のS3 URL（CloudFront経由）を返却できること
- AC 3.4: フォーマットや長さの指定がない場合、デフォルト値（MP4, 3秒）を使用すること

---

## Req 4: アセット管理ツール

**説明**: S3にアップロードされた画像の一覧・削除を行うツール。

**Acceptance Criteria**:
- AC 4.1: アップロード済み画像の一覧を取得し、ファイル名・サイズ・日時を表示できること
- AC 4.2: 画像名を指定して削除できること
- AC 4.3: 一覧から画像を選択し、合成パラメータに設定できること

---

## Req 5: 会話履歴管理

**説明**: DynamoDBを使用した会話履歴の永続化。セッション間で会話を継続可能にする。

**Acceptance Criteria**:
- AC 5.1: 会話メッセージ（user/assistant）をDynamoDBに保存できること
- AC 5.2: セッションIDで会話履歴を取得できること
- AC 5.3: セッションIDで会話履歴を削除できること（ページネーション対応）
- AC 5.4: TTL（7日）で自動的に古い履歴が削除されること
- AC 5.5: 会話履歴をStrands Agentのコンテキストとして渡し、前回の会話を踏まえた応答ができること

---

## Req 6: API Gateway エンドポイント

**説明**: エージェントへのHTTPアクセスを提供するAPIエンドポイント。

**Acceptance Criteria**:
- AC 6.1: `POST /chat` でエージェントにメッセージを送信できること
- AC 6.2: `GET /chat/history/{sessionId}` で会話履歴を取得できること
- AC 6.3: `DELETE /chat/history/{sessionId}` で会話履歴を削除できること
- AC 6.4: CORS設定が適切であること
- AC 6.5: リクエスト/レスポンスのJSON形式が定義通りであること

---

## Req 7: モデル認証（AWS Bedrock IAM）

**説明**: AWS BedrockのIAMロールベース認証でモデルにアクセスする。APIキー管理は不要。

**Acceptance Criteria**:
- AC 7.1: Agent LambdaがIAMロールでBedrock InvokeModelを実行できること
- AC 7.2: US Cross-Region推論プロファイルのIAMポリシーが正しく設定されていること
- AC 7.3: aws-marketplace:ViewSubscriptions権限が設定されていること
- AC 7.4: モデルIDが環境変数（`AGENT_MODEL_ID`）で設定可能であること

---

## Req 8: CDKインフラストラクチャ

**説明**: Agent機能に必要なAWSリソースをCDKで定義する。

**Acceptance Criteria**:
- AC 8.1: Agent Lambda関数がCDKで定義されていること（Python 3.12, 2048MB, 90秒, ARM64）
- AC 8.2: DynamoDBテーブルがCDKで定義されていること（PAY_PER_REQUEST, TTL有効）
- AC 8.3: API Gatewayに `/chat` リソースが追加されていること
- AC 8.4: Bedrock InvokeModel用のIAMポリシーが設定されていること
- AC 8.5: 依存パッケージがDocker bundlingでインライン含まれること
- AC 8.6: IAMポリシーが最小権限で設定されていること

---

## Req 9: フロントエンド統合

**説明**: 既存のChatPage UIをStrands Agentバックエンドに接続する。

**Acceptance Criteria**:
- AC 9.1: `useChatAgent.ts` がAgent API (`POST /chat`) を呼び出すよう改修されること
- AC 9.2: セッションID管理（生成・保持・復元）が実装されていること
- AC 9.3: エージェントの応答（テキスト、画像、動画URL）を適切に表示できること
- AC 9.4: ツール実行中のローディング表示があること
- AC 9.5: ページリロード後に会話履歴をロードし表示できること
- AC 9.6: 会話リセット機能が動作すること

---

## Req 10: システムプロンプト設計

**説明**: エージェントの振る舞いを定義するシステムプロンプト。

**Acceptance Criteria**:
- AC 10.1: 日本語で応答すること
- AC 10.2: 画像合成の専門用語（キャンバスサイズ、座標系、アルファチャンネル）を理解すること
- AC 10.3: 曖昧な指示に対してデフォルト値を提案しつつ確認すること
- AC 10.4: 合成結果に対して調整提案を行うこと
- AC 10.5: 利用可能なツールの使い方をガイドできること

---

## Req 11: エラーハンドリング

**説明**: エージェント実行時の各種エラーを適切に処理する。

**Acceptance Criteria**:
- AC 11.1: Bedrock API呼び出し失敗時にユーザーフレンドリーなメッセージを返すこと
- AC 11.2: ツール実行エラー（画像合成失敗、S3エラー等）をキャッチしてエージェントに報告すること
- AC 11.3: タイムアウト（Lambda 90秒）時に適切なレスポンスを返すこと
- AC 11.4: DynamoDB操作エラー時にも応答自体は返却できること（履歴保存は best-effort）
- AC 11.5: リクエストIDを含む構造化ログを出力すること

---

## Req 12: テスト

**説明**: Agent機能の品質を保証するテスト。

**Acceptance Criteria**:
- AC 12.1: Agent Lambdaのユニットテスト（ツール単位、エラーケース）が存在すること
- AC 12.2: `/chat` APIエンドポイントの統合テストが存在すること
- AC 12.3: フロントエンドのChat UI E2Eテストが存在すること
- AC 12.4: Bedrock APIのモック/スタブでユニットテストが実行可能であること
- AC 12.5: すべてのテストがCI環境で実行可能であること
