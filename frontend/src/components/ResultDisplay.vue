<template>
  <div class="result-display">
    <h2 class="result-title">生成結果</h2>

    <!-- ローディング状態 -->
    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>{{ loadingMessage || '画像を生成中...' }}</p>
    </div>

    <!-- エラー状態 -->
    <div v-else-if="error" class="error-state">
      <div class="error-icon">⚠️</div>
      <div class="error-content">
        <p class="error-message">{{ error }}</p>
        <div class="error-actions">
          <button @click="handleRetry" class="retry-button">
            🔄 再試行
          </button>
          <button @click="clearError" class="clear-button">
            ✕ エラーを閉じる
          </button>
        </div>
      </div>
    </div>

    <!-- 結果表示 -->
    <div v-else-if="resultUrl || staticImageUrl" class="result-content">
      <!-- 動画生成時は画像と動画を並べて表示 -->
      <div v-if="isVideoResult && staticImageUrl" class="dual-media-container">
        <div class="media-item">
          <h3 class="media-title">合成画像</h3>
          <div class="media-wrapper">
            <img 
              :src="staticImageUrl" 
              alt="合成画像" 
              class="result-image" 
              @error="handleMediaError"
              @load="handleMediaLoad"
            />
          </div>
        </div>
        
        <div class="media-item">
          <h3 class="media-title">生成動画</h3>
          <div class="media-wrapper">
            <video 
              :src="resultUrl" 
              class="result-video" 
              controls
              preload="metadata"
              @error="handleMediaError"
              @loadeddata="handleMediaLoad"
            >
              お使いのブラウザは動画の再生に対応していません。
            </video>
          </div>
        </div>
      </div>
      
      <!-- 単一メディア表示（従来の表示方式） -->
      <div v-else class="single-media-container">
        <!-- 動画表示 -->
        <video 
          v-if="isVideoResult"
          :src="resultUrl" 
          class="result-video" 
          controls
          preload="metadata"
          @error="handleMediaError"
          @loadeddata="handleMediaLoad"
        >
          お使いのブラウザは動画の再生に対応していません。
        </video>
        
        <!-- 画像表示 -->
        <img 
          v-else
          :src="resultUrl" 
          alt="合成画像" 
          class="result-image" 
          @error="handleMediaError"
          @load="handleMediaLoad"
        />
        
        <div v-if="mediaLoading" class="media-loading-overlay">
          <div class="media-spinner"></div>
        </div>
      </div>
      
      <div class="result-actions">
        <button @click="handleDownload" class="action-button download-button">
          📥 {{ isVideoResult ? '動画をダウンロード' : '画像をダウンロード' }}
        </button>
        <button @click="handleCopyUrl" class="action-button copy-button">
          📋 API URLをコピー
        </button>
        <button @click="handleRetry" class="action-button retry-button">
          🔄 再生成
        </button>
      </div>

      <!-- API URL表示 -->
      <div v-if="apiUrl" class="api-url-section">
        <h3 class="api-url-title">API URL:</h3>
        <div class="api-url-container">
          <code class="api-url-code">{{ apiUrl }}</code>
          <button @click="handleCopyUrl" class="copy-url-button" title="URLをコピー">
            📋
          </button>
        </div>
      </div>

      <!-- メディア情報 -->
      <div v-if="mediaInfo" class="media-info-section">
        <h3 class="media-info-title">{{ isVideoResult ? '動画情報' : '画像情報' }}:</h3>
        <div class="media-info-grid">
          <div class="info-item">
            <span class="info-label">サイズ:</span>
            <span class="info-value">{{ mediaInfo.dimensions }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">形式:</span>
            <span class="info-value">{{ mediaInfo.format }}</span>
          </div>
          <div v-if="isVideoResult && mediaInfo.duration" class="info-item">
            <span class="info-label">長さ:</span>
            <span class="info-value">{{ mediaInfo.duration }}</span>
          </div>
          <div class="info-item">
            <span class="info-label">生成時刻:</span>
            <span class="info-value">{{ mediaInfo.timestamp }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 空の状態 -->
    <div v-else class="empty-state">
      <div class="empty-icon">🎨</div>
      <p class="empty-message">「画像を生成」ボタンをクリックして画像を合成してください</p>
      <small class="empty-hint">パラメータを設定してから生成ボタンを押してください</small>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useNotificationStore } from '@/stores/notification'

// Props
interface Props {
  resultUrl: string
  staticImageUrl?: string  // 動画生成時の静止画像URL
  apiUrl: string
  isLoading: boolean
  error: string | null
  loadingMessage?: string
  isVideoGeneration?: boolean
  videoConfig?: {
    enabled: boolean
    duration: number
    format: string
  }
}

const props = withDefaults(defineProps<Props>(), {
  loadingMessage: '画像を生成中...',
  isVideoGeneration: false
})

// Emits
const emit = defineEmits<{
  'download-image': []
  'copy-api-url': []
  'retry-generation': []
  'clear-error': []
}>()

// Stores
const notificationStore = useNotificationStore()

// Reactive data
const mediaLoading = ref(false)

// Computed
const isVideoResult = computed(() => {
  return props.isVideoGeneration || (props.videoConfig?.enabled && props.resultUrl)
})

const mediaInfo = computed(() => {
  if (!props.resultUrl) return null
  
  if (isVideoResult.value) {
    return {
      dimensions: '1920 x 1080px',
      format: props.videoConfig?.format || 'MP4',
      duration: props.videoConfig?.duration ? `${props.videoConfig.duration}秒` : '不明',
      timestamp: new Date().toLocaleString('ja-JP')
    }
  } else {
    return {
      dimensions: '1920 x 1080px',
      format: 'PNG',
      timestamp: new Date().toLocaleString('ja-JP')
    }
  }
})

// 後方互換性のため
const imageInfo = computed(() => mediaInfo.value)

// Methods
const handleDownload = () => {
  if (!props.resultUrl) {
    notificationStore.showError(`ダウンロードする${isVideoResult.value ? '動画' : '画像'}がありません`)
    return
  }

  try {
    const link = document.createElement('a')
    link.href = props.resultUrl
    
    if (isVideoResult.value) {
      const extension = getVideoFileExtension(props.videoConfig?.format || 'XMF')
      link.download = `composite-video-${Date.now()}.${extension}`
      notificationStore.showSuccess(`動画ファイルのダウンロードを開始しました（${props.videoConfig?.format || 'XMF'}形式）`)
    } else {
      link.download = `composite-image-${Date.now()}.png`
      notificationStore.showSuccess('画像ファイルのダウンロードを開始しました')
    }
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    emit('download-image')
  } catch (error) {
    console.error('Download failed:', error)
    notificationStore.showError('ダウンロードに失敗しました')
  }
}

const getVideoFileExtension = (format: string): string => {
  const extensions = {
    'XMF': 'mp4',
    'MP4': 'mp4',
    'WEBM': 'webm',
    'AVI': 'avi'
  }
  return extensions[format as keyof typeof extensions] || 'mp4'
}

const handleCopyUrl = async () => {
  if (!props.apiUrl) {
    notificationStore.showError('コピーするURLがありません')
    return
  }

  try {
    await navigator.clipboard.writeText(props.apiUrl)
    notificationStore.showSuccess('API URLをクリップボードにコピーしました')
    emit('copy-api-url')
  } catch (error) {
    console.error('Copy failed:', error)
    
    // フォールバック: テキストエリアを使用
    try {
      const textArea = document.createElement('textarea')
      textArea.value = props.apiUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
      
      notificationStore.showSuccess('API URLをクリップボードにコピーしました')
      emit('copy-api-url')
    } catch (fallbackError) {
      notificationStore.showError('URLのコピーに失敗しました')
    }
  }
}

const handleRetry = () => {
  emit('retry-generation')
}

const clearError = () => {
  emit('clear-error')
}

const handleMediaError = () => {
  console.error(`${isVideoResult.value ? '動画' : '画像'}の読み込みに失敗しました`)
  mediaLoading.value = false
  notificationStore.showError(`${isVideoResult.value ? '動画' : '画像'}の表示に失敗しました`)
}

const handleMediaLoad = () => {
  mediaLoading.value = false
}

// 後方互換性のため
const handleImageError = handleMediaError
const handleImageLoad = handleMediaLoad

// Watchers
watch(() => props.resultUrl, (newUrl) => {
  if (newUrl) {
    mediaLoading.value = true
  }
}, { immediate: true })
</script>

<style scoped>
.result-display {
  background-color: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.result-title {
  margin-bottom: 20px;
  color: #0078d7;
  border-bottom: 2px solid #e0e0e0;
  padding-bottom: 10px;
  font-size: 1.5rem;
  font-weight: 600;
}

/* デュアルメディア表示（画像と動画を並べて表示） */
.dual-media-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

.media-item {
  display: flex;
  flex-direction: column;
}

.media-title {
  font-size: 1.1rem;
  font-weight: 600;
  color: #333;
  margin-bottom: 10px;
  text-align: center;
  padding: 8px;
  background-color: #f5f5f5;
  border-radius: 4px;
}

.media-wrapper {
  position: relative;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  overflow: hidden;
  background-color: #f9f9f9;
}

.single-media-container {
  margin-bottom: 20px;
}

/* レスポンシブ対応 */
@media (max-width: 768px) {
  .dual-media-container {
    grid-template-columns: 1fr;
    gap: 15px;
  }
}

/* ローディング状態 */
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

.spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 4px solid #0078d7;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

/* エラー状態 */
.error-state {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 20px;
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  border-radius: 8px;
  color: #721c24;
}

.error-icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.error-content {
  flex: 1;
}

.error-message {
  margin: 0 0 12px 0;
  font-weight: 500;
}

.error-actions {
  display: flex;
  gap: 8px;
}

.retry-button,
.clear-button {
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.3s;
}

.retry-button {
  background: #721c24;
  color: white;
}

.retry-button:hover {
  background: #5a161f;
}

.clear-button {
  background: transparent;
  color: #721c24;
  border: 1px solid #721c24;
}

.clear-button:hover {
  background: rgba(114, 28, 36, 0.1);
}

/* 結果表示 */
.result-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.media-container {
  position: relative;
  text-align: center;
}

.result-image,
.result-video {
  max-width: 100%;
  height: auto;
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.result-video {
  background: #000;
}

.media-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.media-spinner {
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 3px solid #0078d7;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
}

/* 後方互換性のため */
.image-container {
  position: relative;
  text-align: center;
}

.image-loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
}

.image-spinner {
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 3px solid #0078d7;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
}

/* アクションボタン */
.result-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.action-button {
  padding: 12px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 500;
  transition: all 0.3s ease;
  display: flex;
  align-items: center;
  gap: 8px;
}

.download-button {
  background: #28a745;
  color: white;
}

.download-button:hover {
  background: #218838;
  transform: translateY(-2px);
}

.copy-button {
  background: #17a2b8;
  color: white;
}

.copy-button:hover {
  background: #138496;
  transform: translateY(-2px);
}

.retry-button {
  background: #6c757d;
  color: white;
}

.retry-button:hover {
  background: #5a6268;
  transform: translateY(-2px);
}

/* API URL セクション */
.api-url-section {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.api-url-title {
  margin: 0 0 8px 0;
  font-size: 1rem;
  font-weight: 600;
  color: #495057;
}

.api-url-container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.api-url-code {
  flex: 1;
  padding: 8px 12px;
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9rem;
  word-break: break-all;
  overflow-x: auto;
}

.copy-url-button {
  background: #6c757d;
  color: white;
  border: none;
  padding: 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.3s;
  flex-shrink: 0;
}

.copy-url-button:hover {
  background: #5a6268;
}

/* メディア情報セクション */
.media-info-section {
  background: #e7f3ff;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #b3d9ff;
}

.media-info-title {
  margin: 0 0 12px 0;
  font-size: 1rem;
  font-weight: 600;
  color: #0056b3;
}

.media-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

/* 後方互換性のため */
.image-info-section {
  background: #e7f3ff;
  padding: 16px;
  border-radius: 6px;
  border: 1px solid #b3d9ff;
}

.image-info-title {
  margin: 0 0 12px 0;
  font-size: 1rem;
  font-weight: 600;
  color: #0056b3;
}

.image-info-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.info-label {
  font-size: 0.9rem;
  font-weight: 500;
  color: #495057;
}

.info-value {
  font-size: 0.9rem;
  color: #212529;
}

/* 空の状態 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
  color: #6c757d;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-message {
  margin: 0 0 8px 0;
  font-size: 1.1rem;
  font-weight: 500;
}

.empty-hint {
  font-size: 0.9rem;
  opacity: 0.8;
}

/* アニメーション */
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* レスポンシブデザイン */
@media (max-width: 768px) {
  .result-display {
    padding: 16px;
  }
  
  .result-actions {
    flex-direction: column;
  }
  
  .action-button {
    width: 100%;
    justify-content: center;
  }
  
  .api-url-container {
    flex-direction: column;
    align-items: stretch;
  }
  
  .copy-url-button {
    align-self: flex-end;
    width: auto;
  }
  
  .image-info-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .error-state {
    flex-direction: column;
    text-align: center;
  }
  
  .error-actions {
    justify-content: center;
  }
}
</style>