<template>
  <div class="example-cards-section">
    <h2>📋 使用例</h2>
    <p class="section-description">
      以下の例をクリックすると、設定が自動的に読み込まれます。そのまま「画像を合成」ボタンを押して結果を確認できます。
    </p>
    
    <div class="examples-grid">
      <!-- 2画像合成の例 -->
      <div class="example-category">
        <h3>2画像合成</h3>
        <div class="example-cards">
          <div
            v-for="example in twoImageExamples"
            :key="example.id"
            class="example-card"
            @click="loadExample(example)"
            :class="{ active: selectedExample?.id === example.id }"
          >
            <div class="example-header">
              <h4>{{ example.title }}</h4>
              <span class="example-badge">2画像</span>
            </div>
            <p class="example-description">{{ example.description }}</p>
            <div class="example-preview">
              <div class="preview-layout">
                <div
                  v-for="(image, index) in example.images"
                  :key="index"
                  class="preview-image"
                  :style="getPreviewImageStyle(image, index)"
                  :title="`画像${index + 1}: ${image.source}`"
                >
                  {{ index + 1 }}
                </div>
              </div>
            </div>
            <div class="example-params">
              <small>
                キャンバス: {{ example.canvas.width }}x{{ example.canvas.height }}px
              </small>
            </div>
          </div>
        </div>
      </div>

      <!-- 3画像合成の例 -->
      <div class="example-category">
        <h3>3画像合成 (新機能)</h3>
        <div class="example-cards">
          <div
            v-for="example in threeImageExamples"
            :key="example.id"
            class="example-card"
            @click="loadExample(example)"
            :class="{ active: selectedExample?.id === example.id }"
          >
            <div class="example-header">
              <h4>{{ example.title }}</h4>
              <span class="example-badge new">3画像</span>
            </div>
            <p class="example-description">{{ example.description }}</p>
            <div class="example-preview">
              <div class="preview-layout">
                <div
                  v-for="(image, index) in example.images"
                  :key="index"
                  class="preview-image"
                  :style="getPreviewImageStyle(image, index)"
                  :title="`画像${index + 1}: ${image.source}`"
                >
                  {{ index + 1 }}
                </div>
              </div>
            </div>
            <div class="example-params">
              <small>
                キャンバス: {{ example.canvas.width }}x{{ example.canvas.height }}px
              </small>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 選択された例の詳細 -->
    <div v-if="selectedExample" class="selected-example-details">
      <h3>選択された例: {{ selectedExample.title }}</h3>
      <div class="example-details-grid">
        <div class="detail-section">
          <h4>設定内容</h4>
          <ul>
            <li><strong>合成モード:</strong> {{ selectedExample.images.length }}画像合成</li>
            <li><strong>キャンバスサイズ:</strong> {{ selectedExample.canvas.width }}x{{ selectedExample.canvas.height }}px</li>
            <li><strong>出力フォーマット:</strong> {{ selectedExample.format.toUpperCase() }}</li>
          </ul>
        </div>
        <div class="detail-section">
          <h4>画像配置</h4>
          <ul>
            <li v-for="(image, index) in selectedExample.images" :key="index">
              <strong>画像{{ index + 1 }}:</strong>
              {{ image.source }} ({{ image.x }}, {{ image.y }}) {{ image.width }}x{{ image.height }}px
            </li>
          </ul>
        </div>
      </div>
      <div class="example-actions">
        <button
          class="btn btn-primary"
          @click="applyAndCompose"
          :disabled="isLoading"
        >
          {{ isLoading ? '合成中...' : 'この例で画像を合成' }}
        </button>
        <button
          class="btn btn-secondary"
          @click="clearSelection"
        >
          選択をクリア
        </button>
      </div>
    </div>
  </div>
</template>

<script>
import { ref, computed } from 'vue'

