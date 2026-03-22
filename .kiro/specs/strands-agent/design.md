# Strands Agent チャットエージェント - 設計書

## 1. システムアーキテクチャ

```
┌──────────────────┐       POST /chat         ┌─────────────────────┐
│   Frontend       │  ─────────────────────→  │   Agent Lambda      │
│   ChatPage.vue   │  ←─────────────────────  │   (Python 3.12)     │
│   (Vue.js 3)     │       JSON Response       │   Strands Agent SDK │
└──────────────────┘                           └──────────┬──────────┘
       │                                                   │
       │ GET /chat/history/{id}            ┌───────────────┼────────────────┐
       │ DELETE /chat/history/{id}         │               │                │
       │                              ┌────▼─────┐  ┌─────▼──────┐  ┌─────▼──────┐
       └──────────────────────────→   │ AWS      │  │ DynamoDB   │  │ 既存API    │
                                      │ Bedrock  │  │ ChatHistory│  │ (内部呼出) │
                                      │ Claude   │  │ Table      │  └─────┬──────┘
                                      │ 4.5      │  └────────────┘        │
                                      └──────────┘                  ┌─────┼──────┐
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
from strands.models.bedrock import BedrockModel

def create_agent():
    agent_model_id = os.environ.get('AGENT_MODEL_ID', 'us.anthropic.claude-sonnet-4-5-20250929-v1:0')
    model = BedrockModel(
        model_id=agent_model_id,
        max_tokens=4096,
        region_name="us-east-1",
    )
    agent = Agent(model=model, system_prompt=SYSTEM_PROMPT, tools=[...])
    return agent

def handler(event, context):
    # POST /chat, GET/DELETE /chat/history/{sessionId} のルーティング
    pass

def handle_chat(event, context):
    # 1. リクエストパース（sessionId, message）
    # 2. DynamoDBから会話履歴取得
    # 3. Strands Agent初期化（BedrockModel + tools + system_prompt）
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
) -> dict:
    """画像を合成する。出力は常にPNG形式。"""
    pass

@tool
def generate_video(
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
    duration: int = 3,
    video_format: str = "MP4"
) -> dict:
    """画像を合成して動画を生成する。合成パラメータと動画パラメータを一括指定。"""
    pass

@tool
def list_uploaded_images() -> dict:
    """アップロード済み画像の一覧を取得する。"""
    pass

@tool
def delete_uploaded_image(image_key: str) -> dict:
    """アップロード済み画像を削除する。"""
    pass

@tool
def get_help(topic: str = "") -> str:
    """使い方やヘルプ情報を取得する。"""
    pass
```

### 2.4 agent_prompts.py - システムプロンプト

```python
SYSTEM_PROMPT = """あなたは画像合成アシスタントです。ユーザーの自然言語による指示を理解し、
ツールを使って画像の合成・動画生成・アセット管理を行います。

## キャンバス仕様
- サイズ: 1920x1080 固定
- 座標系: 左上が (0, 0)、右下が (1920, 1080)

## 位置の解釈ガイド
- 「左上」→ (50, 50)
- 「右上」→ (1470, 50)
- 「中央」→ (710, 290)
- 「左下」→ (50, 630)
- 「右下」→ (1470, 630)
- 「中央上」→ (710, 50)
- 「中央下」→ (710, 630)
- 「左中央」→ (50, 290)
- 「右中央」→ (1470, 290)

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
    - role: "user" | "assistant"
    - content: メッセージ内容 (String)
    - media_url: 画像/動画URL (String, optional)
    - media_type: "image" | "video" (String, optional)
    - ttl: TTLタイムスタンプ (Number) - 7日後
"""

class ChatHistoryManager:
    def save_message(self, session_id, role, content, media_url=None, media_type=None):
        """メッセージを保存"""
        pass

    def get_history(self, session_id, limit=50):
        """会話履歴を取得（最新N件）"""
        pass

    def delete_history(self, session_id):
        """会話履歴を削除（ページネーション対応）"""
        pass

    def to_agent_messages(self, history):
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
  "sessionId": "uuid-v4",
  "deletedCount": 10
}
```

