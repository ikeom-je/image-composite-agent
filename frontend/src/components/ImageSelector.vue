<template>
  <div class="image-selector-compact">
    <!-- シンプルな選択ドロップダウン -->
    <select 
      v-model="displayValue" 
      @change="handleSelectionChange" 
      class="form-select-compact"
      :class="{ 'required': required && !modelValue }"
    >
      <option value="">{{ required ? '選択してください' : '選択しない' }}</option>
      <optgroup v-if="imageType === 'base'" label="ベース画像">
        <option value="test">テスト画像（黒背景）</option>
        <option value="white">白背景</option>
        <option value="transparent">透明背景</option>
      </optgroup>
      <optgroup v-else label="テスト画像">
        <option value="test">自動選択（{{ getAutoSelectDescription() }}）</option>
        <option value="circle">🔴 赤い円</option>
        <option value="rectangle">🔷 青い四角</option>
        <option value="triangle">🔺 緑の三角</option>
      </optgroup>
      <optgroup label="S3アップロード画像">
        <option value="s3-gallery">📷 S3画像から選択...</option>
        <!-- 選択されたS3画像がある場合の表示用オプション -->
        <option 
          v-if="selectedS3ImageDisplay" 
          :value="selectedS3ImageDisplay.value"
          selected
        >
          {{ selectedS3ImageDisplay.label }}
        </option>
      </optgroup>
    </select>
    
    <!-- S3画像の更新ボタン（コンパクト） -->
    <button 
      v-if="showRefreshButton"
      @click="refreshImages" 
      class="refresh-button-compact" 
      :disabled="loadingImages"
      :title="loadingImages ? '読み込み中...' : 'S3画像を更新'"
    >
      <span v-if="loadingImages">🔄</span>
      <span v-else>🔄</span>
    </button>

    <!-- S3画像選択モーダル -->
    <div v-if="showS3Modal" class="modal-overlay" @click="closeS3Modal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>S3画像を選択</h3>
          <button @click="closeS3Modal" class="close-button">✕</button>
        </div>
        
        <div class="modal-body">
          <!-- 読み込み中 -->
          <div v-if="loadingImages" class="loading-state">
            <div class="spinner"></div>
            <p>画像を読み込み中...</p>
          </div>
          
          <!-- 画像がない場合 -->
          <div v-else-if="s3Images.length === 0" class="empty-state">
            <div class="empty-icon">📷</div>
            <p>アップロードされた画像がありません</p>
            <small>画像をアップロードしてから選択してください</small>
          </div>
          
          <!-- 画像一覧 -->
          <div v-else class="image-gallery">
            <div 
              v-for="image in s3Images" 
              :key="image.key"
              class="image-item"
              :class="{ 'selected': selectedS3Image?.key === image.key }"
              @click="selectS3Image(image)"
            >
              <div class="image-thumbnail">
                <img 
                  :src="image.thumbnailUrl" 
                  :alt="image.fileName"
                  @error="handleImageError"
                  loading="lazy"
                />
                <div v-if="selectedS3Image?.key === image.key" class="selection-indicator">
                  ✓
                </div>
              </div>
              <div class="image-info">
                <div class="image-name" :title="image.fileName">
                  {{ truncateFileName(image.fileName) }}
                </div>
                <div class="image-meta">
                  {{ formatFileSize(image.size) }} • {{ formatDate(image.lastModified) }}
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button @click="closeS3Modal" class="cancel-button">
            キャンセル
          </button>
          <button 
            @click="confirmS3Selection" 
            :disabled="!selectedS3Image"
            class="confirm-button"
          >
            選択
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useNotificationStore } from '@/stores/notification'
import axios from 'axios'

// Props
interface Props {
  label?: string
  modelValue: string
  imageType: string // 'image1', 'image2', 'image3'
  required?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  label: '',
  required: false
})

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Stores
const configStore = useConfigStore()
const notificationStore = useNotificationStore()

// Reactive data
const selectedValue = ref('')
const displayValue = ref('')
const s3Images = ref<Array<{
  key: string
  s3Path: string
  fileName: string
  size: number
  lastModified: string
  contentType: string
  thumbnailUrl: string
}>>([])
const loadingImages = ref(false)
const showS3Modal = ref(false)
const selectedS3Image = ref<{
  key: string
  s3Path: string
  fileName: string
  size: number
  lastModified: string
  contentType: string
  thumbnailUrl: string
} | null>(null)

// Computed
const showRefreshButton = computed(() => {
  return s3Images.value.length > 0 || props.modelValue.startsWith('s3://')
})

const selectedS3ImageDisplay = computed(() => {
  if (props.modelValue.startsWith('s3://')) {
    const foundImage = s3Images.value.find(img => img.s3Path === props.modelValue)
    if (foundImage) {
      return {
        value: foundImage.s3Path,
        label: `📷 ${truncateFileName(foundImage.fileName)}`
      }
    } else {
      return {
        value: props.modelValue,
        label: '📷 S3画像 (選択済み)'
      }
    }
  }
  return null
})

