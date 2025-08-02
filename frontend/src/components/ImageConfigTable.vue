<template>
  <div class="image-config-container">
    <h3 class="section-title">画像設定</h3>

    <!-- 画像選択テーブル -->
    <div class="table-container mb-6">
      <table class="config-table">
        <thead>
          <tr>
            <th>画像</th>
            <th>画像1 (必須)</th>
            <th :class="{ 'disabled-header': !hasImage2 }">
              画像2 {{ hasImage2 ? '(オプション)' : '(未選択)' }}
            </th>
            <th :class="{ 'disabled-header': !hasImage3 }">
              画像3 {{ hasImage3 ? '(オプション)' : '(未選択)' }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="row-header">画像選択</td>
            <td>
              <ImageSelector
                v-model="imageConfigs.image1.source"
                label=""
                image-type="image1"
                :required="true"
                @update:modelValue="updateConfig('image1', 'source', $event)"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage2 }">
              <ImageSelector
                v-model="imageConfigs.image2.source"
                label=""
                image-type="image2"
                :required="false"
                @update:modelValue="updateConfig('image2', 'source', $event)"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage3 }">
              <ImageSelector
                v-model="imageConfigs.image3.source"
                label=""
                image-type="image3"
                :required="false"
                @update:modelValue="updateConfig('image3', 'source', $event)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- 位置・サイズ設定テーブル -->
    <div class="table-container mb-6">
      <table class="config-table">
        <thead>
          <tr>
            <th>設定項目</th>
            <th>画像1</th>
            <th :class="{ 'disabled-header': !hasImage2 }">
              画像2 {{ hasImage2 ? '' : '(無効)' }}
            </th>
            <th :class="{ 'disabled-header': !hasImage3 }">
              画像3 {{ hasImage3 ? '' : '(無効)' }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="row-header">X座標</td>
            <td>
              <input
                type="number"
                :value="imageConfigs.image1.x"
                @input="updateConfig('image1', 'x', parseInt($event.target.value))"
                class="form-input"
                min="0"
                max="1920"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage2 }">
              <input
                type="number"
                :value="imageConfigs.image2.x"
                @input="updateConfig('image2', 'x', parseInt($event.target.value))"
                class="form-input"
                min="0"
                max="1920"
                :disabled="!hasImage2"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage3 }">
              <input
                type="number"
                :value="imageConfigs.image3.x"
                @input="updateConfig('image3', 'x', parseInt($event.target.value))"
                class="form-input"
                min="0"
                max="1920"
                :disabled="!hasImage3"
              />
            </td>
          </tr>
          <tr>
            <td class="row-header">Y座標</td>
            <td>
              <input
                type="number"
                :value="imageConfigs.image1.y"
                @input="updateConfig('image1', 'y', parseInt($event.target.value))"
                class="form-input"
                min="0"
                max="1080"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage2 }">
              <input
                type="number"
                :value="imageConfigs.image2.y"
                @input="updateConfig('image2', 'y', parseInt($event.target.value))"
                class="form-input"
                min="0"
                max="1080"
                :disabled="!hasImage2"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage3 }">
              <input
                type="number"
                :value="imageConfigs.image3.y"
                @input="updateConfig('image3', 'y', parseInt($event.target.value))"
                class="form-input"
                min="0"
                max="1080"
                :disabled="!hasImage3"
              />
            </td>
          </tr>
          <tr>
            <td class="row-header">幅</td>
            <td>
              <input
                type="number"
                :value="imageConfigs.image1.width"
                @input="updateConfig('image1', 'width', parseInt($event.target.value))"
                class="form-input"
                min="10"
                max="1920"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage2 }">
              <input
                type="number"
                :value="imageConfigs.image2.width"
                @input="updateConfig('image2', 'width', parseInt($event.target.value))"
                class="form-input"
                min="10"
                max="1920"
                :disabled="!hasImage2"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage3 }">
              <input
                type="number"
                :value="imageConfigs.image3.width"
                @input="updateConfig('image3', 'width', parseInt($event.target.value))"
                class="form-input"
                min="10"
                max="1920"
                :disabled="!hasImage3"
              />
            </td>
          </tr>
          <tr>
            <td class="row-header">高さ</td>
            <td>
              <input
                type="number"
                :value="imageConfigs.image1.height"
                @input="updateConfig('image1', 'height', parseInt($event.target.value))"
                class="form-input"
                min="10"
                max="1080"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage2 }">
              <input
                type="number"
                :value="imageConfigs.image2.height"
                @input="updateConfig('image2', 'height', parseInt($event.target.value))"
                class="form-input"
                min="10"
                max="1080"
                :disabled="!hasImage2"
              />
            </td>
            <td :class="{ 'disabled-cell': !hasImage3 }">
              <input
                type="number"
                :value="imageConfigs.image3.height"
                @input="updateConfig('image3', 'height', parseInt($event.target.value))"
                class="form-input"
                min="10"
                max="1080"
                :disabled="!hasImage3"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- キャンバスプレビュー -->
    <div class="canvas-preview-container">
      <h3>レイアウトプレビュー</h3>
      <div class="canvas-preview" ref="canvasPreview">
        <div
          v-for="(config, key) in visibleImageConfigs"
          :key="key"
          class="preview-image"
          :class="`preview-${key}`"
          :style="getCanvasPreviewStyle(key, config)"
          :title="`${key}: ${config.x}, ${config.y} (${config.width}x${config.height})`"
        >
          {{ key.replace('image', '') }}
        </div>
      </div>
      <div class="canvas-info">
        <small>キャンバスサイズ: 1920 x 1080px (縮小表示)</small>
      </div>
    </div>

    <!-- バリデーションメッセージ -->
    <div v-if="validationErrors.length > 0" class="validation-errors">
      <h4>⚠️ 入力エラー:</h4>
      <ul>
        <li v-for="error in validationErrors" :key="error">{{ error }}</li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ImageSelector from './ImageSelector.vue'

