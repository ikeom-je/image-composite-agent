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
POST /chat                       → エージェントにメッセージ送信
GET /chat/models                 → 利用可能モデル一覧取得
GET /chat/history/{sessionId}    → 会話履歴取得
DELETE /chat/history/{sessionId} → 会話履歴削除
"""
from strands.models.bedrock import BedrockModel

# 許可リスト方式でモデルIDを管理（インジェクション防止）
ALLOWED_MODELS = {
    'us.anthropic.claude-sonnet-4-5-20250929-v1:0': {'name': 'Claude Sonnet 4.5', 'provider': 'Anthropic', 'description': '高精度・バランス型'},
    'us.anthropic.claude-haiku-4-5-20251001-v1:0': {'name': 'Claude Haiku 4.5', 'provider': 'Anthropic', 'description': '高速・低コスト'},
    'us.amazon.nova-2-lite-v1:0':                  {'name': 'Nova 2 Lite',      'provider': 'Amazon',    'description': 'AWS製・低コスト・マルチモーダル'},
    'us.amazon.nova-micro-v1:0':                   {'name': 'Nova Micro',       'provider': 'Amazon',    'description': 'AWS製・最小コスト'},
}
_FALLBACK_MODEL_ID = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'

def create_agent(model_id: str | None = None):
    agent_model_id = model_id or DEFAULT_MODEL_ID  # DEFAULT_MODEL_IDは環境変数AGENT_MODEL_IDから（許可リスト外なら_FALLBACK_MODEL_ID）
    model = BedrockModel(
        model_id=agent_model_id,
        max_tokens=4096,
        region_name=os.environ.get('BEDROCK_REGION', 'us-east-1'),
    )
    agent = Agent(model=model, system_prompt=SYSTEM_PROMPT, tools=[...])
    return agent

def handler(event, context):
    # POST /chat, GET /chat/models, GET/DELETE /chat/history/{sessionId} のルーティング
    pass

def handle_chat(event, context):
    # 1. リクエストパース（sessionId, message, modelId）
    # 2. modelId バリデーション（ALLOWED_MODELS 外なら400 'Invalid modelId'）
    # 3. message長制限（2000文字）
    # 4. sessionId UUID形式チェック（不正なら新規発行）
    # 5. DynamoDBから会話履歴取得（best-effort）
    # 6. Strands Agent初期化（model_id指定で動的切替）
    # 7. 会話履歴をメッセージに変換してagent.messagesにセット
    # 8. Agent実行 → ツール出力（_last_media_result）からメディア抽出
    # 9. ツールハルシネーション検出（テキストにファイル名あり & media無しならリトライ）
    # 10. 応答をDynamoDBに保存（best-effort）
    # 11. レスポンス返却（modelId, modelNameを含む）
    pass

def handle_get_models(event, context):
    # ALLOWED_MODELS 一覧と default モデルIDを返却
    pass
```

#### Bedrock 推論プロファイルID形式

Strands Agents から呼び出すモデルIDは **US Cross-Region 推論プロファイルID** を使用する:

- 形式: `us.{provider}.{model-name}-{version}-v1:0`
- 例: `us.anthropic.claude-sonnet-4-5-20250929-v1:0`, `us.amazon.nova-2-lite-v1:0`
- BedrockModel の `region_name` は `us-east-1`（推論プロファイルが定義されているリージョン）

ARN形式（IAMポリシー設定用）:

```
推論プロファイルARN:
  arn:aws:bedrock:us-east-1:{account}:inference-profile/{profile-id}

基盤モデルARN（推論プロファイルが内部で呼び出すモデル、bedrock:InferenceProfileArn条件付き）:
  arn:aws:bedrock:us-east-1::foundation-model/{model-id-without-us-prefix}
  arn:aws:bedrock:us-east-2::foundation-model/{model-id-without-us-prefix}
  arn:aws:bedrock:us-west-2::foundation-model/{model-id-without-us-prefix}
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
  PK: sessionId (String)  - UUIDv4 形式
  SK: timestamp (Number)  - Unix timestamp (ミリ秒)
  Attributes:
    - role:       "user" | "assistant"
    - content:    メッセージ内容 (String)
    - media_url:  画像/動画URL (String, optional)
    - media_type: "image" | "video" | "image_list" (String, optional)
    - model_id:   使用モデルID (String, optional)
    - ttl:        TTLタイムスタンプ (Number) - Unix秒、7日後
"""

