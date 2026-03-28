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
                :modelValue="imageConfigs.image1.source"
                label=""
                image-type="image1"
                :required="true"
                @update:modelValue="updateConfig('image1', 'source', $event)"
              />
            </td>
            <td v-if="imageMode >= 2" class="image2-cell">
              <ImageSelector
                :modelValue="imageConfigs.image2.source"
                label=""
                image-type="image2"
                :required="imageMode >= 2"
                @update:modelValue="updateConfig('image2', 'source', $event)"
              />
            </td>
            <td v-if="imageMode >= 3" class="image3-cell">
              <ImageSelector
                :modelValue="imageConfigs.image3.source"
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

    <!-- テキストオーバーレイ設定 -->
    <div class="text-overlay-section mb-6">
      <div class="text-overlay-header">
        <label class="toggle-label">
          <input
            type="checkbox"
            :checked="textConfigs.enabled"
            @change="$emit('update-text-config', 'enabled', 'enabled', ($event.target as HTMLInputElement).checked)"
          />
          <span class="toggle-text">テキストオーバーレイ</span>
        </label>
      </div>

      <div v-if="textConfigs.enabled" class="text-config-content">
        <div
          v-for="(textKey, idx) in ['text1', 'text2', 'text3']"
          :key="textKey"
          class="text-item"
        >
          <h4 class="text-item-title">テキスト{{ idx + 1 }}</h4>
          <div class="text-form-grid">
            <div class="text-form-row">
              <label>テキスト:</label>
              <textarea
                :value="textConfigs[textKey].text"
                @input="$emit('update-text-config', textKey, 'text', ($event.target as HTMLTextAreaElement).value)"
                rows="2"
                class="text-input"
                placeholder="テキストを入力..."
              />
            </div>
            <div class="text-form-row-inline">
              <div>
                <label>X:</label>
                <input
                  type="number"
                  :value="textConfigs[textKey].x"
                  @input="$emit('update-text-config', textKey, 'x', Number(($event.target as HTMLInputElement).value))"
                  min="0" max="1920"
                  class="number-input-sm"
                />
              </div>
              <div>
                <label>Y:</label>
                <input
                  type="number"
                  :value="textConfigs[textKey].y"
                  @input="$emit('update-text-config', textKey, 'y', Number(($event.target as HTMLInputElement).value))"
                  min="0" max="1080"
                  class="number-input-sm"
                />
              </div>
              <div>
                <label>サイズ:</label>
                <input
                  type="number"
                  :value="textConfigs[textKey].fontSize"
                  @input="$emit('update-text-config', textKey, 'fontSize', Number(($event.target as HTMLInputElement).value))"
                  min="1" max="500"
                  class="number-input-sm"
                />
              </div>
              <div>
                <label>文字色:</label>
                <input
                  type="color"
                  :value="textConfigs[textKey].fontColor"
                  @input="$emit('update-text-config', textKey, 'fontColor', ($event.target as HTMLInputElement).value)"
                  class="color-input"
                />
              </div>
            </div>
            <div class="text-form-row-inline">
              <div>
                <label>背景色:</label>
                <input
                  type="color"
                  :value="textConfigs[textKey].bgColor || '#000000'"
                  @input="$emit('update-text-config', textKey, 'bgColor', ($event.target as HTMLInputElement).value)"
                  class="color-input"
                  :disabled="!textConfigs[textKey].bgColor"
                />
                <label class="inline-toggle">
                  <input
                    type="checkbox"
                    :checked="!!textConfigs[textKey].bgColor"
                    @change="$emit('update-text-config', textKey, 'bgColor', ($event.target as HTMLInputElement).checked ? '#000000' : '')"
                  />
                  有効
                </label>
              </div>
              <div v-if="textConfigs[textKey].bgColor">
                <label>不透明度:</label>
                <input
                  type="range"
                  :value="textConfigs[textKey].bgOpacity"
                  @input="$emit('update-text-config', textKey, 'bgOpacity', Number(($event.target as HTMLInputElement).value))"
                  min="0" max="1" step="0.1"
                  class="range-input"
                />
                <span class="opacity-value">{{ (textConfigs[textKey].bgOpacity * 100).toFixed(0) }}%</span>
              </div>
              <div>
                <label class="inline-toggle">
                  <input
                    type="checkbox"
                    :checked="textConfigs[textKey].wrap"
                    @change="$emit('update-text-config', textKey, 'wrap', ($event.target as HTMLInputElement).checked)"
                  />
                  折り返し
                </label>
              </div>
              <div v-if="textConfigs[textKey].wrap">
                <label>最大幅:</label>
                <input
                  type="number"
                  :value="textConfigs[textKey].maxWidth"
                  @input="$emit('update-text-config', textKey, 'maxWidth', Number(($event.target as HTMLInputElement).value))"
                  min="1" max="1920"
                  class="number-input-sm"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 動画生成設定 -->
    <div class="video-generation-container">
      <h3 class="section-title">🎬 動画生成設定</h3>
      
      <!-- 動画生成ON/OFF切り替え -->
      <div class="video-toggle-section">
        <div class="toggle-container">
          <label class="toggle-label">
            <input
              type="checkbox"
              :checked="videoConfig.enabled"
              @change="updateVideoConfig('enabled', $event.target.checked)"
              class="toggle-checkbox"
            />
            <span class="toggle-slider"></span>
            <span class="toggle-text">動画生成を有効にする</span>
          </label>
        </div>
        <div class="toggle-description">
          <small>合成画像から動画を生成します。動画生成には追加の処理時間がかかります。</small>
        </div>
      </div>

      <!-- 動画生成パラメータ設定 -->
      <div v-if="videoConfig.enabled" class="video-params-section">
        <div class="params-grid">
          <!-- 動画の長さ設定 -->
          <div class="param-group">
            <label class="param-label">動画の長さ（秒）</label>
            <div class="input-with-validation">
              <input
                type="number"
                :value="videoConfig.duration"
                @input="updateVideoConfigWithValidation('duration', parseInt($event.target.value))"
                class="form-input"
                :class="{ 'error': hasVideoFieldError('duration') }"
                min="1"
                max="30"
                step="1"
              />
              <div v-if="hasVideoFieldError('duration')" class="field-error">
                {{ getVideoFieldError('duration') }}
              </div>
            </div>
            <small class="param-hint">1〜30秒の範囲で設定してください（デフォルト: 3秒）</small>
          </div>

          <!-- 動画フォーマット設定 -->
          <div class="param-group">
            <label class="param-label">動画フォーマット</label>
            <div class="input-with-validation">
              <select
                :value="videoConfig.format"
                @change="updateVideoConfig('format', $event.target.value)"
                class="form-select"
              >
                <option value="XMF">XMF (MP4互換・推奨)</option>
                <option value="MP4">MP4 (標準)</option>
                <option value="WEBM">WEBM (Web最適化)</option>
                <option value="AVI">AVI (汎用)</option>
              </select>
            </div>
            <small class="param-hint">XMFフォーマットが推奨です（高品質・高互換性）</small>
          </div>
        </div>

        <!-- 動画生成プレビュー情報 -->
        <div class="video-preview-info">
          <div class="preview-info-grid">
            <div class="info-item">
              <span class="info-label">予想ファイルサイズ:</span>
              <span class="info-value">{{ estimatedFileSize }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">予想処理時間:</span>
              <span class="info-value">{{ estimatedProcessingTime }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">出力形式:</span>
              <span class="info-value">{{ videoConfig.format }} ({{ getVideoExtension(videoConfig.format) }})</span>
            </div>
          </div>
        </div>

        <!-- 動画生成中の進行状況表示 -->
        <div v-if="isGeneratingVideo" class="video-progress-section">
          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: `${videoGenerationProgress}%` }"></div>
            </div>
            <div class="progress-text">
              動画生成中... {{ videoGenerationProgress }}%
            </div>
          </div>
          <div class="progress-steps">
            <div class="step" :class="{ active: videoGenerationStep >= 1, completed: videoGenerationStep > 1 }">
              <span class="step-number">1</span>
              <span class="step-text">画像合成</span>
            </div>
            <div class="step" :class="{ active: videoGenerationStep >= 2, completed: videoGenerationStep > 2 }">
              <span class="step-number">2</span>
              <span class="step-text">動画変換</span>
            </div>
            <div class="step" :class="{ active: videoGenerationStep >= 3, completed: videoGenerationStep > 3 }">
              <span class="step-number">3</span>
              <span class="step-text">完了</span>
            </div>
          </div>
        </div>
      </div>
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
  videoConfig: {
    enabled: boolean
    duration: number
    format: string
  }
  textConfigs?: {
    enabled: boolean
    text1: { text: string; x: number; y: number; fontSize: number; fontColor: string; bgColor: string; bgOpacity: number; wrap: boolean; maxWidth: number; padding: number }
    text2: { text: string; x: number; y: number; fontSize: number; fontColor: string; bgColor: string; bgOpacity: number; wrap: boolean; maxWidth: number; padding: number }
    text3: { text: string; x: number; y: number; fontSize: number; fontColor: string; bgColor: string; bgOpacity: number; wrap: boolean; maxWidth: number; padding: number }
  }
  imageMode?: number
  isGeneratingVideo?: boolean
  videoGenerationProgress?: number
  videoGenerationStep?: number
}