// Props
interface Props {
  imageConfigs: {
    image1: {
      source: string
      x: number
      y: number
      width: number
      height: number
    }
    image2: {
      source: string
      x: number
      y: number
      width: number
      height: number
    }
    image3: {
      source: string
      x: number
      y: number
      width: number
      height: number
    }
  }
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  'update-config': [imageKey: string, field: string, value: any]
}>()

// Computed
const hasImage2 = computed(() => {
  return props.imageConfigs.image2.source && props.imageConfigs.image2.source.trim() !== ''
})

const hasImage3 = computed(() => {
  return props.imageConfigs.image3.source && props.imageConfigs.image3.source.trim() !== ''
})

const visibleImageConfigs = computed(() => {
  const configs: any = {
    image1: props.imageConfigs.image1,
  }
  
  if (hasImage2.value) {
    configs.image2 = props.imageConfigs.image2
  }
  
  if (hasImage3.value) {
    configs.image3 = props.imageConfigs.image3
  }
  
  return configs
})

const validationErrors = computed(() => {
  const errors: string[] = []
  const requiredImages = ['image1'] // image1のみ必須
  const optionalImages = []
  
  // 選択されている画像のみをチェック対象に追加
  if (hasImage2.value) optionalImages.push('image2')
  if (hasImage3.value) optionalImages.push('image3')
  
  const allImages = [...requiredImages, ...optionalImages]
  
  allImages.forEach(key => {
    const config = props.imageConfigs[key as keyof typeof props.imageConfigs]
    
    // 必須画像のソースチェック（image1のみ）
    if (requiredImages.includes(key) && (!config.source || !config.source.trim())) {
      errors.push(`${key}のソースが選択されていません`)
    }
    
    // 選択されている画像の座標とサイズの範囲チェック（1920x1080対応）
    if (config.source && config.source.trim()) {
      if (config.x < 0 || config.x > 1920) {
        errors.push(`${key}のX座標が範囲外です (0-1920)`)
      }
      
      if (config.y < 0 || config.y > 1080) {
        errors.push(`${key}のY座標が範囲外です (0-1080)`)
      }
      
      if (config.width < 10 || config.width > 1920) {
        errors.push(`${key}の幅が範囲外です (10-1920)`)
      }
      
      if (config.height < 10 || config.height > 1080) {
        errors.push(`${key}の高さが範囲外です (10-1080)`)
      }

      // 画像がキャンバス外に出ていないかチェック（1920x1080対応）
      if (config.x + config.width > 1920) {
        errors.push(`${key}がキャンバスの右端を超えています`)
      }
      
      if (config.y + config.height > 1080) {
        errors.push(`${key}がキャンバスの下端を超えています`)
      }
    }
  })
  
  return errors
})

