<template>
  <div class="image-selector-compact">
    <!-- シンプルな選択ドロップダウン -->
    <select 
      v-model="selectedValue" 
      @change="handleSelectionChange" 
      class="form-select-compact"
      :class="{ 'required': required && !modelValue }"
    >
      <option value="">{{ required ? '選択してください' : '選択しない' }}</option>
      <optgroup label="テスト画像">
        <option value="test">自動選択（{{ getAutoSelectDescription() }}）</option>
        <option value="circle">🔴 赤い円</option>
        <option value="rectangle">🔷 青い四角</option>
        <option value="triangle">🔺 緑の三角</option>
      </optgroup>
      <optgroup v-if="s3Images.length > 0" label="S3アップロード画像">
        <option 
          v-for="image in s3Images" 
          :key="image.key"
          :value="image.s3Path"
          :title="`${image.fileName} (${formatFileSize(image.size)})`"
        >
          📷 {{ truncateFileName(image.fileName) }}
        </option>
      </optgroup>
      <optgroup v-else-if="!loadingImages" label="S3アップロード画像">
        <option disabled>アップロードされた画像がありません</option>
      </optgroup>
      <optgroup v-else label="S3アップロード画像">
        <option disabled>読み込み中...</option>
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

// Computed
const showRefreshButton = computed(() => {
  return s3Images.value.length > 0 || selectedValue.value.startsWith('s3://')
})

const getAutoSelectDescription = () => {
  const descriptions = {
    image1: '赤い円',
    image2: '青い四角',
    image3: '緑の三角'
  }
  return descriptions[props.imageType as keyof typeof descriptions] || '自動選択'
}

// Methods
const handleSelectionChange = () => {
  const value = selectedValue.value
  
  if (!value) {
    emit('update:modelValue', '')
    return
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
  } else if (value.startsWith('s3://')) {
    // S3画像を直接選択
    emit('update:modelValue', value)
  }
}

const loadS3Images = async () => {
  loadingImages.value = true
  
  try {
    const config = configStore.config
    if (!config?.apiUrl) {
      console.warn('[ImageSelector] API設定が読み込まれていません')
      return
    }
    
    // アップロードAPIのURLを正しく構築
    const baseApiUrl = config.apiUrl.replace('/images/composite', '')
    const uploadApiUrl = `${baseApiUrl}/upload/images`
    
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

const updateSelectionFromValue = (value: string) => {
  console.log(`[ImageSelector] Updating selection from value: ${value}`)
  
  if (!value) {
    selectedValue.value = ''
  } else if (value === 'test') {
    selectedValue.value = 'test'
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
        selectedValue.value = 'circle'
      } else if (value.includes('rectangle_blue.png')) {
        selectedValue.value = 'rectangle'
      } else if (value.includes('triangle_green.png')) {
        selectedValue.value = 'triangle'
      }
    } else {
      // S3アップロード画像
      console.log(`[ImageSelector] Setting S3 upload image: ${value}`)
      selectedValue.value = value
      
      // S3画像一覧が空の場合は読み込む
      if (s3Images.value.length === 0) {
        console.log('[ImageSelector] Loading S3 images because list is empty')
        loadS3Images()
      } else {
        // 既存の画像一覧に含まれているかチェック
        const foundImage = s3Images.value.find(img => img.s3Path === value)
        if (!foundImage) {
          console.log('[ImageSelector] Image not found in current list, refreshing')
          loadS3Images()
        }
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
watch(() => props.modelValue, updateSelectionFromValue, { immediate: true })

// Lifecycle
onMounted(() => {
  updateSelectionFromValue(props.modelValue)
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
}
</style>