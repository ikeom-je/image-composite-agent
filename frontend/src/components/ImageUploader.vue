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

    <!-- アセット一覧ボタン -->
    <div class="asset-list-section">
      <button @click="openAssetModal" class="asset-list-button">
        📋 アセット一覧
      </button>
    </div>

    <!-- アセット一覧モーダル -->
    <div v-if="showAssetModal" class="modal-overlay" @click="closeAssetModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>アセット一覧</h3>
          <button @click="closeAssetModal" class="close-button">✕</button>
        </div>

        <div class="modal-body">
          <!-- 読み込み中 -->
          <div v-if="loadingAssets" class="loading-state">
            <div class="spinner"></div>
            <p>読み込み中...</p>
          </div>

          <!-- 画像がない場合 -->
          <div v-else-if="assetImages.length === 0" class="empty-state">
            <div class="empty-icon">📷</div>
            <p>アップロードされた画像がありません</p>
          </div>

          <!-- 画像一覧 -->
          <div v-else class="asset-list">
            <div
              v-for="image in assetImages"
              :key="image.key"
              class="asset-item"
            >
              <div class="asset-thumbnail">
                <img
                  :src="image.thumbnailUrl"
                  :alt="image.fileName"
                  @error="handleImageError"
                  loading="lazy"
                />
              </div>
              <div class="asset-info">
                <div class="asset-name" :title="image.fileName">{{ truncateFileName(image.fileName) }}</div>
                <div class="asset-meta">
                  {{ formatFileSize(image.size) }} · {{ formatDate(image.lastModified) }}
                </div>
              </div>
              <button
                @click="confirmDeleteImage(image)"
                class="delete-button"
                :disabled="deletingKey === image.key"
                title="この画像を削除"
              >
                <span v-if="deletingKey === image.key">...</span>
                <span v-else>🗑️</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useConfigStore } from '@/stores/config'
import { useNotificationStore } from '@/stores/notification'
import axios from 'axios'

interface S3Image {
  key: string
  fileName: string
  size: number
  lastModified: string
  thumbnailUrl: string
}

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

// アセット一覧モーダル
const showAssetModal = ref(false)
const loadingAssets = ref(false)
const assetImages = ref<S3Image[]>([])
const deletingKey = ref('')

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

    // 親コンポーネントに通知
    emit('upload-complete', uploadData)

    // 通知表示
    notificationStore.showSuccess(`${file.name} のアップロードが完了しました`)

    // ImageSelectorにも通知
    window.dispatchEvent(new CustomEvent('s3-images-updated'))

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
  const uploadBaseUrl = configStore.uploadApiUrl
  if (!uploadBaseUrl) {
    throw new Error('API設定が読み込まれていません')
  }

  // URLを安全に構築（末尾スラッシュの重複を防ぐ）
  const base = uploadBaseUrl.replace(/\/+$/, '')
  const uploadApiUrl = `${base}/presigned-url`

  console.log(`[ImageUploader] Requesting presigned URL from: ${uploadApiUrl}`)

  const response = await axios.post(uploadApiUrl, {
    fileName: file.name,
    fileType: file.type,
    fileSize: file.size
  }, {
    headers: {
      'Content-Type': 'application/json'
    }
  })

  const data = response.data
  if (!data || !data.uploadUrl) {
    console.error('[ImageUploader] Invalid presigned URL response:', data)
    throw new Error('署名付きURLの取得に失敗しました')
  }

  console.log(`[ImageUploader] Presigned URL obtained for key: ${data.s3Key}`)
  return data
}