TTL_DAYS = 7

class ChatHistoryManager:
    def save_message(self, session_id, role, content, media_url=None, media_type=None, model_id=None):
        """メッセージを保存。timestampはミリ秒、ttlは秒（DynamoDB TTLの仕様）"""
        pass

    def get_history(self, session_id, limit=50):
        """会話履歴を古い順に取得（ConsistentRead=True、デフォルト最大50件）"""
        pass

    def delete_history(self, session_id):
        """会話履歴を削除（ページネーション対応・batch_writer使用）"""
        pass

    def to_agent_messages(self, history):
        """DynamoDB履歴をStrands Agentメッセージ形式に変換: [{"role": "user"/"assistant", "content": [{"text": ...}]}]"""
        pass
```

#### セッションID命名規則

| 項目 | 仕様 |
|------|------|
| 形式 | UUIDv4（小文字16進、ハイフン区切り） |
| 正規表現 | `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`（大文字小文字無視） |
| 生成元 | フロントエンドの `crypto.randomUUID()` または Lambda側の `uuid.uuid4()` |
| 永続化 | フロントエンドは `localStorage` の `chat-session-id` キーで保持 |
| 検証 | `POST /chat` で受信時にバリデーション。形式不正なら新規UUIDを内部で発行（リクエストは継続） |
| リセット | フロントエンドの「会話リセット」操作で `crypto.randomUUID()` で再生成 |

#### TTL管理仕様

| 項目 | 仕様 |
|------|------|
| TTL属性名 | `ttl` |
| 形式 | Unix epoch 秒（DynamoDB TTLの仕様準拠） |
| 値の計算 | `int(time.time()) + (7 * 24 * 60 * 60)`（保存時刻 + 7日） |
| 削除タイミング | DynamoDBが最大48時間以内にバックグラウンドで削除（即時ではない） |
| 用途 | 古い会話履歴の自動削除によるストレージコスト・PII蓄積の抑制 |

> 注: `timestamp`（SK）はミリ秒、`ttl` は秒。両者の単位が異なる点に注意。

#### セッションIDのライフサイクル

```
[初回アクセス]                        [継続利用]                            [リセット/期限切れ]
  ┌────────────────┐                   ┌────────────────┐                  ┌────────────────┐
  │ Frontend       │                   │ Frontend       │                  │ Frontend       │
  │ crypto.random  │                   │ localStorage   │                  │ 会話リセット    │
  │ UUID() で生成  │ ──保存──▶         │ から読み出し   │ ──送信──▶        │ → 新UUID生成   │
  └───────┬────────┘                   └───────┬────────┘                  └───────┬────────┘
          │ POST /chat (sessionId)             │ POST /chat (sessionId)            │
          ▼                                    ▼                                    ▼
  ┌────────────────┐                   ┌────────────────┐                  ┌────────────────┐
  │ Lambda         │                   │ Lambda         │                  │ Lambda         │
  │ UUIDv4 検証    │                   │ Query history  │                  │ 履歴は別ID扱い │
  │ → put_item     │                   │ → 履歴をAgent  │                  │ → 古いIDは     │
  │   (1件目)      │                   │   コンテキスト │                  │   TTL=7日後に  │
  │                │                   │   に投入       │                  │   自動削除     │
  └────────────────┘                   └────────────────┘                  └────────────────┘