const getAutoSelectDescription = () => {
  const descriptions = {
    base: '黒背景',
    image1: '赤い円',
    image2: '青い四角',
    image3: '緑の三角'
  }
  return descriptions[props.imageType as keyof typeof descriptions] || '自動選択'
}

// Methods
const handleSelectionChange = () => {
  const value = displayValue.value
  
  if (!value) {
    emit('update:modelValue', '')
    return
  }
  
  // base タイプの場合は test/transparent をそのまま emit
  if (props.imageType === 'base') {
    if (value === 'test' || value === 'transparent' || value === 'white') {
      emit('update:modelValue', value)
      return
    }
  }

  if (value === 'test') {
    emit('update:modelValue', 'test')
  } else if (['circle', 'rectangle', 'triangle'].includes(value)) {
    // 特定のテスト画像を選択した場合のS3パス
    const config = configStore.config
    const testBucket = config?.s3BucketNames?.testImages || 'test-bucket'
    const testImageMap = {
      'circle': `s3://${testBucket}/images/circle_red.png`,
      'rectangle': `s3://${testBucket}/images/rectangle_blue.png`,
      'triangle': `s3://${testBucket}/images/triangle_green.png`
    }
    emit('update:modelValue', testImageMap[value as keyof typeof testImageMap])
  } else if (value === 's3-gallery') {
    // S3画像ギャラリーを開く
    openS3Modal()
  } else if (value.startsWith('s3://')) {
    // 既に選択されているS3画像 - 何もしない
    return
  }
}

const openS3Modal = async () => {
  showS3Modal.value = true
  selectedS3Image.value = null
  
  // S3画像を読み込み（まだ読み込まれていない場合）
  if (s3Images.value.length === 0) {
    await loadS3Images()
  }
}

const closeS3Modal = () => {
  showS3Modal.value = false
  selectedS3Image.value = null
  // ドロップダウンを元に戻す
  updateDisplayValue()
}

const selectS3Image = (image: any) => {
  selectedS3Image.value = image
}

const confirmS3Selection = () => {
  if (selectedS3Image.value) {
    emit('update:modelValue', selectedS3Image.value.s3Path)
    showS3Modal.value = false
    
    if (notificationStore) {
      notificationStore.showSuccess(`${selectedS3Image.value.fileName} を選択しました`)
    }
  }
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+Tm8gSW1hZ2U8L3RleHQ+PC9zdmc+'
}

