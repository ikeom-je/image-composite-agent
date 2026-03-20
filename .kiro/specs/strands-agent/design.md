# Strands Agent チャットエージェント - 設計書

## 1. システムアーキテクチャ

```
┌──────────────────┐       POST /chat         ┌─────────────────────┐
│   Frontend       │  ─────────────────────→  │   Agent Lambda      │
│   ChatPage.vue   │  ←─────────────────────  │   (Python 3.11)     │
│   (Vue.js 3)     │       JSON Response       │   Strands Agent SDK │
└──────────────────┘                           └──────────┬──────────┘
       │                                                   │
       │ GET /chat/history/{id}            ┌───────────────┼────────────────┐
       │ DELETE /chat/history/{id}         │               │                │
       │                              ┌────▼─────┐  ┌─────▼──────┐  ┌─────▼──────┐
       └──────────────────────────→   │ Anthropic │  │ DynamoDB   │  │ 既存API    │
                                      │ Claude    │  │ ChatHistory│  │ (内部呼出) │
                                      │ Sonnet    │  │ Table      │  └─────┬──────┘
                                      └──────────┘  └────────────┘        │
                                                                    ┌─────┼──────┐
                                                                    │     │      │
                                                               ┌────▼┐ ┌─▼───┐ ┌▼────────┐
                                                               │ S3  │ │ S3  │ │CloudFront│
                                                               │Upload│ │Rsrc │ │CDN      │
                                                               └─────┘ └─────┘ └─────────┘
```

## 2. Agent Lambda コンポーネント設計

### 2.1 ファイル構成

```
lambda/python/
├── agent_handler.py          # Agent Lambda メインハンドラー
├── agent_tools.py            # Strands @tool 定義（全ツール）
├── agent_prompts.py          # システムプロンプト定義
├── chat_history.py           # DynamoDB 会話履歴管理
├── image_processor.py        # 既存: 画像合成ハンドラー（変更なし）
├── image_compositor.py       # 既存: 合成エンジン（変更なし）
├── image_fetcher.py          # 既存: 画像取得（変更なし）
├── upload_manager.py         # 既存: S3アップロード管理（変更なし）
├── video_generator.py        # 既存: 動画生成（変更なし）
└── error_handler.py          # 既存: エラー処理（変更なし）
```

### 2.2 agent_handler.py

```python
"""
Agent Lambda ハンドラー
POST /chat        → エージェントにメッセージ送信
GET /chat/history → 会話履歴取得
DELETE /chat/history → 会話履歴削除
"""

# エントリポイント
def handler(event, context):
    route = event['resource']
    method = event['httpMethod']

    if method == 'POST' and route == '/chat':
        return handle_chat(event, context)
    elif method == 'GET' and route == '/chat/history/{sessionId}':
        return handle_get_history(event, context)
    elif method == 'DELETE' and route == '/chat/history/{sessionId}':
        return handle_delete_history(event, context)

def handle_chat(event, context):
    # 1. リクエストパース（sessionId, message）
    # 2. DynamoDBから会話履歴取得
    # 3. Strands Agent初期化（model, tools, system_prompt）
    # 4. 会話履歴をメッセージに変換
    # 5. Agent実行（ユーザーメッセージ + 履歴）
    # 6. 応答をDynamoDBに保存
    # 7. レスポンス返却
    pass
```

### 2.3 agent_tools.py - ツール定義

```python
from strands import tool

@tool
def compose_images(
    image1: str,
    image1_position: str = "左上",
    image1_size: str = "400x400",
    image2: str = "",
    image2_position: str = "右上",
    image2_size: str = "400x400",
    image3: str = "",
    image3_position: str = "中央下",
    image3_size: str = "400x400",
    base_image: str = "test",
    format: str = "png"
) -> dict:
    """画像を合成する。

    Args:
        image1: 画像1のソース（"test", S3キー, HTTP URL）
        image1_position: 画像1の位置（"左上","中央","右下"等、またはx,y座標）
        image1_size: 画像1のサイズ（"400x400"形式、またはwidth,height）
        image2: 画像2のソース（省略可）
        image2_position: 画像2の位置
        image2_size: 画像2のサイズ
        image3: 画像3のソース（省略可）
        image3_position: 画像3の位置
        image3_size: 画像3のサイズ
        base_image: ベース画像（"test","transparent",S3キー,HTTP URL）
        format: 出力形式（"png"）
    """
    # 1. 位置名→座標変換
    # 2. サイズ文字列→数値変換
    # 3. 既存image_processorの合成ロジックを直接呼び出し
    # 4. 結果画像をBase64エンコードして返却
    pass

@tool
def generate_video(
    duration: int = 3,
    format: str = "MP4"
) -> dict:
    """合成画像から動画を生成する。

    Args:
        duration: 動画の長さ（秒、1-30）
        format: 動画フォーマット（"MXF","MP4","WEBM","AVI"）
    """
    pass

@tool
def list_uploaded_images() -> dict:
    """アップロード済み画像の一覧を取得する。"""
    pass

@tool
def delete_uploaded_image(image_key: str) -> dict:
    """アップロード済み画像を削除する。

    Args:
        image_key: 削除する画像のS3キー
    """
    pass

@tool
def get_help(topic: str = "") -> str:
    """使い方やヘルプ情報を取得する。

    Args:
        topic: ヘルプトピック（"画像合成","動画生成","アセット管理"等）
    """
    pass
```