## 4. CDKインフラ設計

### 4.1 新規リソース

```typescript
// DynamoDB テーブル
const chatHistoryTable = new dynamodb.Table(this, 'ChatHistoryTable', {
  partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
  sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
  timeToLiveAttribute: 'ttl',
});

// Agent Lambda（依存パッケージはDocker bundlingでインライン含む）
const agentFunction = new lambda.Function(this, 'AgentFunction', {
  runtime: lambda.Runtime.PYTHON_3_12,
  architecture: lambda.Architecture.ARM_64,
  handler: 'agent_handler.handler',
  code: lambda.Code.fromAsset('lambda/python', {
    bundling: {
      image: lambda.Runtime.PYTHON_3_12.bundlingImage,
      command: ['bash', '-c', 'pip install strands-agents anthropic pillow boto3 opentelemetry-sdk ... -t /asset-output && cp *.py /asset-output/'],
    },
  }),
  memorySize: 2048,
  timeout: cdk.Duration.seconds(90),
  environment: {
    CHAT_HISTORY_TABLE: chatHistoryTable.tableName,
    AGENT_MODEL_ID: process.env.AGENTMODEL || 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    S3_RESOURCES_BUCKET: resourcesBucket.bucketName,
    S3_UPLOAD_BUCKET: uploadBucket.bucketName,
    UPLOAD_BUCKET: uploadBucket.bucketName,
    TEST_BUCKET: testImagesBucket.bucketName,
  },
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
Agent Lambda → Bedrock: bedrock:InvokeModel, bedrock:InvokeModelWithResponseStream
                        （US推論プロファイル + 基盤モデル）
Agent Lambda → AWS Marketplace: aws-marketplace:ViewSubscriptions
Agent Lambda → DynamoDB: PutItem, GetItem, Query, DeleteItem, BatchWriteItem
Agent Lambda → S3 (Upload): GetObject, ListObjectsV2, DeleteObject
Agent Lambda → S3 (Resources): GetObject, PutObject
Agent Lambda → CloudWatch Logs: CreateLogGroup, CreateLogStream, PutLogEvents
```

## 5. フロントエンド改修設計

### 5.1 useChatAgent.ts 改修

```typescript
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

  async function loadHistory() { /* GET /chat/history/{sessionId} */ }
  async function clearHistory() { /* DELETE /chat/history/{sessionId} */ }
}
```

### 5.2 stores/chat.ts 改修

```typescript
const sessionId = ref<string>(
  localStorage.getItem('chat-session-id') || crypto.randomUUID()
)

watch(sessionId, (newId) => {
  localStorage.setItem('chat-session-id', newId)
})

function newSession() {
  sessionId.value = crypto.randomUUID()
  messages.value = []
}
```

## 6. エラーハンドリング設計

| エラーケース | 対処 | ユーザーへの応答 |
|-------------|------|----------------|
| Bedrock API 認証/アクセスエラー | ログ出力、500返却 | 「サービスに接続できません。しばらくお待ちください」 |
| Bedrock API スロットリング | リトライ (1回) | 「混雑しています。少し時間をおいて再度お試しください」 |
| ツール実行エラー | エラー内容をAgentに返し判断させる | Agentが自然言語でエラーを説明 |
| DynamoDB エラー | best-effort（ログ出力のみ） | 応答自体は返却（履歴保存失敗の警告なし） |
| Lambda タイムアウト | API Gateway 504 | フロントエンドで「処理がタイムアウトしました」表示 |
| 不正なリクエスト | 400返却 | 「リクエスト形式が正しくありません」 |

## 7. セキュリティ設計

1. **モデル認証**: AWS Bedrock IAMロールベース認証（APIキー不要）
2. **入力検証**: セッションID (UUID形式), メッセージ (最大2000文字)
3. **CORS**: フロントエンドドメインのみ許可（開発中は `*`）
4. **レート制限**: API Gateway使用量プラン適用
5. **DynamoDB TTL**: 7日で自動削除（データ蓄積防止）
6. **ログ**: シークレットをログに出力しない
