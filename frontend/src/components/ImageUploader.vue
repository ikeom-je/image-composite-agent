<template>
  <div class="image-uploader">
    <h3 class="uploader-title">📁 画像アップロード</h3>
    
    <!-- ファイル選択エリア -->
    <div 
      class="upload-area" 
      :class="{ 'drag-over': isDragOver, 'uploading': uploading }"
      @drop="handleDrop" 
      @dragover.prevent="isDragOver = true"
      @dragleave.prevent="isDragOver = false"
      @dragenter.prevent
    >
      <input 
        ref="fileInput" 
        type="file" 
        accept="image/*" 
        @change="handleFileSelect"
        style="display: none"
      />
      
      <div v-if="!uploading" class="upload-content">
        <div class="upload-icon">📤</div>
        <button @click="$refs.fileInput.click()" class="upload-button">
          画像ファイルを選択
        </button>
        <p class="upload-hint">または、画像ファイルをここにドラッグ&ドロップ</p>
        <div class="file-constraints">
          <small>対応形式: JPEG, PNG, GIF, WebP, TIFF, TGA</small>
          <small>最大サイズ: 10MB</small>
        </div>
      </div>
      
      <div v-else class="uploading-content">
        <div class="upload-spinner"></div>
        <p>アップロード中...</p>
      </div>
    </div>
    
    <!-- アップロード進行状況 -->
    <div v-if="uploading" class="upload-progress">
      <div class="progress-bar">
        <div class="progress-fill" :style="{width: uploadProgress + '%'}"></div>
      </div>
      <p class="progress-text">{{ uploadProgress }}% 完了</p>
    </div>
    
    <!-- エラー表示 -->
    <div v-if="error" class="error-message">
      <div class="error-icon">⚠️</div>
      <div class="error-content">
        <strong>アップロードエラー</strong>
        <p>{{ error }}</p>
        <button @click="clearError" class="error-dismiss">✕</button>
      </div>
    </div>
    
    <!-- 成功メッセージ -->
    <div v-if="uploadSuccess" class="success-message">
      <div class="success-icon">✅</div>
      <div class="success-content">
        <strong>アップロード完了</strong>
        <p>{{ uploadedFileName }} がアップロードされました</p>
        <button @click="clearSuccess" class="success-dismiss">✕</button>
      </div>
    </div>
    
    <!-- アップロード履歴 -->
    <div v-if="uploadHistory.length > 0" class="upload-history">
      <h4>最近のアップロード</h4>
      <div class="history-list">
        <div 
          v-for="(item, index) in uploadHistory" 
          :key="index"
          class="history-item"
        >
          <div class="history-info">
            <span class="history-filename">{{ item.fileName }}</span>
            <span class="history-time">{{ formatTime(item.timestamp) }}</span>
          </div>
          <button 
            @click="useUploadedImage(item)"
            class="use-image-button"
            title="この画像を使用"
          >
            使用
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useNotificationStore } from '@/stores/notification'
import axios from 'axios'

// Props and Emits
const emit = defineEmits<{
  'upload-complete': [data: {
    fileName: string
    s3Key: string
    s3Path: string
    thumbnailUrl?: string
  }]
}>()

// Stores
const configStore = useConfigStore()
const notificationStore = useNotificationStore()

// Reactive data
const fileInput = ref<HTMLInputElement>()
const isDragOver = ref(false)
const uploading = ref(false)
const uploadProgress = ref(0)
const error = ref('')
const uploadSuccess = ref(false)
const uploadedFileName = ref('')
const uploadHistory = ref<Array<{
  fileName: string
  s3Key: string
  s3Path: string
  timestamp: Date
  thumbnailUrl?: string
}>>([])

// Methods
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) {
    uploadFile(file)
  }
}

const handleDrop = (event: DragEvent) => {
  event.preventDefault()
  isDragOver.value = false
  
  const file = event.dataTransfer?.files[0]
  if (file) {
    uploadFile(file)
  }
}