### 2.4 agent_prompts.py - システムプロンプト

```python
SYSTEM_PROMPT = """
あなたは画像合成アシスタントです。ユーザーの自然言語による指示を理解し、
画像合成APIのツールを使って画像の合成・動画生成・アセット管理を行います。

## キャンバス仕様
- サイズ: 1920x1080 固定
- 座標系: 左上が (0, 0)、右下が (1920, 1080)

## 位置の解釈ガイド
- 「左上」→ (50, 50)
- 「右上」→ (1470, 50)
- 「中央」→ (760, 340)
- 「左下」→ (50, 630)
- 「右下」→ (1470, 630)
- 「中央上」→ (760, 50)
- 「中央下」→ (760, 630)

## 画像ソース
- "test": テスト画像（円形/矩形/三角形）
- S3キー: アップロード済み画像のファイル名
- HTTP URL: 外部画像URL

## ルール
1. 必ず日本語で応答する
2. パラメータが不明確な場合はデフォルト値を提案し、使用した値を明示する
3. 合成実行後は結果の説明と調整提案を行う
4. エラー時はわかりやすく原因と対処法を説明する
5. ツールの使い方を聞かれたら具体例を交えて説明する
"""
```

### 2.5 chat_history.py - DynamoDB管理

```python
"""
DynamoDB 会話履歴管理

テーブル設計:
  PK: sessionId (String)
  SK: timestamp (Number) - Unix timestamp (ms)
  Attributes:
    - role: "user" | "assistant" | "tool_use" | "tool_result"
    - content: メッセージ内容 (String)
    - media_url: 画像/動画URL (String, optional)
    - media_type: "image" | "video" (String, optional)
    - tool_name: ツール名 (String, optional)
    - tool_input: ツール入力JSON (String, optional)
    - ttl: TTLタイムスタンプ (Number) - 7日後
"""

class ChatHistoryManager:
    def __init__(self, table_name: str):
        pass

    def save_message(self, session_id: str, role: str, content: str, **kwargs):
        """メッセージを保存"""
        pass

    def get_history(self, session_id: str, limit: int = 50) -> list:
        """会話履歴を取得（最新N件）"""
        pass

    def delete_history(self, session_id: str):
        """会話履歴を削除"""
        pass

    def to_agent_messages(self, history: list) -> list:
        """DynamoDB履歴をStrands Agentのメッセージ形式に変換"""
        pass
```

## 3. API設計

### 3.1 POST /chat - メッセージ送信

**Request**:
```json
{
  "sessionId": "uuid-v4",
  "message": "テスト画像を3枚使って合成して"
}
```

**Response (成功)**:
```json
{
  "sessionId": "uuid-v4",
  "response": {
    "content": "3枚のテスト画像を合成しました。...",
    "media": {
      "type": "image",
      "data": "base64-encoded-png...",
      "url": null
    }
  },
  "requestId": "uuid-v4"
}
```

**Response (動画生成時)**:
```json
{
  "sessionId": "uuid-v4",
  "response": {
    "content": "MP4動画を生成しました（3秒）。",
    "media": {
      "type": "video",
      "data": null,
      "url": "https://cloudfront.example.com/generated-videos/xxx.mp4"
    }
  },
  "requestId": "uuid-v4"
}
```

**Response (テキストのみ)**:
```json
{
  "sessionId": "uuid-v4",
  "response": {
    "content": "以下の画像がアップロードされています:\n- logo.png (24KB)\n- background.jpg (156KB)",
    "media": null
  },
  "requestId": "uuid-v4"
}
```

### 3.2 GET /chat/history/{sessionId}

**Response**:
```json
{
  "sessionId": "uuid-v4",
  "messages": [
    {
      "role": "user",
      "content": "テスト画像を合成して",
      "timestamp": 1711000000000
    },
    {
      "role": "assistant",
      "content": "合成しました。",
      "mediaUrl": "...",
      "mediaType": "image",
      "timestamp": 1711000001000
    }
  ]
}
```

### 3.3 DELETE /chat/history/{sessionId}

**Response**:
```json
{
  "message": "会話履歴を削除しました",
  "sessionId": "uuid-v4"
}
```

## 4. CDKインフラ設計

### 4.1 新規リソース

