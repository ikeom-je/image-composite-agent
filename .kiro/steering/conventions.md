---
inclusion: auto
---

# コード規約

## 一般原則

- 明確で自己文書化されたコードを書く
- 巧妙さよりも可読性を優先
- 関数を小さく集中させる
- 意味のある名前を使用
- 複雑なロジックのみコメント
- DRY原則に従う（Don't Repeat Yourself）
- YAGNI原則に従う（You Aren't Gonna Need It）

## Python規約（Lambda）

### スタイルガイド
- PEP 8に従う
- 行の長さ: 100文字
- インデント: スペース4つ
- エンコーディング: UTF-8

### 命名
```python
# 変数と関数: snake_case
image_data = fetch_image()
def process_image(img):
    pass

# クラス: PascalCase
class ImageProcessor:
    pass

# 定数: UPPER_SNAKE_CASE
MAX_IMAGE_SIZE = 5242880
DEFAULT_TIMEOUT = 30

# プライベート: アンダースコアで始まる
def _internal_helper():
    pass
```

### 型ヒント
```python
from typing import Dict, List, Optional, Any

def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    pass

def fetch_image(url: str) -> Optional[Image.Image]:
    pass
```

### Docstring
```python
def create_composite_image(base: Image.Image, 
                          img1: Image.Image,
                          params: Dict[str, int]) -> Image.Image:
    """
    ベース画像とオーバーレイ画像から合成画像を作成。
    
    Args:
        base: ベース画像（透明の場合はNone可）
        img1: 最初のオーバーレイ画像
        params: 位置とサイズのパラメータ
        
    Returns:
        RGBAモードの合成PIL画像
        
    Raises:
        ImageProcessingError: 合成が失敗した場合
    """
    pass
```

### エラーハンドリング
```python
# カスタム例外を使用
class ImageProcessingError(Exception):
    pass

# 特定のエラーハンドリング
try:
    result = process_image(img)
except ImageProcessingError as e:
    logger.error(f"処理失敗: {e}")
    raise
except Exception as e:
    logger.error(f"予期しないエラー: {e}")
    raise ImageProcessingError(f"失敗: {e}")
```

### ログ記録
```python
import logging
logger = logging.getLogger(__name__)

# 適切なレベルを使用
logger.debug("詳細なデバッグ情報")
logger.info("一般情報")
logger.warning("警告メッセージ")
logger.error("エラーが発生")

# コンテキストを含める
logger.info(f"画像処理中: {filename} [リクエストID: {request_id}]")
```

## TypeScript規約（CDK & フロントエンド）

### スタイルガイド
- ESLint設定を使用
- 行の長さ: 100文字
- インデント: スペース2つ
- セミコロン: 必須

### 命名
```typescript
// 変数と関数: camelCase
const imageUrl = getImageUrl()
function processImage(img: Image): void {}

// クラスとインターフェース: PascalCase
class ImageProcessor {}
interface ImageConfig {}

// 定数: UPPER_SNAKE_CASEまたはcamelCase
const MAX_IMAGE_SIZE = 5242880
const defaultTimeout = 30

// 型エイリアス: PascalCase
type ImageData = {...}

// Enum: PascalCase
enum ImageFormat {
  PNG = 'png',
  JPEG = 'jpeg'
}
```

### 型アノテーション
```typescript
// 常に明示的な型を使用
function buildApiUrl(config: ImageConfig): string {
  return `${config.baseUrl}/images`
}

// オブジェクトにはインターフェースを使用
interface ImageConfig {
  source: string
  x: number
  y: number
  width: number
  height: number
}

// 適切な場合はreadonlyを使用
interface Config {
  readonly apiUrl: string
  readonly version: string
}
```

### Vue 3 Composition API
```typescript
// script setupを使用
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// リアクティブ状態
const count = ref(0)
const imageUrl = ref('')

// 算出プロパティ
const doubleCount = computed(() => count.value * 2)

// メソッド
const handleClick = () => {
  count.value++
}

// ライフサイクル
onMounted(() => {
  console.log('コンポーネントがマウントされました')
})
</script>
```

### Async/Await
```typescript
// Promiseよりasync/awaitを優先
async function fetchImage(url: string): Promise<Blob> {
  try {
    const response = await axios.get(url, { responseType: 'blob' })
    return response.data
  } catch (error) {
    console.error('取得失敗:', error)
    throw error
  }
}
```

## CDK規約

### スタック構成
```typescript
export class ImageProcessorApiStack extends cdk.Stack {
  // パブリックプロパティを最初に
  public readonly apiEndpoint: string
  
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)
    
    // 関連リソースをグループ化
    // 1. S3バケット
    // 2. Lambda関数
    // 3. API Gateway
    // 4. CloudFront
    // 5. 監視
  }
}
```