```

#### DynamoDBクエリパターン

| 操作 | クエリ | 備考 |
|------|-------|------|
| 履歴取得 | `Query(KeyConditionExpression='sessionId = :sid', ScanIndexForward=True, ConsistentRead=True, Limit=N)` | 古い順（時系列）で取得。`ConsistentRead` で書き込み直後のレースを最小化 |
| 履歴保存 | `PutItem(Item={sessionId, timestamp, role, content, ttl, ...})` | 同一timestampはミリ秒単位なので衝突は実質的に発生しない |
| 履歴削除 | `Query` でセッション分のキーを取得 → `BatchWriter` で `DeleteItem`（ページネーション対応） | LastEvaluatedKey をループ処理 |
| アクセス制御 | なし（API Gateway認証で制御） | DynamoDB自体にはセッション所有者の概念なし |

> セキュリティ注意: セッションIDは非対称な認証情報ではない。第三者がIDを推測できれば履歴を閲覧可能。UUIDv4 のエントロピー（122ビット）が事実上の保護。

## 3. API設計

### 3.1 POST /chat - メッセージ送信

**Request**:
```json
{
  "sessionId": "uuid-v4",
  "message": "テスト画像を3枚使って合成して",
  "modelId": "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
}
```

| フィールド | 型 | 必須 | 説明 |
|-----------|----|------|------|
| `sessionId` | string (UUIDv4) | 任意 | 未指定/形式不正の場合は内部で新規発行 |
| `message`   | string | 必須 | 最大2000文字 |
| `modelId`   | string | 任意 | `ALLOWED_MODELS` のいずれか。未指定時は環境変数 `AGENT_MODEL_ID`（→ なければ `_FALLBACK_MODEL_ID`） |

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
    },
    "modelId": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "modelName": "Claude Sonnet 4.5"
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
    },
    "modelId": "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    "modelName": "Claude Sonnet 4.5"
  },
  "requestId": "uuid-v4"
}
```

**Response (エラー)**:
| HTTP | ボディ | 発生条件 |
|------|-------|---------|
| 400 | `{"error": "Invalid modelId. Use GET /chat/models to see available models."}` | `modelId` が `ALLOWED_MODELS` 外 |
| 400 | `{"error": "message is required"}` | `message` 空 |
| 400 | `{"error": "message must be 2000 characters or less"}` | 2000文字超過 |
| 403 | `{"error": "モデル「<name>」へのアクセスが許可されていません。..."}` | Bedrock `AccessDeniedException` |
| 500 | `{"error": "エージェントの処理中にエラーが発生しました。..."}` | その他のエラー |

### 3.2 GET /chat/models - 利用可能モデル一覧

許可リスト方式で管理されているモデル一覧を返却する。フロントエンドのモデル選択ドロップダウンが起動時に取得する。

**Response**:
```json
{
  "models": [
    { "id": "us.anthropic.claude-sonnet-4-5-20250929-v1:0", "name": "Claude Sonnet 4.5", "provider": "Anthropic", "description": "高精度・バランス型" },
    { "id": "us.anthropic.claude-haiku-4-5-20251001-v1:0", "name": "Claude Haiku 4.5", "provider": "Anthropic", "description": "高速・低コスト" },
    { "id": "us.amazon.nova-2-lite-v1:0",                  "name": "Nova 2 Lite",      "provider": "Amazon",    "description": "AWS製・低コスト・マルチモーダル" },
    { "id": "us.amazon.nova-micro-v1:0",                   "name": "Nova Micro",       "provider": "Amazon",    "description": "AWS製・最小コスト" }
  ],
  "default": "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
}
```

**動的モデル選択の流れ**:
1. フロントエンド起動時に `GET /chat/models` でリストとデフォルトIDを取得
2. ユーザーが選択したモデルIDを `POST /chat` の `modelId` に含めて送信
3. Agent Lambda は `ALLOWED_MODELS` で検証 → BedrockModel に渡してAgent生成
4. レスポンスに `modelId`, `modelName` を含めてフロントに返却（履歴表示用）

### 3.3 GET /chat/history/{sessionId}

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

### 3.4 DELETE /chat/history/{sessionId}

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
    BEDROCK_REGION: process.env.BEDROCK_REGION || 'us-east-1',
    S3_RESOURCES_BUCKET: resourcesBucket.bucketName,
    S3_UPLOAD_BUCKET: uploadBucket.bucketName,
    UPLOAD_BUCKET: uploadBucket.bucketName,
    TEST_BUCKET: testImagesBucket.bucketName,
  },
});

// API Gateway ルート追加
const chatResource = api.root.addResource('chat');
chatResource.addMethod('POST', new apigateway.LambdaIntegration(agentFunction));

const modelsResource = chatResource.addResource('models');
modelsResource.addMethod('GET', new apigateway.LambdaIntegration(agentFunction));