```typescript
// DynamoDB テーブル
const chatHistoryTable = new dynamodb.Table(this, 'ChatHistoryTable', {
  tableName: 'ImageCompositor-ChatHistory',
  partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  timeToLiveAttribute: 'ttl',
});

// Secrets Manager（既存シークレットを参照）
const anthropicApiKey = secretsmanager.Secret.fromSecretNameV2(
  this, 'AnthropicApiKey', 'image-compositor/anthropic-api-key'
);

// Agent Lambda
const agentFunction = new lambda.Function(this, 'AgentFunction', {
  runtime: lambda.Runtime.PYTHON_3_11,
  handler: 'agent_handler.handler',
  code: lambda.Code.fromAsset('lambda/python'),
  memorySize: 512,
  timeout: cdk.Duration.seconds(90),
  architecture: lambda.Architecture.ARM_64,
  environment: {
    CHAT_HISTORY_TABLE: chatHistoryTable.tableName,
    ANTHROPIC_SECRET_NAME: 'image-compositor/anthropic-api-key',
    S3_RESOURCES_BUCKET: resourcesBucket.bucketName,
    S3_UPLOAD_BUCKET: uploadBucket.bucketName,
    CLOUDFRONT_DOMAIN: distribution.distributionDomainName,
  },
  layers: [agentLayer],
});

// Lambda Layer（strands-agents, anthropic SDK）
const agentLayer = new lambda.LayerVersion(this, 'AgentDepsLayer', {
  code: lambda.Code.fromAsset('lambda/layers/agent-deps'),
  compatibleRuntimes: [lambda.Runtime.PYTHON_3_11],
  compatibleArchitectures: [lambda.Architecture.ARM_64],
  description: 'Strands Agents SDK + Anthropic SDK dependencies',
});

// API Gateway ルート追加
const chatResource = api.root.addResource('chat');
chatResource.addMethod('POST', new apigateway.LambdaIntegration(agentFunction));

const historyResource = chatResource.addResource('history');
const sessionResource = historyResource.addResource('{sessionId}');
sessionResource.addMethod('GET', new apigateway.LambdaIntegration(agentFunction));
sessionResource.addMethod('DELETE', new apigateway.LambdaIntegration(agentFunction));
```

### 4.2 IAMポリシー

```
Agent Lambda → Secrets Manager: secretsmanager:GetSecretValue
Agent Lambda → DynamoDB: PutItem, GetItem, Query, DeleteItem, BatchWriteItem
Agent Lambda → S3 (Upload): GetObject, ListObjectsV2, DeleteObject
Agent Lambda → S3 (Resources): GetObject, PutObject
Agent Lambda → CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
```

## 5. フロントエンド改修設計

### 5.1 useChatAgent.ts 改修

```typescript
// Before: regex解析 + 直接API呼び出し
// After: Agent API呼び出し

export function useChatAgent() {
  const chatStore = useChatStore()
  const configStore = useConfigStore()

  async function handleUserInput(text: string) {
    chatStore.addMessage({ role: 'user', content: text })
    const loadingId = chatStore.addLoadingMessage()

    try {
      const response = await axios.post(getChatApiEndpoint(), {
        sessionId: chatStore.sessionId,
        message: text,
      })

      const { content, media } = response.data.response
      chatStore.replaceMessage(loadingId, {
        content,
        mediaUrl: media?.data ? `data:image/png;base64,${media.data}` : media?.url,
        mediaType: media?.type,
      })
    } catch (err) {
      chatStore.replaceMessage(loadingId, {
        content: `エラーが発生しました: ${err.message}`,
      })
    }
  }

  async function loadHistory() {
    // GET /chat/history/{sessionId} を呼び出して履歴復元
  }

  async function clearHistory() {
    // DELETE /chat/history/{sessionId} で履歴削除
  }
}
```

### 5.2 stores/chat.ts 改修

```typescript
// 追加: sessionId管理
const sessionId = ref<string>(
  localStorage.getItem('chat-session-id') || crypto.randomUUID()
)

// sessionIdの永続化
watch(sessionId, (newId) => {
  localStorage.setItem('chat-session-id', newId)
})

// 新規セッション作成
function newSession() {
  sessionId.value = crypto.randomUUID()
  messages.value = []
}
```

## 6. エラーハンドリング設計

| エラーケース | 対処 | ユーザーへの応答 |
|-------------|------|----------------|
| Anthropic API 認証エラー | ログ出力、500返却 | 「サービスに接続できません。しばらくお待ちください」 |
| Anthropic API レート制限 | リトライ (1回) | 「混雑しています。少し時間をおいて再度お試しください」 |
| ツール実行エラー | エラー内容をAgentに返し判断させる | Agentが自然言語でエラーを説明 |
| DynamoDB エラー | best-effort（ログ出力のみ） | 応答自体は返却（履歴保存失敗の警告なし） |
| Lambda タイムアウト | API Gateway 504 | フロントエンドで「処理がタイムアウトしました」表示 |
| 不正なリクエスト | 400返却 | 「リクエスト形式が正しくありません」 |

## 7. セキュリティ設計

1. **APIキー**: Secrets Manager に保存、IAMロールでアクセス
2. **入力検証**: セッションID (UUID形式), メッセージ (最大2000文字)
3. **CORS**: フロントエンドドメインのみ許可（開発中は `*`）
4. **レート制限**: API Gateway使用量プラン適用
5. **DynamoDB TTL**: 7日で自動削除（データ蓄積防止）
6. **ログ**: APIキーやシークレットをログに出力しない
