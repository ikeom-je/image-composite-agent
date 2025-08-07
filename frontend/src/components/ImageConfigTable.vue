<template>
  <div class="image-config-container">
    <h3 class="section-title">画像設定</h3>

    <!-- 画像モード選択 -->
    <div class="mode-selector mb-4">
      <label class="mode-label">合成モード:</label>
      <div class="mode-buttons">
        <button
          type="button"
          class="mode-button"
          :class="{ active: imageMode === 1 }"
          @click="setImageMode(1)"
        >
          1画像
        </button>
        <button
          type="button"
          class="mode-button"
          :class="{ active: imageMode === 2 }"
          @click="setImageMode(2)"
        >
          2画像
        </button>
        <button
          type="button"
          class="mode-button"
          :class="{ active: imageMode === 3 }"
          @click="setImageMode(3)"
        >
          3画像
        </button>
      </div>
    </div>

    <!-- 画像選択テーブル -->
    <div class="table-container mb-6">
      <table class="config-table">
        <thead>
          <tr>
            <th>画像</th>
            <th class="image1-header">画像1 (必須)</th>
            <th v-if="imageMode >= 2" class="image2-header">
              画像2 (必須)
            </th>
            <th v-if="imageMode >= 3" class="image3-header">
              画像3 (必須)
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="row-header">画像選択</td>
            <td class="image1-cell">
              <ImageSelector
                v-model="imageConfigs.image1.source"
                label=""
                image-type="image1"
                :required="true"
                @update:modelValue="updateConfig('image1', 'source', $event)"
              />
            </td>
            <td v-if="imageMode >= 2" class="image2-cell">
              <ImageSelector
                v-model="imageConfigs.image2.source"
                label=""
                image-type="image2"
                :required="imageMode >= 2"
                @update:modelValue="updateConfig('image2', 'source', $event)"
              />
            </td>
            <td v-if="imageMode >= 3" class="image3-cell">
              <ImageSelector
                v-model="imageConfigs.image3.source"
                label=""
                image-type="image3"
                :required="imageMode >= 3"
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
            <th class="image1-header">画像1</th>
            <th v-if="imageMode >= 2" class="image2-header">画像2</th>
            <th v-if="imageMode >= 3" class="image3-header">画像3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="row-header">X座標</td>
            <td class="image1-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image1.x"
                  @input="updateConfigWithValidation('image1', 'x', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image1', 'x') }"
                  min="0"
                  max="1920"
                />
                <div v-if="hasFieldError('image1', 'x')" class="field-error">
                  {{ getFieldError('image1', 'x') }}
                </div>
              </div>
            </td>
            <td v-if="imageMode >= 2" class="image2-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image2.x"
                  @input="updateConfigWithValidation('image2', 'x', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image2', 'x') }"
                  min="0"
                  max="1920"
                />
                <div v-if="hasFieldError('image2', 'x')" class="field-error">
                  {{ getFieldError('image2', 'x') }}
                </div>
              </div>
            </td>
            <td v-if="imageMode >= 3" class="image3-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image3.x"
                  @input="updateConfigWithValidation('image3', 'x', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image3', 'x') }"
                  min="0"
                  max="1920"
                />
                <div v-if="hasFieldError('image3', 'x')" class="field-error">
                  {{ getFieldError('image3', 'x') }}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td class="row-header">Y座標</td>
            <td class="image1-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image1.y"
                  @input="updateConfigWithValidation('image1', 'y', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image1', 'y') }"
                  min="0"
                  max="1080"
                />
                <div v-if="hasFieldError('image1', 'y')" class="field-error">
                  {{ getFieldError('image1', 'y') }}
                </div>
              </div>
            </td>
            <td v-if="imageMode >= 2" class="image2-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image2.y"
                  @input="updateConfigWithValidation('image2', 'y', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image2', 'y') }"
                  min="0"
                  max="1080"
                />
                <div v-if="hasFieldError('image2', 'y')" class="field-error">
                  {{ getFieldError('image2', 'y') }}
                </div>
              </div>
            </td>
            <td v-if="imageMode >= 3" class="image3-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image3.y"
                  @input="updateConfigWithValidation('image3', 'y', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image3', 'y') }"
                  min="0"
                  max="1080"
                />
                <div v-if="hasFieldError('image3', 'y')" class="field-error">
                  {{ getFieldError('image3', 'y') }}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td class="row-header">幅</td>
            <td class="image1-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image1.width"
                  @input="updateConfigWithValidation('image1', 'width', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image1', 'width') }"
                  min="10"
                  max="1920"
                />
                <div v-if="hasFieldError('image1', 'width')" class="field-error">
                  {{ getFieldError('image1', 'width') }}
                </div>
              </div>
            </td>
            <td v-if="imageMode >= 2" class="image2-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image2.width"
                  @input="updateConfigWithValidation('image2', 'width', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image2', 'width') }"
                  min="10"
                  max="1920"
                />
                <div v-if="hasFieldError('image2', 'width')" class="field-error">
                  {{ getFieldError('image2', 'width') }}
                </div>
              </div>
            </td>
            <td v-if="imageMode >= 3" class="image3-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image3.width"
                  @input="updateConfigWithValidation('image3', 'width', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image3', 'width') }"
                  min="10"
                  max="1920"
                />
                <div v-if="hasFieldError('image3', 'width')" class="field-error">
                  {{ getFieldError('image3', 'width') }}
                </div>
              </div>
            </td>
          </tr>
          <tr>
            <td class="row-header">高さ</td>
            <td class="image1-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image1.height"
                  @input="updateConfigWithValidation('image1', 'height', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image1', 'height') }"
                  min="10"
                  max="1080"
                />
                <div v-if="hasFieldError('image1', 'height')" class="field-error">
                  {{ getFieldError('image1', 'height') }}
                </div>
              </div>
            </td>
            <td v-if="imageMode >= 2" class="image2-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image2.height"
                  @input="updateConfigWithValidation('image2', 'height', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image2', 'height') }"
                  min="10"
                  max="1080"
                />
                <div v-if="hasFieldError('image2', 'height')" class="field-error">
                  {{ getFieldError('image2', 'height') }}
                </div>
              </div>
            </td>
            <td v-if="imageMode >= 3" class="image3-cell">
              <div class="input-with-validation">
                <input
                  type="number"
                  :value="imageConfigs.image3.height"
                  @input="updateConfigWithValidation('image3', 'height', parseInt($event.target.value))"
                  class="form-input"
                  :class="{ 'error': hasFieldError('image3', 'height') }"
                  min="10"
                  max="1080"
                />
                <div v-if="hasFieldError('image3', 'height')" class="field-error">
                  {{ getFieldError('image3', 'height') }}
                </div>
              </div>
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
import { computed, ref, reactive } from 'vue'
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
  imageMode?: number
}