export default {
  name: 'ExampleCards',
  props: {
    isLoading: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['load-example', 'apply-and-compose'],
  setup(props, { emit }) {
    // リアクティブデータ
    const selectedExample = ref(null)

    // 2画像合成の例
    const twoImageExamples = ref([
      {
        id: 'basic-2-images',
        title: '基本的な2画像合成',
        description: 'シンプルな2画像の横並び配置',
        images: [
          { source: 'test', x: 200, y: 200, width: 400, height: 400 },
          { source: 'test', x: 800, y: 200, width: 400, height: 400 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
      {
        id: 'overlapping-2-images',
        title: '重なり合う2画像',
        description: '画像を部分的に重ねて配置',
        images: [
          { source: 'test', x: 300, y: 150, width: 500, height: 500 },
          { source: 'test', x: 600, y: 250, width: 500, height: 500 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
      {
        id: 'size-variation-2-images',
        title: 'サイズ違いの2画像',
        description: '大小異なるサイズの画像を組み合わせ',
        images: [
          { source: 'test', x: 100, y: 100, width: 600, height: 600 },
          { source: 'test', x: 900, y: 300, width: 300, height: 300 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
      {
        id: 'vertical-2-images',
        title: '縦並び2画像',
        description: '画像を縦に配置したレイアウト',
        images: [
          { source: 'test', x: 500, y: 50, width: 400, height: 300 },
          { source: 'test', x: 500, y: 450, width: 400, height: 300 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
    ])

    // 3画像合成の例
    const threeImageExamples = ref([
      {
        id: 'basic-3-images',
        title: '基本的な3画像合成',
        description: '3つの画像を三角形状に配置',
        images: [
          { source: 'test', x: 100, y: 100, width: 300, height: 300 },
          { source: 'test', x: 500, y: 100, width: 300, height: 300 },
          { source: 'test', x: 300, y: 400, width: 300, height: 300 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
      {
        id: 'horizontal-3-images',
        title: '横並び3画像',
        description: '3つの画像を水平に並べて配置',
        images: [
          { source: 'test', x: 150, y: 250, width: 350, height: 350 },
          { source: 'test', x: 600, y: 250, width: 350, height: 350 },
          { source: 'test', x: 1050, y: 250, width: 350, height: 350 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
      {
        id: 'layered-3-images',
        title: '重層的3画像',
        description: '画像を重ねて奥行きのある配置',
        images: [
          { source: 'test', x: 200, y: 150, width: 500, height: 400 },
          { source: 'test', x: 500, y: 200, width: 400, height: 350 },
          { source: 'test', x: 800, y: 250, width: 350, height: 300 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
      {
        id: 'size-mix-3-images',
        title: 'サイズミックス3画像',
        description: '大中小の異なるサイズで配置',
        images: [
          { source: 'test', x: 100, y: 100, width: 600, height: 500 },
          { source: 'test', x: 800, y: 150, width: 400, height: 350 },
          { source: 'test', x: 1300, y: 300, width: 250, height: 200 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
      {
        id: 'creative-3-images',
        title: 'クリエイティブ配置',
        description: '創造的で動的な3画像レイアウト',
        images: [
          { source: 'test', x: 300, y: 50, width: 400, height: 300 },
          { source: 'test', x: 50, y: 400, width: 350, height: 400 },
          { source: 'test', x: 900, y: 300, width: 450, height: 350 },
        ],
        canvas: { width: 2000, height: 1000 },
        format: 'png',
      },
    ])

    // メソッド
    const loadExample = (example) => {
      selectedExample.value = example
      emit('load-example', example)
    }

    const clearSelection = () => {
      selectedExample.value = null
    }

    const applyAndCompose = () => {
      if (selectedExample.value) {
        emit('apply-and-compose', selectedExample.value)
      }
    }

    const getPreviewImageStyle = (image, index) => {
      const colors = ['#ef4444', '#3b82f6', '#10b981'] // 赤、青、緑
      
      // キャンバスサイズに対する相対位置とサイズを計算 (1/10スケール)
      const scale = 0.05
      
      return {
        position: 'absolute',
        left: `${image.x * scale}px`,
        top: `${image.y * scale}px`,
        width: `${image.width * scale}px`,
        height: `${image.height * scale}px`,
        backgroundColor: colors[index] || '#6b7280',
        color: 'white',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '8px',
        fontWeight: 'bold',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: '1px',
        opacity: 0.9,
      }
    }

    return {
      // データ
      selectedExample,
      twoImageExamples,
      threeImageExamples,
      
      // メソッド
      loadExample,
      clearSelection,
      applyAndCompose,
      getPreviewImageStyle,
    }
  },
}
</script>

<style scoped>
.example-cards-section {
  margin-bottom: 32px;
  padding: 24px;
  background: #f8f9fa;
  border-radius: 12px;
  border: 1px solid #e1e5e9;
}

.example-cards-section h2 {
  font-size: 1.5rem;
  margin-bottom: 12px;
  color: #333;
  display: flex;
  align-items: center;
  gap: 8px;
}

.section-description {
  color: #6c757d;
  margin-bottom: 24px;
  line-height: 1.5;
}

.examples-grid {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.example-category h3 {
  font-size: 1.3rem;
  margin-bottom: 16px;
  color: #495057;
  border-bottom: 2px solid #667eea;
  padding-bottom: 8px;
}

.example-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
}

.example-card {
  background: white;
  border: 2px solid #e1e5e9;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: all 0.3s ease;
  position: relative;
}

.example-card:hover {
  border-color: #667eea;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.15);
  transform: translateY(-2px);
}

.example-card.active {
  border-color: #667eea;
  background: #f8f9ff;
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
}

.example-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 8px;
}

.example-header h4 {
  font-size: 1rem;
  margin: 0;
  color: #333;
  flex: 1;
}

.example-badge {
  background: #667eea;
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.example-badge.new {
  background: linear-gradient(135deg, #10b981, #059669);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}

.example-description {
  color: #6c757d;
  font-size: 0.9rem;
  margin-bottom: 12px;
  line-height: 1.4;
}

.example-preview {
  margin-bottom: 12px;
}

.preview-layout {
  position: relative;
  width: 100px;
  height: 50px;
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  margin: 0 auto;
  overflow: hidden;
}

.preview-image {
  cursor: pointer;
  transition: opacity 0.3s ease;
}

.preview-image:hover {
  opacity: 1 !important;
  z-index: 10;
}

.example-params {
  text-align: center;
  color: #6c757d;
}

.selected-example-details {
  margin-top: 32px;
  padding: 24px;
  background: white;
  border-radius: 8px;
  border: 2px solid #667eea;
}

.selected-example-details h3 {
  margin-bottom: 20px;
  color: #333;
  font-size: 1.2rem;
}

.example-details-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.detail-section {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 6px;
}

.detail-section h4 {
  margin-bottom: 12px;
  color: #495057;
  font-size: 1rem;
}

.detail-section ul {
  margin: 0;
  padding-left: 16px;
  font-size: 0.9rem;
  color: #6c757d;
}

.detail-section li {
  margin-bottom: 6px;
}

.example-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

/* レスポンシブデザイン */
@media (max-width: 768px) {
  .example-cards-section {
    padding: 20px;
  }
  
  .example-cards {
    grid-template-columns: 1fr;
  }
  
  .example-card {
    padding: 14px;
  }
  
  .example-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .example-badge {
    align-self: flex-end;
  }
  
  .example-details-grid {
    grid-template-columns: 1fr;
  }
  
  .example-actions {
    flex-direction: column;
  }
  
  .example-actions .btn {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .example-cards-section {
    padding: 16px;
  }
  
  .selected-example-details {
    padding: 20px;
  }
  
  .detail-section {
    padding: 12px;
  }
  
  .preview-layout {
    width: 80px;
    height: 40px;
  }
}
</style>