const formatDate = (dateString: string): string => {
  const date = new Date(dateString)
  return date.toLocaleDateString('ja-JP', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const loadS3Images = async () => {
  loadingImages.value = true
  
  try {
    const uploadBaseUrl = configStore.uploadApiUrl
    if (!uploadBaseUrl) {
      console.warn('[ImageSelector] API設定が読み込まれていません')
      return
    }

    // URLを安全に構築（末尾スラッシュの重複を防ぐ）
    const base = uploadBaseUrl.replace(/\/+$/, '')
    const uploadApiUrl = `${base}/images`
    
    console.log(`[ImageSelector] Loading S3 images from: ${uploadApiUrl}`)
    
    const params = new URLSearchParams({
      maxKeys: '20' // 表示用に増やす
    })
    
    const response = await axios.get(`${uploadApiUrl}?${params.toString()}`, {
      timeout: 10000 // 10秒タイムアウト
    })
    
    console.log('[ImageSelector] S3 images response:', response.data)
    
    const data = response.data
    s3Images.value = data.images || []
    
    console.log(`[ImageSelector] Loaded ${s3Images.value.length} S3 images`)
    
  } catch (err: any) {
    console.error('[ImageSelector] Failed to load S3 images:', err)
    if (err.response) {
      console.error('[ImageSelector] Response error:', err.response.status, err.response.data)
    }
    s3Images.value = []
  } finally {
    loadingImages.value = false
  }
}

const refreshImages = async () => {
  await loadS3Images()
  if (notificationStore) {
    notificationStore.showSuccess('画像一覧を更新しました')
  }
}

const updateDisplayValue = () => {
  const value = props.modelValue
  console.log(`[ImageSelector] Updating display from value: ${value}`)
  
  if (!value) {
    displayValue.value = ''
  } else if (value === 'test') {
    displayValue.value = 'test'
  } else if (props.imageType === 'base' && (value === 'transparent' || value === 'white')) {
    displayValue.value = value
  } else if (value.startsWith('s3://')) {
    const config = configStore.config
    const testBucket = config?.s3BucketNames?.testImages
    
    // テスト画像のS3パスかチェック
    if (testBucket && (
      value.includes(`${testBucket}/images/circle_red.png`) ||
      value.includes(`${testBucket}/images/rectangle_blue.png`) ||
      value.includes(`${testBucket}/images/triangle_green.png`)
    )) {
      if (value.includes('circle_red.png')) {
        displayValue.value = 'circle'
      } else if (value.includes('rectangle_blue.png')) {
        displayValue.value = 'rectangle'
      } else if (value.includes('triangle_green.png')) {
        displayValue.value = 'triangle'
      }
    } else {
      // S3アップロード画像の場合は、selectedS3ImageDisplayで処理される
      displayValue.value = value
      
      // S3画像一覧が空の場合は読み込む
      if (s3Images.value.length === 0) {
        console.log('[ImageSelector] Loading S3 images because list is empty')
        loadS3Images()
      }
    }
  }
}

const truncateFileName = (fileName: string): string => {
  if (fileName.length <= 20) return fileName
  const ext = fileName.split('.').pop()
  const name = fileName.substring(0, fileName.lastIndexOf('.'))
  return `${name.substring(0, 15)}...${ext ? '.' + ext : ''}`
}

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// Watchers
watch(() => props.modelValue, updateDisplayValue, { immediate: true })

// Lifecycle
onMounted(() => {
  updateDisplayValue()
  // 初期S3画像読み込み
  loadS3Images()
  
  // アップロード完了イベントをリッスン
  const handleS3ImagesUpdated = (event: CustomEvent) => {
    console.log('[ImageSelector] S3 images updated event received:', event.detail)
    // 画像一覧を更新
    loadS3Images()
  }
  
  window.addEventListener('s3-images-updated', handleS3ImagesUpdated as EventListener)
  
  // クリーンアップ
  const cleanup = () => {
    window.removeEventListener('s3-images-updated', handleS3ImagesUpdated as EventListener)
  }
  
  // Vue 3のunmountedフックでクリーンアップ
  onUnmounted(cleanup)
})
</script>

<style scoped>
.image-selector-compact {
  display: flex;
  align-items: center;
  gap: 8px;
}

.form-select-compact {
  flex: 1;
  padding: 8px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  transition: border-color 0.3s ease;
}

.form-select-compact:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 2px rgba(102, 126, 234, 0.1);
}

.form-select-compact.required {
  border-color: #dc3545;
}

.refresh-button-compact {
  background: #6c757d;
  color: white;
  border: none;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  transition: background 0.3s ease;
  flex-shrink: 0;
}

.refresh-button-compact:hover:not(:disabled) {
  background: #5a6268;
}

.refresh-button-compact:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* モーダルスタイル */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal-content {
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  max-width: 800px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e0e0e0;
}

.modal-header h3 {
  margin: 0;
  color: #333;
  font-size: 1.2rem;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #666;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: background-color 0.3s;
}

.close-button:hover {
  background: #f0f0f0;
}

.modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
}

.spinner {
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 3px solid #0078d7;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  text-align: center;
  color: #666;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 15px;
  opacity: 0.5;
}

.image-gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 15px;
  padding: 10px 0;
}

.image-item {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.3s ease;
  background: white;
}

.image-item:hover {
  border-color: #0078d7;
  box-shadow: 0 4px 12px rgba(0, 120, 215, 0.2);
  transform: translateY(-2px);
}

.image-item.selected {
  border-color: #0078d7;
  box-shadow: 0 0 0 2px rgba(0, 120, 215, 0.3);
}

.image-thumbnail {
  position: relative;
  width: 100%;
  height: 150px;
  overflow: hidden;
  background: #f8f9fa;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-thumbnail img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  transition: transform 0.3s ease;
}

.image-item:hover .image-thumbnail img {
  transform: scale(1.05);
}

.selection-indicator {
  position: absolute;
  top: 8px;
  right: 8px;
  background: #0078d7;
  color: white;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: bold;
}

.image-info {
  padding: 12px;
}

.image-name {
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.image-meta {
  font-size: 0.85rem;
  color: #666;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 20px;
  border-top: 1px solid #e0e0e0;
}

.cancel-button,
.confirm-button {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: background-color 0.3s;
}

.cancel-button {
  background: #f8f9fa;
  color: #666;
  border: 1px solid #dee2e6;
}

.cancel-button:hover {
  background: #e9ecef;
}

.confirm-button {
  background: #0078d7;
  color: white;
}

.confirm-button:hover:not(:disabled) {
  background: #106ebe;
}

.confirm-button:disabled {
  background: #ccc;
  cursor: not-allowed;
}

/* レスポンシブデザイン */
@media (max-width: 768px) {
  .form-select-compact {
    font-size: 12px;
    padding: 6px;
  }
  
  .refresh-button-compact {
    width: 28px;
    height: 28px;
    padding: 6px;
  }

  .modal-overlay {
    padding: 10px;
  }

  .modal-content {
    max-height: 90vh;
  }

  .image-gallery {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }

  .image-thumbnail {
    height: 120px;
  }

  .modal-header,
  .modal-body,
  .modal-footer {
    padding: 15px;
  }
}
</style>