// Methods
const updateConfig = (imageKey: string, field: string, value: any) => {
  emit('update-config', imageKey, field, value)
}

const getCanvasPreviewStyle = (imageKey: string, config: any) => {
  const colors = {
    image1: '#ef4444', // 赤
    image2: '#3b82f6', // 青
    image3: '#10b981', // 緑
  }
  
  // キャンバスサイズ 1920x1080 を 384x216 に縮小 (1:5スケール)
  const scale = 0.2
  
  return {
    position: 'absolute',
    left: `${config.x * scale}px`,
    top: `${config.y * scale}px`,
    width: `${config.width * scale}px`,
    height: `${config.height * scale}px`,
    backgroundColor: colors[imageKey as keyof typeof colors] || '#6b7280',
    color: 'white',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '2px',
    opacity: 0.8,
  }
}
</script>

<style scoped>
.image-config-container {
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  margin: 20px 0;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 20px;
}

.table-container {
  overflow-x: auto;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e0 #f7fafc;
}

.table-container::-webkit-scrollbar {
  height: 8px;
}

.table-container::-webkit-scrollbar-track {
  background: #f7fafc;
}

.table-container::-webkit-scrollbar-thumb {
  background-color: #cbd5e0;
  border-radius: 4px;
}

.config-table {
  width: 100%;
  border-collapse: collapse;
  border: 1px solid #e0e0e0;
  background-color: white;
}

.config-table th,
.config-table td {
  border: 1px solid #e0e0e0;
  padding: 12px;
  text-align: left;
  vertical-align: middle;
}

.config-table th {
  background-color: #f1f3f4;
  font-weight: 600;
  color: #333;
}

.config-table .row-header {
  background-color: #f8f9fa;
  font-weight: 500;
  min-width: 100px;
}

.config-table .disabled-header {
  background-color: #e9ecef;
  color: #6c757d;
}

.config-table .disabled-cell {
  background-color: #f8f9fa;
}

.form-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-size: 14px;
}

.form-input:disabled {
  background-color: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
}

.mb-6 {
  margin-bottom: 24px;
}

.canvas-preview-container {
  margin-top: 24px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 8px;
}

.canvas-preview-container h3 {
  margin-bottom: 16px;
  color: #333;
  font-size: 1.2rem;
}

.canvas-preview {
  position: relative;
  width: 384px;
  height: 216px;
  background: white;
  border: 2px solid #dee2e6;
  border-radius: 4px;
  margin: 0 auto 12px;
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

.canvas-info {
  text-align: center;
  color: #6c757d;
}

.validation-errors {
  margin-top: 16px;
  padding: 16px;
  background: #f8d7da;
  color: #721c24;
  border-radius: 8px;
  border: 1px solid #f5c6cb;
}

.validation-errors h4 {
  margin-bottom: 8px;
  font-size: 1rem;
}

.validation-errors ul {
  margin: 0;
  padding-left: 20px;
}

.validation-errors li {
  margin-bottom: 4px;
}

/* レスポンシブデザイン */
@media (max-width: 768px) {
  .config-table {
    font-size: 12px;
  }
  
  .config-table th,
  .config-table td {
    padding: 8px;
  }
  
  .form-input {
    padding: 6px;
    font-size: 12px;
  }
  
  .canvas-preview {
    width: 288px;
    height: 162px;
  }
  
  .canvas-preview-container {
    padding: 16px;
  }
}

@media (max-width: 480px) {
  .config-table {
    display: block;
    overflow-x: auto;
    white-space: nowrap;
  }
  
  .canvas-preview {
    width: 240px;
    height: 135px;
  }
}
</style>