const historyResource = chatResource.addResource('history');
const sessionResource = historyResource.addResource('{sessionId}');
sessionResource.addMethod('GET', new apigateway.LambdaIntegration(agentFunction));
sessionResource.addMethod('DELETE', new apigateway.LambdaIntegration(agentFunction));
```

#### 環境変数（Agent Lambda）

| 変数名 | 用途 | デフォルト |
|-------|------|----------|
| `AGENT_MODEL_ID` | デフォルト推論プロファイルID。`ALLOWED_MODELS` 外なら内部フォールバック | `us.anthropic.claude-sonnet-4-5-20250929-v1:0` |
| `BEDROCK_REGION` | BedrockModel の `region_name` | `us-east-1` |
| `CHAT_HISTORY_TABLE` | DynamoDB会話履歴テーブル名 | (CDKスタックから注入) |
| `S3_UPLOAD_BUCKET` / `UPLOAD_BUCKET` | アップロード画像バケット | (CDKスタックから注入) |
| `S3_RESOURCES_BUCKET` | 合成出力バケット | (CDKスタックから注入) |
| `TEST_BUCKET` | テスト画像バケット | (CDKスタックから注入) |
| `CLOUDFRONT_DOMAIN` | CloudFrontドメイン（メディアURL生成用） | (CDKスタックから注入) |

### 4.2 IAMポリシー

```
Agent Lambda → Bedrock: bedrock:InvokeModel, bedrock:InvokeModelWithResponseStream
                        （US推論プロファイル + 基盤モデル、bedrock:InferenceProfileArn条件付き）
Agent Lambda → AWS Marketplace: aws-marketplace:ViewSubscriptions, Subscribe, Unsubscribe
                        （Bedrockモデルの自動サブスクリプション用）
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
        modelId: chatStore.effectiveModelId || undefined,  // Settings画面で選択中のモデルID
      })

      const { content, media, modelId, modelName } = response.data.response
      chatStore.replaceMessage(loadingId, {
        content,
        mediaUrl: media?.data ? `data:image/png;base64,${media.data}` : media?.url,
        mediaType: media?.type,
        modelId,
        modelName,
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

| エラーケース | HTTP | 対処 | ユーザーへの応答 |
|-------------|------|------|----------------|
| Bedrock `AccessDeniedException`（モデル未有効化） | 403 | ログ出力、modelId/modelNameを含めて返却 | 「モデル「<modelName>」へのアクセスが許可されていません。Bedrockコンソールでモデルアクセスを有効化してください。」 |
| Bedrock API その他のエラー（認証・接続失敗等） | 500 | ログ出力、500返却 | 「エージェントの処理中にエラーが発生しました。しばらくお待ちください。」 |
| ツールハルシネーション検出（テキストにファイル名あり & media無し） | 200 | 明示的指示で1回リトライ | リトライ後の応答を返却 |
| ツール実行エラー | 200 | エラー内容をAgentに返し判断させる | Agentが自然言語でエラーを説明 |
| DynamoDB エラー（履歴の保存・取得失敗） | 200 | best-effort（ログ出力のみ） | 応答自体は返却（履歴保存失敗の警告なし） |
| Lambda タイムアウト（90秒超過） | 504 | API Gateway 504 | フロントエンドで「処理がタイムアウトしました」表示 |
| 不正なJSON | 400 | 400返却 | `Invalid JSON in request body` |
| `modelId` が `ALLOWED_MODELS` 外 | 400 | バリデーション失敗 | `Invalid modelId. Use GET /chat/models to see available models.` |
| `message` 空 / 2000文字超過 | 400 | バリデーション失敗 | `message is required` / `message must be 2000 characters or less` |

## 7. セキュリティ設計

1. **モデル認証**: AWS Bedrock IAMロールベース認証（APIキー不要）
2. **入力検証**: セッションID (UUID形式), メッセージ (最大2000文字)
3. **CORS**: フロントエンドドメインのみ許可（開発中は `*`）
4. **レート制限**: API Gateway使用量プラン適用
5. **DynamoDB TTL**: 7日で自動削除（データ蓄積防止）
6. **ログ**: シークレットをログに出力しない