### リソース命名
```typescript
// 説明的なIDを使用
const bucket = new s3.Bucket(this, 'ImageResourcesBucket', {
  // 論理ID: ImageResourcesBucket
  // 物理名: 自動生成
})

// 再利用可能な値には定数を使用
const VERSION = packageJson.version
```

### コメント
```typescript
// 「何を」ではなく「なぜ」を説明
// コスト削減のためCloudWatchログ保持期間を1週間に設定
const logGroup = new logs.LogGroup(this, 'LogGroup', {
  retention: logs.RetentionDays.ONE_WEEK
})
```

## ファイル構成

### Pythonモジュール
```
lambda/python/
├── handler.py              # メインエントリーポイント
├── image_processor.py      # コアロジック
├── image_compositor.py     # 合成ロジック
├── image_fetcher.py        # 取得ロジック
├── error_handler.py        # エラーハンドリング
└── requirements.txt        # 依存関係
```

### Vueコンポーネント
```
frontend/src/components/
├── ImageUploader.vue       # 1ファイル1コンポーネント
├── ImageSelector.vue       # PascalCase命名
└── ResultDisplay.vue       # 説明的な名前
```

## コメント

### コメントすべき場合
- 複雑なアルゴリズム
- 明白でないビジネスロジック
- バグの回避策
- パフォーマンス最適化
- セキュリティ上の考慮事項

### コメントすべきでない場合
- 明白なコード
- 冗長な情報
- 古いコメント
- コメントアウトされたコード（削除する）

### 良いコメント
```python
# 1920x1080キャンバスの中央に画像を配置するための位置を計算
x = (1920 - width) // 2

# 回避策: Pillow v10.0.0でLANCZOSが非推奨
img.resize((width, height), Image.Resampling.LANCZOS)
```

### 悪いコメント
```python
# xを100に設定
x = 100

# 画像をループ
for img in images:
    pass
```

## コードフォーマット

### Python
```bash
# blackを使用（設定されている場合）
black lambda/python/

# または手動でPEP 8に従う
```

### TypeScript/Vue
```bash
# ESLintを使用
npm run lint

# 自動修正
npm run lint -- --fix
```

## インポート構成

### Python
```python
# 標準ライブラリ
import json
import logging
from typing import Dict, Any

# サードパーティ
import boto3
from PIL import Image

# ローカル
from image_fetcher import fetch_images_parallel
from error_handler import ImageProcessingError
```

### TypeScript
```typescript
// Vue/フレームワーク
import { ref, computed } from 'vue'

// サードパーティ
import axios from 'axios'

// ローカル - 絶対インポート
import { useAppStore } from '@/stores/app'
import type { ImageConfig } from '@/types'
```

## 定数

### Python
```python
# モジュールレベル
# VERSION の値は CDK から環境変数で注入される（package.json 由来、現在のバージョンは product.md を参照）
VERSION = os.environ.get('VERSION', 'unknown')
MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5MB
DEFAULT_CANVAS_SIZE = (1920, 1080)
```

### TypeScript
```typescript
// モジュールレベルまたは別の定数ファイル
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024
export const DEFAULT_TIMEOUT = 30000
export const API_BASE_URL = import.meta.env.VITE_API_URL
```

## ドキュメント規約

### history.md の役割

`history.md`（リポジトリルート）は、プロジェクトの **経緯（why／context）** を残すドキュメント。実装の「結果（what）」は git log から復元できるが、「なぜそう判断したか」「どんな背景・代替案・トレードオフがあったか」は commit message では十分記録できない。`history.md` はその欠落を補うために維持する。

#### 役割の書き分け

| ドキュメント | 主な内容 | 粒度 |
|-------------|---------|------|
| `git log` / commit message | 結果（what） | コミット単位 |
| GitHub Releases | リリースノート（GH UI から作成） | リリース単位 |
| `history.md` | **経緯（why）** | 大きな機能・設計判断単位 |

> `CHANGELOG.md` は採用しない。リリースノートは GitHub Releases、経緯は `history.md` で役割分担する。

#### 更新タイミング

- 新機能の追加・大きな設計変更・後方互換性に関わる判断を行ったとき
- 単純なバグ修正や微小なリファクタには不要（commit message で十分）
- **リリース粒度ではなく判断粒度**で書く

#### 書き方

```markdown
## YYYY-MM-DD: <変更タイトル> (Issue #N)

### <サブセクション>
- **<コンポーネント名>**: <変更内容と why>
- **<決定事項>**: <選択した案／代替案を退けた理由>

### テスト
- <テスト追加内容>
```

#### 留意点

- リリースノート形式（Keep a Changelog 等）に寄せない
- 既存履歴は追記方式で更新（過去エントリの大幅な書き換えは避ける）
- `history.md` で十分な内容を steering / specs に二重化しない（Single Source of Truth）