const uploadFile = async (file: File) => {
  // ファイル検証
  if (!validateFile(file)) {
    return
  }
  
  uploading.value = true
  uploadProgress.value = 0
  error.value = ''
  uploadSuccess.value = false
  
  try {
    // 署名付きURL取得
    const presignedResponse = await getPresignedUrl(file)
    
    // S3に直接アップロード
    await uploadToS3(file, presignedResponse.uploadUrl)
    
    // 成功処理
    uploadSuccess.value = true
    uploadedFileName.value = file.name
    
    const uploadData = {
      fileName: file.name,
      s3Key: presignedResponse.s3Key,
      s3Path: `s3://${presignedResponse.bucketName}/${presignedResponse.s3Key}`,
      thumbnailUrl: undefined // サムネイルは後で生成される
    }
    
    // 履歴に追加
    uploadHistory.value.unshift({
      ...uploadData,
      timestamp: new Date()
    })
    
    // 履歴は最大5件まで
    if (uploadHistory.value.length > 5) {
      uploadHistory.value = uploadHistory.value.slice(0, 5)
    }
    
    // 親コンポーネントに通知
    emit('upload-complete', uploadData)
    
    // 通知表示
    notificationStore.showSuccess(`${file.name} のアップロードが完了しました`)
    
    // 3秒後に成功メッセージを自動で消す
    setTimeout(() => {
      uploadSuccess.value = false
    }, 3000)
    
  } catch (err: any) {
    error.value = handleUploadError(err)
    notificationStore.showError(error.value)
  } finally {
    uploading.value = false
    uploadProgress.value = 0
  }
}

const validateFile = (file: File): boolean => {
  // ファイルサイズ制限（10MB）
  if (file.size > 10 * 1024 * 1024) {
    error.value = 'ファイルサイズは10MB以下にしてください'
    return false
  }
  
  // ファイル形式チェック（画像のみ）
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'image/tiff', 'image/x-tga'
  ]
  
  if (!allowedTypes.includes(file.type)) {
    error.value = `対応していない画像形式です: ${file.type}`
    return false
  }
  
  return true
}

const getPresignedUrl = async (file: File) => {
  const config = configStore.config
  if (!config?.apiUrl) {
    throw new Error('API設定が読み込まれていません')
  }
  
  const uploadApiUrl = config.apiUrl.replace('/images/composite', '/upload/presigned-url')
  
  const response = await axios.post(uploadApiUrl, {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size
  }, {
    headers: {
      'Content-Type': 'application/json'
    }
  })
  
  return response.data
}