const props = withDefaults(defineProps<Props>(), {
  imageMode: 2
})

// Emits
const emit = defineEmits<{
  'update-config': [imageKey: string, field: string, value: any]
  'update-mode': [mode: number]
}>()

// Reactive state for field-level validation errors
const fieldErrors = reactive<Record<string, Record<string, string>>>({})

// Computed
const hasImage2 = computed(() => {
  return props.imageMode >= 2 && props.imageConfigs.image2.source && props.imageConfigs.image2.source.trim() !== ''
})

const hasImage3 = computed(() => {
  return props.imageMode >= 3 && props.imageConfigs.image3.source && props.imageConfigs.image3.source.trim() !== ''
})

const visibleImageConfigs = computed(() => {
  const configs: any = {
    image1: props.imageConfigs.image1,
  }
  
  if (props.imageMode >= 2) {
    configs.image2 = props.imageConfigs.image2
  }
  
  if (props.imageMode >= 3) {
    configs.image3 = props.imageConfigs.image3
  }
  
  return configs
})

const validationErrors = computed(() => {
  const errors: string[] = []
  const requiredImages = ['image1'] // image1のみ必須
  const optionalImages = []
  
  // モードに応じて必須画像を追加
  if (props.imageMode >= 2) requiredImages.push('image2')
  if (props.imageMode >= 3) requiredImages.push('image3')
  
  // 選択されている画像のみをチェック対象に追加
  if (hasImage2.value && !requiredImages.includes('image2')) optionalImages.push('image2')
  if (hasImage3.value && !requiredImages.includes('image3')) optionalImages.push('image3')
  
  const allImages = [...requiredImages, ...optionalImages]
  
  allImages.forEach(key => {
    const config = props.imageConfigs[key as keyof typeof props.imageConfigs]
    
    // 必須画像のソースチェック
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
const setImageMode = (mode: number) => {
  emit('update-mode', mode)
}

const updateConfig = (imageKey: string, field: string, value: any) => {
  emit('update-config', imageKey, field, value)
}

const updateConfigWithValidation = (imageKey: string, field: string, value: any) => {
  // Clear previous field error
  if (fieldErrors[imageKey]) {
    delete fieldErrors[imageKey][field]
  }
  
  // Validate the field
  const error = validateField(imageKey, field, value)
  if (error) {
    if (!fieldErrors[imageKey]) {
      fieldErrors[imageKey] = {}
    }
    fieldErrors[imageKey][field] = error
  }
  
  // Update the config
  emit('update-config', imageKey, field, value)
}

const validateField = (imageKey: string, field: string, value: number): string | null => {
  if (isNaN(value)) {
    return '数値を入力してください'
  }
  
  const config = props.imageConfigs[imageKey as keyof typeof props.imageConfigs]
  
  switch (field) {
    case 'x':
      if (value < 0 || value > 1920) {
        return 'X座標は0-1920の範囲で入力してください'
      }
      if (value + config.width > 1920) {
        return 'X座標 + 幅がキャンバス幅(1920)を超えています'
      }
      break
    case 'y':
      if (value < 0 || value > 1080) {
        return 'Y座標は0-1080の範囲で入力してください'
      }
      if (value + config.height > 1080) {
        return 'Y座標 + 高さがキャンバス高さ(1080)を超えています'
      }
      break
    case 'width':
      if (value < 10 || value > 1920) {
        return '幅は10-1920の範囲で入力してください'
      }
      if (config.x + value > 1920) {
        return 'X座標 + 幅がキャンバス幅(1920)を超えています'
      }
      break
    case 'height':
      if (value < 10 || value > 1080) {
        return '高さは10-1080の範囲で入力してください'
      }
      if (config.y + value > 1080) {
        return 'Y座標 + 高さがキャンバス高さ(1080)を超えています'
      }
      break
  }
  
  return null
}

const hasFieldError = (imageKey: string, field: string): boolean => {
  return !!(fieldErrors[imageKey] && fieldErrors[imageKey][field])
}

const getFieldError = (imageKey: string, field: string): string => {
  return fieldErrors[imageKey] && fieldErrors[imageKey][field] || ''
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

.mode-selector {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
}

.mode-label {
  font-weight: 500;
  color: #333;
  margin-right: 8px;
}

.mode-buttons {
  display: flex;
  gap: 8px;
}

.mode-button {
  padding: 8px 16px;
  border: 1px solid #e0e0e0;
  background: white;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s ease;
}

.mode-button:hover {
  background: #f8f9fa;
  border-color: #007bff;
}

.mode-button.active {
  background: #007bff;
  color: white;
  border-color: #007bff;
}

.mb-4 {
  margin-bottom: 16px;
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

.config-table .image1-header {
  background-color: #fef2f2;
  border-left: 3px solid #ef4444;
}

.config-table .image2-header {
  background-color: #eff6ff;
  border-left: 3px solid #3b82f6;
}

.config-table .image3-header {
  background-color: #f0fdf4;
  border-left: 3px solid #10b981;
}

.config-table .image1-cell {
  background-color: #fefefe;
  border-left: 2px solid #ef4444;
}

.config-table .image2-cell {
  background-color: #fefefe;
  border-left: 2px solid #3b82f6;
}

.config-table .image3-cell {
  background-color: #fefefe;
  border-left: 2px solid #10b981;
}

.input-with-validation {
  position: relative;
}

.form-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-size: 14px;
  transition: border-color 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.form-input.error {
  border-color: #dc3545;
  background-color: #fff5f5;
}

.form-input:disabled {
  background-color: #f8f9fa;
  color: #6c757d;
  cursor: not-allowed;
}

.field-error {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: #dc3545;
  color: white;
  font-size: 11px;
  padding: 4px 6px;
  border-radius: 0 0 4px 4px;
  z-index: 10;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
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