const uploadToS3 = async (file: File, uploadUrl: string): Promise<void> => {
  // presigned URLの検証
  try {
    new URL(uploadUrl)
  } catch {
    console.error('[ImageUploader] Invalid presigned upload URL:', uploadUrl)
    throw new Error('無効なアップロードURLです。再試行してください。')
  }

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

// アセット一覧モーダル
const openAssetModal = async () => {
  showAssetModal.value = true
  await fetchAssetImages()
}

const closeAssetModal = () => {
  showAssetModal.value = false
}

const fetchAssetImages = async () => {
  const uploadBaseUrl = configStore.uploadApiUrl
  if (!uploadBaseUrl) return

  loadingAssets.value = true
  try {
    const base = uploadBaseUrl.replace(/\/+$/, '')
    const response = await axios.get(`${base}/images`)
    assetImages.value = response.data.images || []
  } catch (err) {
    console.error('[ImageUploader] Failed to fetch assets:', err)
    notificationStore.showError('アセット一覧の取得に失敗しました')
  } finally {
    loadingAssets.value = false
  }
}

const confirmDeleteImage = async (image: S3Image) => {
  if (!confirm(`「${image.fileName}」を削除しますか？この操作は取り消せません。`)) {
    return
  }
  await deleteImage(image)
}

const deleteImage = async (image: S3Image) => {
  const uploadBaseUrl = configStore.uploadApiUrl
  if (!uploadBaseUrl) return

  deletingKey.value = image.key
  try {
    const base = uploadBaseUrl.replace(/\/+$/, '')
    await axios.delete(`${base}/images`, {
      params: { key: image.key }
    })
    notificationStore.showSuccess(`${image.fileName} を削除しました`)

    // リストを再取得
    await fetchAssetImages()

    // ImageSelectorにも通知
    window.dispatchEvent(new CustomEvent('s3-images-updated'))
  } catch (err: any) {
    const msg = err.response?.data?.error || '画像の削除に失敗しました'
    notificationStore.showError(msg)
  } finally {
    deletingKey.value = ''
  }
}

const truncateFileName = (name: string): string => {
  if (name.length <= 30) return name
  const ext = name.split('.').pop() || ''
  return name.substring(0, 25) + '...' + ext
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const handleImageError = (event: Event) => {
  const img = event.target as HTMLImageElement
  img.style.display = 'none'
}
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

/* アセット一覧ボタン */
.asset-list-section {
  margin-top: 20px;
  text-align: center;
}

.asset-list-button {
  background: #495057;
  color: white;
  border: none;
  padding: 10px 24px;
  border-radius: 6px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.95rem;
}

.asset-list-button:hover {
  background: #343a40;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

/* モーダル */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 640px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid #e9ecef;
}

.modal-header h3 {
  margin: 0;
  font-size: 1.2rem;
  color: #212529;
}

.close-button {
  background: none;
  border: none;
  font-size: 1.4rem;
  cursor: pointer;
  color: #6c757d;
  padding: 4px 8px;
  border-radius: 4px;
}

.close-button:hover {
  background: #f1f3f5;
  color: #212529;
}

.modal-body {
  padding: 20px 24px;
  overflow-y: auto;
  flex: 1;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: #6c757d;
}

.spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #f3f3f3;
  border-top: 3px solid #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 16px;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 12px;
  opacity: 0.5;
}

/* アセットリスト */
.asset-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.asset-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
  transition: background 0.2s;
}

.asset-item:hover {
  background: #e9ecef;
}

.asset-thumbnail {
  width: 48px;
  height: 48px;
  border-radius: 6px;
  overflow: hidden;
  background: #dee2e6;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-thumbnail img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-info {
  flex: 1;
  min-width: 0;
}

.asset-name {
  font-weight: 500;
  color: #212529;
  font-size: 0.9rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.asset-meta {
  color: #6c757d;
  font-size: 0.8rem;
  margin-top: 2px;
}

.delete-button {
  background: none;
  border: 1px solid #dc3545;
  color: #dc3545;
  width: 36px;
  height: 36px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
  font-size: 1rem;
}

.delete-button:hover:not(:disabled) {
  background: #dc3545;
  color: white;
}

.delete-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

  .modal-content {
    width: 95%;
    max-height: 85vh;
  }
}
</style>