const props = withDefaults(defineProps<Props>(), {
  imageMode: 2,
  isGeneratingVideo: false,
  videoGenerationProgress: 0,
  videoGenerationStep: 1,
  textConfigs: () => ({
    enabled: false,
    text1: { text: '', x: 100, y: 800, fontSize: 48, fontColor: '#FFFFFF', bgColor: '', bgOpacity: 0.7, wrap: false, maxWidth: 800, padding: 10 },
    text2: { text: '', x: 100, y: 900, fontSize: 36, fontColor: '#FFFFFF', bgColor: '', bgOpacity: 0.7, wrap: false, maxWidth: 800, padding: 10 },
    text3: { text: '', x: 100, y: 950, fontSize: 24, fontColor: '#FFFFFF', bgColor: '', bgOpacity: 0.7, wrap: false, maxWidth: 800, padding: 10 },
  }),
})

// Emits
const emit = defineEmits<{
  'update-config': [imageKey: string, field: string, value: any]
  'update-mode': [mode: number]
  'update-video-config': [field: string, value: any]
  'update-text-config': [textKey: string, field: string, value: any]
}>()

// Reactive state for field-level validation errors
const fieldErrors = reactive<Record<string, Record<string, string>>>({})
const videoFieldErrors = reactive<Record<string, string>>({})

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
  
  // 動画設定の検証エラーも追加
  if (props.videoConfig.enabled) {
    if (props.videoConfig.duration < 1 || props.videoConfig.duration > 30) {
      errors.push('動画の長さは1〜30秒の範囲で設定してください')
    }
    
    const supportedFormats = ['XMF', 'MP4', 'WEBM', 'AVI']
    if (!supportedFormats.includes(props.videoConfig.format)) {
      errors.push('サポートされていない動画フォーマットです')
    }
  }
  
  return errors
})