const uploadToS3 = async (file: File, uploadUrl: string): Promise<void> => {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    
    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        uploadProgress.value = Math.round((event.loaded / event.total) * 100)
      }
    })
    
    xhr.addEventListener('load', () => {
      if (xhr.status === 200) {
        resolve()
      } else {
        reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`))
      }
    })
    
    xhr.addEventListener('error', () => {
      reject(new Error('Network error during upload'))
    })
    
    xhr.addEventListener('timeout', () => {
      reject(new Error('Upload timeout'))
    })
    
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.timeout = 60000 // 60秒タイムアウト
    xhr.send(file)
  })
}

const handleUploadError = (error: any): string => {
  if (error.response?.status === 400) {
    return error.response.data.error || 'アップロードパラメータが無効です'
  } else if (error.response?.status === 413) {
    return 'ファイルサイズが大きすぎます'
  } else if (error.response?.status === 500) {
    return 'サーバーエラーが発生しました。しばらく待ってから再試行してください。'
  } else if (error.message?.includes('timeout')) {
    return 'アップロードがタイムアウトしました。ファイルサイズを確認してください。'
  } else if (error.message?.includes('Network error')) {
    return 'ネットワークエラーが発生しました。接続を確認してください。'
  } else {
    return error.message || 'アップロードに失敗しました。再試行してください。'
  }
}

const clearError = () => {
  error.value = ''
}

const clearSuccess = () => {
  uploadSuccess.value = false
}

const useUploadedImage = (item: any) => {
  emit('upload-complete', {
    fileName: item.fileName,
    s3Key: item.s3Key,
    s3Path: item.s3Path,
    thumbnailUrl: item.thumbnailUrl
  })
  notificationStore.showSuccess(`${item.fileName} を選択しました`)
}

const formatTime = (timestamp: Date): string => {
  const now = new Date()
  const diff = now.getTime() - timestamp.getTime()
  const minutes = Math.floor(diff / 60000)
  
  if (minutes < 1) {
    return 'たった今'
  } else if (minutes < 60) {
    return `${minutes}分前`
  } else {
    const hours = Math.floor(minutes / 60)
    if (hours < 24) {
      return `${hours}時間前`
    } else {
      return timestamp.toLocaleDateString()
    }
  }
}

// Lifecycle
onMounted(() => {
  // ローカルストレージから履歴を復元
  const savedHistory = localStorage.getItem('imageUploadHistory')
  if (savedHistory) {
    try {
      const parsed = JSON.parse(savedHistory)
      uploadHistory.value = parsed.map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp)
      }))
    } catch (e) {
      console.warn('Failed to restore upload history:', e)
    }
  }
})

// 履歴をローカルストレージに保存
const saveHistory = () => {
  localStorage.setItem('imageUploadHistory', JSON.stringify(uploadHistory.value))
}

// 履歴が変更されたら保存
import { watch } from 'vue'
watch(uploadHistory, saveHistory, { deep: true })
</script>

<style scoped>
.image-uploader {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 24px;
  border: 1px solid #e9ecef;
}

.uploader-title {
  margin: 0 0 20px 0;
  color: #495057;
  font-size: 1.2rem;
  font-weight: 600;
}

.upload-area {
  border: 2px dashed #dee2e6;
  border-radius: 8px;
  padding: 40px 20px;
  text-align: center;
  background: white;
  transition: all 0.3s ease;
  cursor: pointer;
}

.upload-area:hover {
  border-color: #667eea;
  background: #f8f9ff;
}

.upload-area.drag-over {
  border-color: #667eea;
  background: #e3f2fd;
  transform: scale(1.02);
}

.upload-area.uploading {
  border-color: #28a745;
  background: #f8fff9;
  cursor: not-allowed;
}

.upload-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.upload-icon {
  font-size: 3rem;
  opacity: 0.6;
}

.upload-button {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
}

.upload-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
}

.upload-hint {
  color: #6c757d;
  margin: 0;
  font-size: 0.9rem;
}

.file-constraints {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.file-constraints small {
  color: #868e96;
  font-size: 0.8rem;
}

.uploading-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.upload-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.upload-progress {
  margin-top: 20px;
}

.progress-bar {
  width: 100%;
  height: 8px;
  background: #e9ecef;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transition: width 0.3s ease;
  border-radius: 4px;
}

.progress-text {
  text-align: center;
  margin: 8px 0 0 0;
  color: #495057;
  font-size: 0.9rem;
}

.error-message,
.success-message {
  margin-top: 16px;
  padding: 16px;
  border-radius: 8px;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.error-message {
  background: #f8d7da;
  border: 1px solid #f5c6cb;
  color: #721c24;
}

.success-message {
  background: #d4edda;
  border: 1px solid #c3e6cb;
  color: #155724;
}

.error-icon,
.success-icon {
  font-size: 1.2rem;
  flex-shrink: 0;
}

.error-content,
.success-content {
  flex: 1;
}

.error-content strong,
.success-content strong {
  display: block;
  margin-bottom: 4px;
}

.error-content p,
.success-content p {
  margin: 0;
  font-size: 0.9rem;
}

.error-dismiss,
.success-dismiss {
  background: none;
  border: none;
  font-size: 1.2rem;
  cursor: pointer;
  opacity: 0.6;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.error-dismiss:hover,
.success-dismiss:hover {
  opacity: 1;
}

.upload-history {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid #dee2e6;
}

.upload-history h4 {
  margin: 0 0 12px 0;
  color: #495057;
  font-size: 1rem;
  font-weight: 600;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: white;
  border-radius: 6px;
  border: 1px solid #e9ecef;
}

.history-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.history-filename {
  font-weight: 500;
  color: #495057;
  font-size: 0.9rem;
}

.history-time {
  color: #6c757d;
  font-size: 0.8rem;
}

.use-image-button {
  background: #28a745;
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 0.8rem;
  cursor: pointer;
  transition: background 0.3s ease;
}

.use-image-button:hover {
  background: #218838;
}

/* レスポンシブデザイン */
@media (max-width: 768px) {
  .image-uploader {
    padding: 16px;
  }
  
  .upload-area {
    padding: 30px 15px;
  }
  
  .upload-icon {
    font-size: 2.5rem;
  }
  
  .upload-button {
    padding: 10px 20px;
    font-size: 0.9rem;
  }
  
  .history-item {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }
  
  .use-image-button {
    align-self: flex-end;
  }
}
</style>