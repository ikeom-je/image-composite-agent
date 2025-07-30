# 第3画像合成機能 - 設計書

## 概要

既存の画像合成REST APIシステムに第3の画像合成機能を追加する設計。現在の2画像合成システムを拡張し、3つの画像を同時に合成できるようにする。後方互換性を完全に保持しながら、新しい三角形テスト画像の追加とフロントエンドUIの拡張を行う。

## アーキテクチャ

### システム拡張概要
```
既存システム (2画像合成)
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │───▶│   AWS Lambda     │───▶│   Amazon S3     │
│ /images/        │    │  image_processor │    │ - circle_red    │
│ composite       │    │  + image1        │    │ - rectangle_blue│
│ ?image1=...     │    │  + image2        │    │ - aws-logo      │
│ &image2=...     │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘

拡張システム (3画像合成)
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   API Gateway   │───▶│   AWS Lambda     │───▶│   Amazon S3     │
│ /images/        │    │  image_processor │    │ - circle_red    │
│ composite       │    │  + image1        │    │ - rectangle_blue│
│ ?image1=...     │    │  + image2        │    │ - aws-logo      │
│ &image2=...     │    │  + image3 (NEW)  │    │ - triangle_green│
│ &image3=... (NEW)│   │                  │    │   (NEW)         │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### データフロー拡張
1. **パラメータ解析**: image3パラメータの追加解析
2. **画像取得**: 3つの画像の並列取得（既存の2つ + 新しい1つ）
3. **画像合成**: 3層合成処理（base → image1 → image2 → image3）
4. **レスポンス生成**: 3画像対応のHTML/PNG出力

## コンポーネント設計

### 1. Lambda関数の拡張

#### 1.1 三角形画像生成機能
```python
def generate_triangle_image(size: Tuple[int, int] = (400, 400), 
                          color: Tuple[int, int, int] = (34, 197, 94)) -> Image.Image:
    """
    緑色の三角形画像を生成する
    
    Args:
        size: 画像サイズ (width, height)
        color: RGB色値 (デフォルト: 緑色)
        
    Returns:
        PIL.Image.Image: 透過背景の三角形画像
    """
    # RGBA画像を作成（透過背景）
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 三角形の頂点を計算
    width, height = size
    triangle_points = [
        (width // 2, height // 4),      # 上の頂点
        (width // 4, height * 3 // 4),  # 左下の頂点
        (width * 3 // 4, height * 3 // 4)  # 右下の頂点
    ]
    
    # 三角形を描画（アンチエイリアス対応）
    draw.polygon(triangle_points, fill=(*color, 255))
    
    return img
```

#### 1.2 画像取得エンジンの拡張
```python
def fetch_image(url_or_s3_path: str, image_type: str = "unknown") -> Image.Image:
    """
    既存の画像取得機能を拡張してimage3に対応
    """
    # テスト画像指定の場合
    if url_or_s3_path == "test":
        test_bucket = os.environ.get('TEST_BUCKET', 'test-images')
        
        # 画像タイプに応じてテスト画像を選択
        if image_type == "baseImage":
            return fetch_image_from_s3(test_bucket, "images/aws-logo.png")
        elif image_type == "image1":
            return fetch_image_from_s3(test_bucket, "images/circle_red.png")
        elif image_type == "image2":
            return fetch_image_from_s3(test_bucket, "images/rectangle_blue.png")
        elif image_type == "image3":  # 新規追加
            return fetch_image_from_s3(test_bucket, "images/triangle_green.png")
        else:
            return fetch_image_from_s3(test_bucket, "images/aws-logo.png")
    
    # 既存のS3/HTTP処理は変更なし
    # ...
```

#### 1.3 画像合成エンジンの拡張
```python
def create_composite_image(base_img: Image.Image, 
                          image1: Image.Image, 
                          image2: Image.Image,
                          image3: Optional[Image.Image],  # 新規追加
                          img1_params: Dict[str, Any], 
                          img2_params: Dict[str, Any],
                          img3_params: Optional[Dict[str, Any]]) -> Image.Image:  # 新規追加
    """
    ベース画像に2つまたは3つの画像を合成する（後方互換性対応）
    
    Args:
        base_img: ベース画像
        image1: 合成する1つ目の画像
        image2: 合成する2つ目の画像
        image3: 合成する3つ目の画像（オプション）
        img1_params: 1つ目の画像の配置パラメータ
        img2_params: 2つ目の画像の配置パラメータ
        img3_params: 3つ目の画像の配置パラメータ（オプション）
        
    Returns:
        PIL.Image.Image: 合成された画像
    """
    logger.info(f"Creating composite image with {3 if image3 else 2} images")
    
    # ベース画像のコピーを作成
    composite = base_img.copy()
    
    # 既存の2画像合成処理
    img1_resized = image1.resize((img1_params['width'], img1_params['height']), Image.LANCZOS)
    img2_resized = image2.resize((img2_params['width'], img2_params['height']), Image.LANCZOS)
    
    # アルファチャンネル対応の合成
    if img1_resized.mode == 'RGBA':
        composite.paste(img1_resized, (img1_params['x'], img1_params['y']), img1_resized)
    else:
        composite.paste(img1_resized, (img1_params['x'], img1_params['y']))
    
    if img2_resized.mode == 'RGBA':
        composite.paste(img2_resized, (img2_params['x'], img2_params['y']), img2_resized)
    else:
        composite.paste(img2_resized, (img2_params['x'], img2_params['y']))
    
    # 第3画像の合成（新規追加）
    if image3 and img3_params:
        logger.info(f"Adding third image at position ({img3_params['x']}, {img3_params['y']})")
        img3_resized = image3.resize((img3_params['width'], img3_params['height']), Image.LANCZOS)
        
        if img3_resized.mode == 'RGBA':
            composite.paste(img3_resized, (img3_params['x'], img3_params['y']), img3_resized)
        else:
            composite.paste(img3_resized, (img3_params['x'], img3_params['y']))
    
    logger.info("Composite image created successfully")
    return composite
```

#### 1.4 ハンドラー関数の拡張
```python
def handler(event, context):
    """
    Lambda ハンドラー関数 - 3画像合成対応版
    """
    try:
        # 既存のパラメータ取得
        query_params = event.get('queryStringParameters', {}) or {}
        
        # 既存パラメータ
        base_image_param = query_params.get('baseImage')
        image1_param = query_params.get('image1')
        image2_param = query_params.get('image2')
        
        # 新規パラメータ（オプション）
        image3_param = query_params.get('image3')  # 新規追加
        
        # 必須パラメータの確認（image1, image2は必須、image3はオプション）
        if not image1_param or not image2_param:
            return format_response(400, {'error': 'image1 and image2 parameters are required'})
        
        # 第3画像のパラメータ取得（デフォルト値あり）
        if image3_param:
            try:
                img3_width = int(query_params.get('image3Width', 300))
                img3_height = int(query_params.get('image3Height', 200))
                img3_x = int(query_params.get('image3X', 20))  # 左上デフォルト
                img3_y = int(query_params.get('image3Y', 20))
            except ValueError:
                logger.warning("Invalid image3 numeric parameters, using defaults")
                img3_width = 300
                img3_height = 200
                img3_x = 20
                img3_y = 20
        
        # 画像の並列取得（2つまたは3つ）
        with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
            future_to_path = {
                executor.submit(fetch_image, image1_path, "image1"): 'image1',
                executor.submit(fetch_image, image2_path, "image2"): 'image2'
            }
            
            # 第3画像が指定されている場合のみ追加
            if image3_param:
                image3_path = normalize_path(image3_param)
                future_to_path[executor.submit(fetch_image, image3_path, "image3")] = 'image3'
            
            # 結果の取得
            images = {}
            for future in concurrent.futures.as_completed(future_to_path):
                name = future_to_path[future]
                try:
                    images[name] = future.result()
                    logger.info(f"✅ Successfully loaded {name}")
                except Exception as e:
                    logger.error(f"❌ Error loading image {name}: {e}")
                    return format_response(500, {'error': f"Failed to load {name}: {str(e)}"})
        
        # 第3画像のパラメータ設定
        img3_params = None
        if image3_param and 'image3' in images:
            img3_params = {
                'width': img3_width,
                'height': img3_height,
                'x': img3_x,
                'y': img3_y
            }
        
        # 画像合成（2つまたは3つ）
        composite_img = create_composite_image(
            base_img, 
            images['image1'], 
            images['image2'],
            images.get('image3'),  # オプション
            img1_params, 
            img2_params,
            img3_params  # オプション
        )
        
        # 既存のレスポンス生成処理
        # ...
        
    except Exception as e:
        # 既存のエラーハンドリング
        # ...
```

### 2. 三角形画像生成スクリプト

#### 2.1 画像生成スクリプト
```python
# scripts/generate_triangle_image.py
from PIL import Image, ImageDraw
import os

def generate_triangle_image():
    """三角形テスト画像を生成する"""
    size = (400, 400)
    color = (34, 197, 94)  # 緑色 (Tailwind green-500)
    
    # RGBA画像を作成（透過背景）
    img = Image.new('RGBA', size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # 三角形の頂点を計算
    width, height = size
    triangle_points = [
        (width // 2, height // 4),      # 上の頂点
        (width // 4, height * 3 // 4),  # 左下の頂点
        (width * 3 // 4, height * 3 // 4)  # 右下の頂点
    ]
    
    # 三角形を描画
    draw.polygon(triangle_points, fill=(*color, 255))
    
    # 保存
    output_path = 'lambda/python/images/triangle_green.png'
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')
    
    print(f"✅ 三角形画像を生成しました: {output_path}")
    return output_path

if __name__ == "__main__":
    generate_triangle_image()
```

### 3. フロントエンド拡張

#### 3.1 Vue.jsコンポーネントの拡張
```vue
<template>
  <div class="form-container">
    <!-- 画像選択セクション -->
    <div class="form-group">
      <label class="form-label">ベース画像:</label>
      <select v-model="params.baseImage" class="form-select">
        <option value="test">テスト画像 (AWS Logo)</option>
        <option value="transparent">透明背景</option>
      </select>
    </div>
    
    <!-- 3画像の選択と設定を横並びテーブル形式で表示 -->
    <div class="images-config-section">
      <h3 class="text-lg font-semibold mb-4">画像設定</h3>
      
      <!-- 画像選択テーブル -->
      <div class="overflow-x-auto mb-6">
        <table class="w-full border-collapse border border-gray-300">
          <thead>
            <tr class="bg-gray-100">
              <th class="border border-gray-300 px-4 py-2 text-left">画像</th>
              <th class="border border-gray-300 px-4 py-2 text-left">画像1 (必須)</th>
              <th class="border border-gray-300 px-4 py-2 text-left">画像2 (必須)</th>
              <th class="border border-gray-300 px-4 py-2 text-left">画像3 (オプション)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="border border-gray-300 px-4 py-2 font-medium">画像選択</td>
              <td class="border border-gray-300 px-4 py-2">
                <select v-model="params.image1" class="form-select w-full">
                  <option value="test">テスト画像 (円)</option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/circle_red.png`">
                    S3: circle_red.png
                  </option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/rectangle_blue.png`">
                    S3: rectangle_blue.png
                  </option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/triangle_green.png`">
                    S3: triangle_green.png
                  </option>
                </select>
              </td>
              <td class="border border-gray-300 px-4 py-2">
                <select v-model="params.image2" class="form-select w-full">
                  <option value="test">テスト画像 (四角)</option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/circle_red.png`">
                    S3: circle_red.png
                  </option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/rectangle_blue.png`">
                    S3: rectangle_blue.png
                  </option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/triangle_green.png`">
                    S3: triangle_green.png
                  </option>
                </select>
              </td>
              <td class="border border-gray-300 px-4 py-2">
                <select v-model="params.image3" class="form-select w-full">
                  <option value="">選択しない</option>
                  <option value="test">テスト画像 (三角)</option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/circle_red.png`">
                    S3: circle_red.png
                  </option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/rectangle_blue.png`">
                    S3: rectangle_blue.png
                  </option>
                  <option :value="`s3://${config?.s3BucketNames?.testImages}/images/triangle_green.png`">
                    S3: triangle_green.png
                  </option>
                </select>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      
      <!-- 位置・サイズ設定テーブル -->
      <div class="overflow-x-auto mb-6">
        <table class="w-full border-collapse border border-gray-300">
          <thead>
            <tr class="bg-gray-100">
              <th class="border border-gray-300 px-4 py-2 text-left">設定項目</th>
              <th class="border border-gray-300 px-4 py-2 text-left">画像1</th>
              <th class="border border-gray-300 px-4 py-2 text-left">画像2</th>
              <th class="border border-gray-300 px-4 py-2 text-left" :class="{ 'bg-gray-200': !params.image3 }">
                画像3 {{ params.image3 ? '' : '(無効)' }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td class="border border-gray-300 px-4 py-2 font-medium">X座標</td>
              <td class="border border-gray-300 px-4 py-2">
                <input v-model.number="params.image1X" type="number" class="form-input w-full" />
              </td>
              <td class="border border-gray-300 px-4 py-2">
                <input v-model.number="params.image2X" type="number" class="form-input w-full" />
              </td>
              <td class="border border-gray-300 px-4 py-2" :class="{ 'bg-gray-100': !params.image3 }">
                <input v-model.number="params.image3X" type="number" class="form-input w-full" 
                       :disabled="!params.image3" />
              </td>
            </tr>
            <tr>
              <td class="border border-gray-300 px-4 py-2 font-medium">Y座標</td>
              <td class="border border-gray-300 px-4 py-2">
                <input v-model.number="params.image1Y" type="number" class="form-input w-full" />
              </td>
              <td class="border border-gray-300 px-4 py-2">
                <input v-model.number="params.image2Y" type="number" class="form-input w-full" />
              </td>
              <td class="border border-gray-300 px-4 py-2" :class="{ 'bg-gray-100': !params.image3 }">
                <input v-model.number="params.image3Y" type="number" class="form-input w-full" 
                       :disabled="!params.image3" />
              </td>
            </tr>
            <tr>
              <td class="border border-gray-300 px-4 py-2 font-medium">幅</td>
              <td class="border border-gray-300 px-4 py-2">
                <input v-model.number="params.image1Width" type="number" class="form-input w-full" />
              </td>
              <td class="border border-gray-300 px-4 py-2">
                <input v-model.number="params.image2Width" type="number" class="form-input w-full" />
              </td>
              <td class="border border-gray-300 px-4 py-2" :class="{ 'bg-gray-100': !params.image3 }">
                <input v-model.number="params.image3Width" type="number" class="form-input w-full" 
                       :disabled="!params.image3" />
              </td>
            </tr>
            <tr>
              <td class="border border-gray-300 px-4 py-2 font-medium">高さ</td>
              <td class="border border-gray-300 px-4 py-2">
                <input v-model.number="params.image1Height" type="number" class="form-input w-full" />
              </td>
              <td class="border border-gray-300 px-4 py-2">
                <input v-model.number="params.image2Height" type="number" class="form-input w-full" />
              </td>
              <td class="border border-gray-300 px-4 py-2" :class="{ 'bg-gray-100': !params.image3 }">
                <input v-model.number="params.image3Height" type="number" class="form-input w-full" 
                       :disabled="!params.image3" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    
    <!-- 出力形式選択 -->
    <div class="form-group">
      <label class="form-label">出力形式:</label>
      <select v-model="params.format" class="form-select">
        <option value="html">HTML表示</option>
        <option value="png">PNG直接ダウンロード</option>
      </select>
    </div>
    
    <!-- 画像生成ボタン（目立つデザイン） -->
    <div class="generate-button-section text-center my-8">
      <button 
        @click="generateImage" 
        :disabled="isLoading || !params.image1 || !params.image2"
        class="generate-button"
      >
        <span v-if="isLoading" class="flex items-center justify-center">
          <svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          生成中...
        </span>
        <span v-else class="flex items-center justify-center">
          🎨 {{ params.image3 ? '3画像を合成' : '2画像を合成' }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.generate-button {
  @apply bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 
         text-white font-bold py-4 px-8 rounded-lg text-lg shadow-lg 
         transform transition-all duration-200 hover:scale-105 hover:shadow-xl
         disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none;
  min-width: 200px;
  min-height: 56px;
}

.generate-button:not(:disabled):hover {
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
}

.images-config-section {
  @apply bg-gray-50 p-6 rounded-lg border border-gray-200;
}

.form-input:disabled {
  @apply bg-gray-100 text-gray-400 cursor-not-allowed;
}

.overflow-x-auto {
  scrollbar-width: thin;
  scrollbar-color: #cbd5e0 #f7fafc;
}

.overflow-x-auto::-webkit-scrollbar {
  height: 8px;
}

.overflow-x-auto::-webkit-scrollbar-track {
  background: #f7fafc;
}

.overflow-x-auto::-webkit-scrollbar-thumb {
  background-color: #cbd5e0;
  border-radius: 4px;
}
</style>

<script>
export default {
  data() {
    return {
      params: {
        // 既存パラメータ
        baseImage: 'test',
        image1: 'test',
        image2: 'test',
        
        // 新規パラメータ
        image3: '',  // オプション
        image3X: 20,
        image3Y: 20,
        image3Width: 300,
        image3Height: 200,
        
        // その他既存パラメータ
        // ...
      },
      
      // 3画像合成の使用例
      examples: [
        {
          title: '基本的な3画像合成',
          description: '円・四角・三角の3つの図形を合成',
          params: {
            baseImage: 'test',
            image1: 'test',
            image2: 'test',
            image3: 'test',
            image1X: 1600, image1Y: 20,
            image2X: 1600, image2Y: 240,
            image3X: 20, image3Y: 20
          }
        },
        {
          title: 'S3画像を使用した3画像合成',
          description: 'S3に保存された画像を使用',
          params: {
            baseImage: 'test',
            image1: 's3://bucket/images/circle_red.png',
            image2: 's3://bucket/images/rectangle_blue.png',
            image3: 's3://bucket/images/triangle_green.png'
          }
        }
      ]
    };
  },
  
  methods: {
    buildApiUrl() {
      const url = new URL(this.apiBaseUrl);
      
      // 既存パラメータの設定
      if (this.params.baseImage) url.searchParams.set('baseImage', this.params.baseImage);
      url.searchParams.set('image1', this.params.image1);
      url.searchParams.set('image2', this.params.image2);
      
      // 新規: image3パラメータの設定
      if (this.params.image3) {
        url.searchParams.set('image3', this.params.image3);
        url.searchParams.set('image3X', this.params.image3X);
        url.searchParams.set('image3Y', this.params.image3Y);
        url.searchParams.set('image3Width', this.params.image3Width);
        url.searchParams.set('image3Height', this.params.image3Height);
      }
      
      // その他既存パラメータ
      // ...
      
      return url.toString();
    }
  }
};
</script>
```

#### 3.2 使用例の拡張
```javascript
// 3画像合成の使用例を追加
const threeImageExamples = [
  {
    title: '🎨 基本的な3画像合成',
    description: '円・四角・三角の3つの図形を合成',
    params: {
      baseImage: 'test',
      image1: 'test',
      image2: 'test',
      image3: 'test',
      image1X: 1600, image1Y: 20, image1Width: 300, image1Height: 200,
      image2X: 1600, image2Y: 240, image2Width: 300, image2Height: 200,
      image3X: 20, image3Y: 20, image3Width: 300, image3Height: 200
    }
  },
  {
    title: '🔺 三角形を中央配置',
    description: '三角形を画面中央に大きく配置',
    params: {
      baseImage: 'transparent',
      image1: 'test',
      image2: 'test',
      image3: 'test',
      image1X: 100, image1Y: 100,
      image2X: 1500, image2Y: 100,
      image3X: 800, image3Y: 400, image3Width: 400, image3Height: 300
    }
  }
];
```

### 4. HTMLレスポンスの拡張

#### 4.1 3画像対応のHTML表示
```python
def generate_html_response(base64_image: str, composite_img: Image.Image, img_byte_arr: bytes,
                          img1_params: Dict[str, Any], img2_params: Dict[str, Any],
                          img3_params: Optional[Dict[str, Any]],  # 新規追加
                          base_image_param: str, image1_param: str, image2_param: str,
                          image3_param: Optional[str],  # 新規追加
                          test_bucket: str) -> str:
    """
    3画像対応のHTML レスポンスを生成する
    """
    
    # 画像数の判定
    image_count = 3 if image3_param else 2
    
    # パラメータテーブルの生成
    params_table_rows = f"""
        <tr><td>Image1</td><td>({img1_params['x']}, {img1_params['y']})</td><td>{img1_params['width']} x {img1_params['height']}</td></tr>
        <tr><td>Image2</td><td>({img2_params['x']}, {img2_params['y']})</td><td>{img2_params['width']} x {img2_params['height']}</td></tr>
    """
    
    if img3_params:
        params_table_rows += f"""
        <tr><td>Image3</td><td>({img3_params['x']}, {img3_params['y']})</td><td>{img3_params['width']} x {img3_params['height']}</td></tr>
        """
    
    # リソース情報の生成
    resource_info = f"""
        <li><strong>テストバケット:</strong> {test_bucket}</li>
        <li><strong>ベース画像:</strong> {base_image_param or "透明背景"}</li>
        <li><strong>合成画像1:</strong> {image1_param}</li>
        <li><strong>合成画像2:</strong> {image2_param}</li>
    """
    
    if image3_param:
        resource_info += f"""
        <li><strong>合成画像3:</strong> {image3_param}</li>
        """
    
    # API使用例の生成
    api_examples = f"""
        <p><strong>基本的な{image_count}画像合成:</strong> <code>?baseImage=test&image1=test&image2=test{"&image3=test" if image3_param else ""}</code></p>
        <p><strong>PNG直接:</strong> <code>?baseImage=test&image1=test&image2=test{"&image3=test" if image3_param else ""}&format=png</code></p>
        <p><strong>S3パス使用:</strong> <code>?image1=s3://bucket/circle&image2=s3://bucket/rectangle{"&image3=s3://bucket/triangle" if image3_param else ""}</code></p>
    """
    
    return f"""
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>🎨 画像合成API v2.3.0 - {image_count}画像合成対応</title>
        <!-- 既存のスタイル -->
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🎨 画像合成API v2.3.0 - {image_count}画像合成成功！</h1>
                <p>高性能・アルファチャンネル対応の{image_count}画像合成システム</p>
            </div>
            
            <div class="status-grid">
                <div class="status-item">
                    <span class="icon">✅</span> {image_count}画像合成: 成功
                </div>
                <div class="status-item">
                    <span class="icon">✅</span> 三角形画像: 対応
                </div>
                <div class="status-item">
                    <span class="icon">✅</span> 後方互換性: 保持
                </div>
                <div class="status-item">
                    <span class="icon">✅</span> アルファ合成: 成功
                </div>
            </div>
            
            <!-- 既存の画像表示部分 -->
            
            <div class="info-grid">
                <div class="info-card">
                    <h3>🎯 合成パラメータ ({image_count}画像)</h3>
                    <table class="params-table">
                        <tr><th>画像</th><th>位置 (X, Y)</th><th>サイズ (W x H)</th></tr>
                        {params_table_rows}
                    </table>
                </div>
                
                <!-- 既存の技術情報 -->
            </div>
            
            <div class="info-card">
                <h3>☁️ S3リソース情報</h3>
                <ul>
                    {resource_info}
                </ul>
            </div>
            
            <div class="api-examples">
                <h3>🔗 API使用例 ({image_count}画像対応)</h3>
                {api_examples}
            </div>
        </div>
        
        <!-- 既存のJavaScript -->
    </body>
    </html>
    """
```

## データモデル

### APIリクエストモデルの拡張
```typescript
interface ImageCompositeRequest {
  // 既存の必須パラメータ
  image1: string;
  image2: string;
  
  // 新規オプションパラメータ
  image3?: string;  // 第3画像（オプション）
  
  // 既存のオプションパラメータ
  baseImage?: string;
  format?: 'html' | 'png';
  
  // 既存の画像1、画像2パラメータ
  image1X?: number;
  image1Y?: number;
  image1Width?: number;
  image1Height?: number;
  image2X?: number;
  image2Y?: number;
  image2Width?: number;
  image2Height?: number;
  
  // 新規: 画像3の配置パラメータ
  image3X?: number;     // X座標（デフォルト: 20）
  image3Y?: number;     // Y座標（デフォルト: 20）
  image3Width?: number; // 幅（デフォルト: 300）
  image3Height?: number;// 高さ（デフォルト: 200）
}
```

### Lambda関数内部モデルの拡張
```python
@dataclass
class CompositeImageRequest:
    base_image_path: Optional[str]
    image1_path: str
    image2_path: str
    image3_path: Optional[str]  # 新規追加
    img1_params: ImageParams
    img2_params: ImageParams
    img3_params: Optional[ImageParams]  # 新規追加
    format: str
```

### フロントエンド状態モデルの拡張
```typescript
interface AppState {
  // 既存の状態
  params: ImageCompositeRequest;
  
  // 新規: 3画像合成の使用例
  threeImageExamples: Example[];
  
  // 既存の状態
  isLoading: boolean;
  error: string | null;
  resultUrl: string;
}

interface Example {
  title: string;
  description: string;
  params: ImageCompositeRequest;  // image3を含む可能性
}
```

## エラーハンドリング

### 1. 後方互換性エラー対応
```python
def validate_parameters(query_params: Dict[str, str]) -> Tuple[bool, str]:
    """
    パラメータの検証（後方互換性対応）
    
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    # 必須パラメータの確認
    if not query_params.get('image1') or not query_params.get('image2'):
        return False, 'image1 and image2 parameters are required'
    
    # image3はオプションなので検証しない
    
    # 数値パラメータの検証
    numeric_params = [
        'image1X', 'image1Y', 'image1Width', 'image1Height',
        'image2X', 'image2Y', 'image2Width', 'image2Height',
        'image3X', 'image3Y', 'image3Width', 'image3Height'  # 新規追加
    ]
    
    for param in numeric_params:
        value = query_params.get(param)
        if value is not None:
            try:
                int(value)
            except ValueError:
                return False, f'Invalid numeric parameter: {param}={value}'
    
    return True, ''
```

### 2. 画像取得エラー対応
```python
def fetch_images_parallel(image_paths: Dict[str, str]) -> Dict[str, Image.Image]:
    """
    複数画像の並列取得（エラーハンドリング強化）
    """
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_to_path = {}
        
        for name, path in image_paths.items():
            if path:  # パスが指定されている場合のみ
                future_to_path[executor.submit(fetch_image, path, name)] = name
        
        images = {}
        for future in concurrent.futures.as_completed(future_to_path):
            name = future_to_path[future]
            try:
                images[name] = future.result()
                logger.info(f"✅ Successfully loaded {name}")
            except Exception as e:
                logger.error(f"❌ Error loading image {name}: {e}")
                raise ValueError(f"Failed to load {name}: {str(e)}")
        
        return images
```

### 3. フロントエンドエラー対応
```javascript
async generateImage() {
  try {
    // API URL構築時の検証
    if (!this.params.image1 || !this.params.image2) {
      this.error = 'image1とimage2は必須パラメータです';
      return;
    }
    
    // image3が指定されている場合の追加検証
    if (this.params.image3) {
      if (!this.params.image3X || !this.params.image3Y) {
        this.error = 'image3を指定する場合は位置パラメータも必要です';
        return;
      }
    }
    
    const apiUrl = this.buildApiUrl();
    const response = await axios.get(apiUrl, { responseType: 'blob' });
    
    // 既存のレスポンス処理
    // ...
    
  } catch (error) {
    // 3画像合成特有のエラーハンドリング
    if (error.response?.status === 400 && error.response?.data?.includes('image3')) {
      this.error = '第3画像の処理でエラーが発生しました。パラメータを確認してください。';
    } else {
      // 既存のエラーハンドリング
      this.error = error.message || 'Unknown error';
    }
  }
}
```

## テスト戦略

### 1. Lambda関数ユニットテスト拡張
```python
class TestThirdImageComposition(unittest.TestCase):
    def test_three_image_composition(self):
        """3画像合成処理のテスト"""
        # テスト用画像の準備
        base_img = Image.new('RGBA', (1920, 1080), (255, 255, 255, 255))
        image1 = Image.new('RGBA', (300, 200), (255, 0, 0, 255))
        image2 = Image.new('RGBA', (300, 200), (0, 255, 0, 255))
        image3 = Image.new('RGBA', (300, 200), (0, 0, 255, 255))
        
        # パラメータ設定
        img1_params = {'x': 100, 'y': 100, 'width': 300, 'height': 200}
        img2_params = {'x': 500, 'y': 100, 'width': 300, 'height': 200}
        img3_params = {'x': 300, 'y': 400, 'width': 300, 'height': 200}
        
        # 3画像合成実行
        result = create_composite_image(base_img, image1, image2, image3,
                                      img1_params, img2_params, img3_params)
        
        # 結果検証
        self.assertEqual(result.size, (1920, 1080))
        self.assertEqual(result.mode, 'RGBA')
    
    def test_backward_compatibility(self):
        """後方互換性のテスト（image3なし）"""
        # 既存の2画像合成が正常動作することを確認
        # ...
    
    def test_triangle_image_generation(self):
        """三角形画像生成のテスト"""
        triangle = generate_triangle_image()
        self.assertEqual(triangle.size, (400, 400))
        self.assertEqual(triangle.mode, 'RGBA')
        
        # 透過背景の確認
        has_transparency = any(p[3] < 255 for p in triangle.getdata())
        self.assertTrue(has_transparency)
```

### 2. API統合テスト拡張
```typescript
test.describe('3画像合成API', () => {
  test('基本的な3画像合成', async ({ request }) => {
    const response = await request.get('/images/composite?baseImage=test&image1=test&image2=test&image3=test');
    expect(response.status()).toBe(200);
    
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/html');
  });
  
  test('2画像合成の後方互換性', async ({ request }) => {
    const response = await request.get('/images/composite?baseImage=test&image1=test&image2=test');
    expect(response.status()).toBe(200);
    
    // 既存の2画像合成が正常動作することを確認
  });
  
  test('image3のみオプション', async ({ request }) => {
    const response = await request.get('/images/composite?image1=test&image2=test&image3=test');
    expect(response.status()).toBe(200);
  });
  
  test('三角形画像の使用', async ({ request }) => {
    const response = await request.get('/images/composite?image1=test&image2=test&image3=test');
    expect(response.status()).toBe(200);
    
    const body = await response.text();
    expect(body).toContain('triangle_green.png');
  });
});
```

### 3. フロントエンドE2Eテスト拡張
```typescript
test.describe('3画像合成フロントエンド', () => {
  test('第3画像選択フォームの表示', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 第3画像選択フォームが表示されることを確認
    await expect(page.locator('select[v-model="params.image3"]')).toBeVisible();
    await expect(page.locator('option:has-text("テスト画像 (三角形)")')).toBeVisible();
  });
  
  test('3画像合成の実行', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 第3画像を選択
    await page.selectOption('select[v-model="params.image3"]', 'test');
    
    // 画像生成実行
    await page.click('button:has-text("画像を生成")');
    
    // 結果画像が表示されることを確認
    await expect(page.locator('.result-image')).toBeVisible();
  });
  
  test('3画像合成使用例の動作', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 3画像合成の使用例をクリック
    await page.click('.example-card:has-text("基本的な3画像合成")');
    
    // パラメータが設定されることを確認
    const image3Value = await page.inputValue('select[v-model="params.image3"]');
    expect(image3Value).toBe('test');
    
    // 結果画像が表示されることを確認
    await expect(page.locator('.result-image')).toBeVisible();
  });
});
```

## 実装手順

### Phase 1: 三角形画像の生成と配置
1. **三角形画像生成スクリプトの作成**
   - Pillowを使用した三角形画像生成機能
   - 透過背景対応のPNG出力
   - lambda/python/imagesディレクトリへの保存

2. **S3への画像アップロード**
   - 既存のアップロードスクリプトの拡張
   - triangle_green.pngの追加

### Phase 2: Lambda関数の拡張
1. **画像取得エンジンの拡張**
   - image3タイプの追加
   - 三角形画像の自動選択機能

2. **画像合成エンジンの拡張**
   - 3画像合成処理の実装
   - 後方互換性の保持

3. **ハンドラー関数の拡張**
   - image3パラメータの処理
   - 3画像並列取得の実装

### Phase 3: フロントエンドの拡張
1. **UIコンポーネントの拡張**
   - 第3画像選択フォームの追加
   - 位置・サイズ調整フォームの追加

2. **API通信機能の拡張**
   - image3パラメータの送信
   - URL構築ロジックの拡張

3. **使用例の追加**
   - 3画像合成プリセットの作成

### Phase 4: テストの実装
1. **ユニットテストの拡張**
   - 3画像合成処理のテスト
   - 後方互換性のテスト

2. **E2Eテストの拡張**
   - API統合テスト
   - フロントエンドUIテスト

### Phase 5: デプロイと検証
1. **システムデプロイ**
   - CDKスタックの更新
   - 三角形画像のアップロード

2. **動作検証**
   - 3画像合成機能の確認
   - 後方互換性の確認

## パフォーマンス考慮事項

### 1. 並列処理の最適化
- 3画像の並列取得による処理時間の最小化
- ThreadPoolExecutorのmax_workersを3に拡張
- 画像取得失敗時の適切なエラーハンドリング

### 2. メモリ使用量の管理
- 3つの画像を同時にメモリに保持する際の最適化
- 不要な画像オブジェクトの適切な解放
- Lambda関数のメモリ設定の見直し

### 3. レスポンス時間の維持
- 3画像合成でも既存の2画像合成と同等の処理時間を維持
- 画像合成アルゴリズムの効率化
- 不要な処理の削減

## セキュリティ考慮事項

### 1. パラメータ検証の強化
- image3パラメータの適切な検証
- 数値パラメータの範囲チェック
- 不正なS3パスの検出

### 2. リソース制限の維持
- 3画像処理でもリソース使用量の制限を維持
- DoS攻撃対策の継続
- 適切なタイムアウト設定

### 3. 後方互換性の保証
- 既存APIユーザーへの影響なし
- セキュリティレベルの維持
- 権限設定の変更なし