const estimatedFileSize = computed(() => {
  if (!props.videoConfig.enabled) return 'N/A'
  
  // 簡易的なファイルサイズ推定（実際の値は画像内容により変動）
  const baseSizeKB = 500 // 基本サイズ（KB）
  const durationMultiplier = props.videoConfig.duration * 100 // 秒あたり100KB
  const formatMultiplier = {
    'XMF': 1.2,
    'MP4': 1.0,
    'WEBM': 0.8,
    'AVI': 1.5
  }[props.videoConfig.format] || 1.0
  
  const estimatedKB = (baseSizeKB + durationMultiplier) * formatMultiplier
  
  if (estimatedKB < 1024) {
    return `約 ${Math.round(estimatedKB)} KB`
  } else {
    return `約 ${(estimatedKB / 1024).toFixed(1)} MB`
  }
})

const estimatedProcessingTime = computed(() => {
  if (!props.videoConfig.enabled) return 'N/A'
  
  // 簡易的な処理時間推定
  const baseTime = 5 // 基本処理時間（秒）
  const durationMultiplier = props.videoConfig.duration * 0.5 // 動画1秒あたり0.5秒
  const formatMultiplier = {
    'XMF': 1.0,
    'MP4': 0.8,
    'WEBM': 1.2,
    'AVI': 0.9
  }[props.videoConfig.format] || 1.0
  
  const estimatedSeconds = (baseTime + durationMultiplier) * formatMultiplier
  
  return `約 ${Math.round(estimatedSeconds)} 秒`
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

// 動画設定関連のメソッド
const updateVideoConfig = (field: string, value: any) => {
  emit('update-video-config', field, value)
}

const updateVideoConfigWithValidation = (field: string, value: any) => {
  // Clear previous field error
  delete videoFieldErrors[field]
  
  // Validate the field
  const error = validateVideoField(field, value)
  if (error) {
    videoFieldErrors[field] = error
  }
  
  // Update the config
  emit('update-video-config', field, value)
}

const validateVideoField = (field: string, value: any): string | null => {
  switch (field) {
    case 'duration':
      if (isNaN(value)) {
        return '数値を入力してください'
      }
      if (value < 1 || value > 30) {
        return '動画の長さは1〜30秒の範囲で設定してください'
      }
      break
    case 'format':
      const supportedFormats = ['XMF', 'MP4', 'WEBM', 'AVI']
      if (!supportedFormats.includes(value)) {
        return 'サポートされていない動画フォーマットです'
      }
      break
  }
  
  return null
}

const hasVideoFieldError = (field: string): boolean => {
  return !!videoFieldErrors[field]
}

const getVideoFieldError = (field: string): string => {
  return videoFieldErrors[field] || ''
}

const getVideoExtension = (format: string): string => {
  const extensions = {
    'XMF': 'mp4',
    'MP4': 'mp4',
    'WEBM': 'webm',
    'AVI': 'avi'
  }
  return extensions[format as keyof typeof extensions] || 'mp4'
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
  border: 2px solid #6c757d;
  background: #f8f9fa;
  color: #333;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.mode-button:hover,
.mode-button:focus {
  background: #e2e6ea;
  border-color: #0056b3;
  color: #0056b3;
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

/* 動画生成設定のスタイル */
.video-generation-container {
  background-color: #f0f8ff;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #b3d9ff;
  margin: 20px 0;
}

.video-toggle-section {
  margin-bottom: 20px;
}

.toggle-container {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
}

.toggle-label {
  display: flex;
  align-items: center;
  cursor: pointer;
  font-weight: 500;
  color: #333;
}

.toggle-checkbox {
  display: none;
}

.toggle-slider {
  position: relative;
  width: 50px;
  height: 24px;
  background-color: #ccc;
  border-radius: 24px;
  margin-right: 12px;
  transition: background-color 0.3s ease;
}

.toggle-slider::before {
  content: '';
  position: absolute;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: white;
  top: 2px;
  left: 2px;
  transition: transform 0.3s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.toggle-checkbox:checked + .toggle-slider {
  background-color: #007bff;
}

.toggle-checkbox:checked + .toggle-slider::before {
  transform: translateX(26px);
}

.toggle-text {
  font-size: 16px;
}

.toggle-description {
  color: #666;
  font-size: 14px;
  margin-left: 62px;
}

.video-params-section {
  background: white;
  padding: 20px;
  border-radius: 8px;
  border: 1px solid #e0e0e0;
  margin-top: 16px;
}

.params-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.param-group {
  display: flex;
  flex-direction: column;
}

.param-label {
  font-weight: 500;
  color: #333;
  margin-bottom: 8px;
  font-size: 14px;
}

.form-select {
  width: 100%;
  padding: 8px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  font-size: 14px;
  background-color: white;
  transition: border-color 0.2s ease;
}

.form-select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.param-hint {
  color: #666;
  font-size: 12px;
  margin-top: 4px;
}

.video-preview-info {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.preview-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.info-label {
  font-weight: 500;
  color: #555;
  font-size: 14px;
}

.info-value {
  font-weight: 600;
  color: #007bff;
  font-size: 14px;
}

.video-progress-section {
  background: #fff3cd;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #ffeaa7;
  margin-top: 16px;
}

.progress-container {
  margin-bottom: 16px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background-color: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 8px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007bff, #0056b3);
  transition: width 0.3s ease;
}

.progress-text {
  text-align: center;
  font-weight: 500;
  color: #856404;
  font-size: 14px;
}

.progress-steps {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.step {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
  position: relative;
}

.step:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 15px;
  right: -50%;
  width: 100%;
  height: 2px;
  background-color: #e9ecef;
  z-index: 1;
}

.step.completed:not(:last-child)::after {
  background-color: #28a745;
}

.step-number {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background-color: #e9ecef;
  color: #6c757d;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  font-size: 14px;
  margin-bottom: 8px;
  position: relative;
  z-index: 2;
}

.step.active .step-number {
  background-color: #007bff;
  color: white;
}

.step.completed .step-number {
  background-color: #28a745;
  color: white;
}

.step-text {
  font-size: 12px;
  color: #6c757d;
  text-align: center;
}

.step.active .step-text {
  color: #007bff;
  font-weight: 500;
}

.step.completed .step-text {
  color: #28a745;
  font-weight: 500;
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
  
  .params-grid {
    grid-template-columns: 1fr;
    gap: 16px;
  }
  
  .preview-info-grid {
    grid-template-columns: 1fr;
    gap: 8px;
  }
  
  .progress-steps {
    flex-direction: column;
    gap: 12px;
  }
  
  .step:not(:last-child)::after {
    display: none;
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
  
  .video-generation-container {
    padding: 16px;
  }
  
  .video-params-section {
    padding: 16px;
  }
}

/* テキストオーバーレイ */
.text-overlay-section {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  background: #faf5ff;
}

.text-overlay-header {
  margin-bottom: 12px;
}

.text-overlay-header .toggle-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-weight: 600;
  color: #7c3aed;
}

.text-overlay-header .toggle-text {
  font-size: 14px;
}

.text-config-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.text-item {
  border: 1px solid #ddd6fe;
  border-radius: 6px;
  padding: 12px;
  background: white;
}

.text-item-title {
  font-weight: 600;
  font-size: 13px;
  color: #7c3aed;
  margin-bottom: 8px;
}

.text-form-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.text-form-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.text-form-row label {
  font-size: 12px;
  color: #6b7280;
  min-width: 60px;
  padding-top: 4px;
}

.text-form-row-inline {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.text-form-row-inline > div {
  display: flex;
  align-items: center;
  gap: 4px;
}

.text-form-row-inline label {
  font-size: 12px;
  color: #6b7280;
  white-space: nowrap;
}

.text-input {
  flex: 1;
  padding: 6px 8px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  resize: vertical;
  min-width: 200px;
}

.number-input-sm {
  width: 70px;
  padding: 4px 6px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
}

.color-input {
  width: 32px;
  height: 28px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  cursor: pointer;
  padding: 1px;
}

.range-input {
  width: 80px;
}

.opacity-value {
  font-size: 11px;
  color: #6b7280;
  min-width: 30px;
}

.inline-toggle {
  display: flex !important;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  font-size: 12px !important;
  color: #6b7280 !important;
  min-width: auto !important;
}
</style>