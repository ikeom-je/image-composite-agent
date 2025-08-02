<template>
  <div class="app-container">
    <!-- 通知システム -->
    <NotificationSystem />
    
    <!-- ローディングオーバーレイ -->
    <LoadingOverlay v-if="appStore.isLoading" :message="appStore.loading.message" />
    
    <!-- パフォーマンス監視 -->
    <PerformanceMonitor v-if="configStore.isDebugMode || configStore.isDevelopment" />

    <header>
      <h1>🎨 画像合成REST API v2.4</h1>
      <p class="subtitle">S3画像アップロード機能付き | 3画像合成対応 | Vue.js 3 + AWS Lambda + S3</p>
      <div v-if="configStore.config" class="config-info">
        <small>Version: {{ configStore.version }} | Environment: {{ configStore.environment }}</small>
      </div>
    </header>

    <!-- 設定読み込み中の表示 -->
    <div v-if="!configStore.isLoaded" class="config-loading">
      <div class="spinner"></div>
      <p>設定を読み込み中...</p>
    </div>

    <div v-else class="main-content">
      <div class="form-container">
        <h2>画像合成パラメータ</h2>

        <!-- 画像アップロード機能 -->
        <div class="upload-section">
          <ImageUploader @upload-complete="handleUploadComplete" />
        </div>

        <!-- ベース画像選択 -->
        <div class="form-group">
          <label class="form-label">ベース画像:</label>
          <select v-model="params.baseImage" class="form-select">
            <option value="test">テスト画像 (AWS Logo)</option>
            <option value="transparent">透明背景</option>
          </select>
        </div>

        <!-- 画像設定テーブル -->
        <ImageConfigTable 
          :image-configs="imageConfigs"
          @update-config="handleConfigUpdate"
        />

        <!-- 出力形式選択 -->
        <div class="form-group">
          <label class="form-label">出力形式:</label>
          <select v-model="params.format" class="form-select">
            <option value="html">HTML表示</option>
            <option value="png">PNG直接ダウンロード</option>
          </select>
        </div>

        <!-- 画像生成ボタン（目立つデザイン） -->
        <div class="generate-button-section">
          <button 
            @click="generateImage" 
            :disabled="appStore.isLoading || !imageConfigs.image1.source || !imageConfigs.image2.source"
            class="generate-button"
          >
            <span v-if="appStore.isLoading" class="loading-content">
              <svg class="spinner-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z">
                </path>
              </svg>
              生成中...
            </span>
            <span v-else class="button-content">
              🎨 {{ imageConfigs.image3.source ? '3画像を合成' : '2画像を合成' }}
            </span>
          </button>
        </div>
      </div>

      <!-- 結果表示コンポーネント -->
      <div class="result-container">
        <ResultDisplay
          :result-url="resultUrl"
          :api-url="apiUrl"
          :is-loading="appStore.isLoading"
          :error="error"
          @download-image="downloadImage"
          @copy-api-url="copyApiUrl"
          @retry-generation="handleRetryGeneration"
          @clear-error="handleClearError"
        />
      </div>
    </div>

    <div class="examples">
      <h2>使用例</h2>
      <div class="example-cards">
        <div class="example-card" v-for="(example, index) in examples" :key="index" @click="loadExample(example)">
          <h3>{{ example.title }}</h3>
          <p>{{ example.description }}</p>
        </div>
      </div>
    </div>

    <footer>
      <p>画像合成REST API - 高性能・アルファチャンネル対応 🎨✨</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAppStore } from '@/stores/app'
import { useConfigStore } from '@/stores/config'
import { useNotificationStore } from '@/stores/notification'
import NotificationSystem from '@/components/NotificationSystem.vue'
import LoadingOverlay from '@/components/LoadingOverlay.vue'
import PerformanceMonitor from '@/components/PerformanceMonitor.vue'
import ImageUploader from '@/components/ImageUploader.vue'
import ImageConfigTable from '@/components/ImageConfigTable.vue'
import ResultDisplay from '@/components/ResultDisplay.vue'
import axios from 'axios'

// ストアの使用
const appStore = useAppStore()
const configStore = useConfigStore()
const notificationStore = useNotificationStore()

// パラメータ（1920x1080固定キャンバス）
const params = ref({
  baseImage: 'test',
  canvas_width: 1920,
  canvas_height: 1080,
  format: 'html'
})

// 画像設定（ImageConfigTableで使用）
const imageConfigs = ref({
  image1: {
    source: 'test',
    x: 100,
    y: 100,
    width: 400,
    height: 300
  },
  image2: {
    source: 'test',
    x: 600,
    y: 100,
    width: 400,
    height: 300
  },
  image3: {
    source: '',
    x: 350,
    y: 400,
    width: 400,
    height: 300
  }
})

// 結果表示用
const resultUrl = ref('')
const apiUrl = ref('')
const error = ref('')

// 使用例
const examples = ref([
  {
    title: '🎨 基本的な3画像合成',
    description: '円・四角・三角の3つの図形を合成',
    params: {
      baseImage: 'test',
      image1: 'test',
      image1_x: 100,
      image1_y: 100,
      image1_width: 400,
      image1_height: 300,
      image2: 'test',
      image2_x: 600,
      image2_y: 100,
      image2_width: 400,
      image2_height: 300,
      image3: 'test',
      image3_x: 350,
      image3_y: 400,
      image3_width: 400,
      image3_height: 300,
      format: 'html'
    }
  },
  {
    title: '🔺 透明背景での3画像合成',
    description: '透明背景に3つの図形を配置',
    params: {
      baseImage: 'transparent',
      image1: 'test',
      image1_x: 100,
      image1_y: 100,
      image1_width: 400,
      image1_height: 300,
      image2: 'test',
      image2_x: 1400,
      image2_y: 100,
      image2_width: 400,
      image2_height: 300,
      image3: 'test',
      image3_x: 750,
      image3_y: 400,
      image3_width: 400,
      image3_height: 300,
      format: 'html'
    }
  },
  {
    title: '📐 基本的な2画像合成',
    description: '従来の2画像合成（後方互換性）',
    params: {
      baseImage: 'test',
      image1: 'test',
      image1_x: 100,
      image1_y: 100,
      image1_width: 400,
      image1_height: 300,
      image2: 'test',
      image2_x: 600,
      image2_y: 100,
      image2_width: 400,
      image2_height: 300,
      image3: '',
      format: 'html'
    }
  }
])

// メソッド
const buildApiUrl = () => {
  // API URLが設定されているかチェック
  if (!configStore.apiUrl) {
    throw new Error('API URL is not configured. Please check your configuration.')
  }

  const url = new URL(configStore.apiUrl)

  // ベース画像パラメータを追加
  if (params.value.baseImage) {
    url.searchParams.set('baseImage', params.value.baseImage)
  }

  // 必須パラメータを追加
  url.searchParams.set('image1', imageConfigs.value.image1.source)
  url.searchParams.set('image2', imageConfigs.value.image2.source)

  // 画像1のパラメータ（正しいパラメータ名を使用）
  url.searchParams.set('image1X', imageConfigs.value.image1.x.toString())
  url.searchParams.set('image1Y', imageConfigs.value.image1.y.toString())
  url.searchParams.set('image1Width', imageConfigs.value.image1.width.toString())
  url.searchParams.set('image1Height', imageConfigs.value.image1.height.toString())

  // 画像2のパラメータ
  url.searchParams.set('image2X', imageConfigs.value.image2.x.toString())
  url.searchParams.set('image2Y', imageConfigs.value.image2.y.toString())
  url.searchParams.set('image2Width', imageConfigs.value.image2.width.toString())
  url.searchParams.set('image2Height', imageConfigs.value.image2.height.toString())

  // 第3画像のパラメータ（指定されている場合のみ）
  if (imageConfigs.value.image3.source) {
    url.searchParams.set('image3', imageConfigs.value.image3.source)
    url.searchParams.set('image3X', imageConfigs.value.image3.x.toString())
    url.searchParams.set('image3Y', imageConfigs.value.image3.y.toString())
    url.searchParams.set('image3Width', imageConfigs.value.image3.width.toString())
    url.searchParams.set('image3Height', imageConfigs.value.image3.height.toString())
  }

  // キャンバスサイズ（1920x1080固定）
  url.searchParams.set('canvas_width', params.value.canvas_width.toString())
  url.searchParams.set('canvas_height', params.value.canvas_height.toString())

  // 出力形式
  url.searchParams.set('format', params.value.format)

  console.log('[App] Built API URL:', url.toString())
  return url.toString()
}

const generateImage = async () => {
  appStore.startLoading('画像を生成中...')
  error.value = ''
  resultUrl.value = ''

  try {
    const url = buildApiUrl()
    apiUrl.value = url

    console.log('[App] Generating image with URL:', url)

    // 常にBlobとして取得し、画像として表示する
    const response = await axios.get(url, {
      responseType: 'blob',
      headers: {
        'Accept': 'image/png, image/jpeg, image/*'
      },
      timeout: 30000 // 30秒タイムアウト
    })

    // レスポンスのContent-Typeを確認
    const contentType = response.headers['content-type']
    console.log('[App] Response content-type:', contentType)

    if (contentType && contentType.includes('image')) {
      // 画像の場合は直接表示
      resultUrl.value = URL.createObjectURL(response.data)
      console.log('[App] Image response processed successfully')
    } else if (contentType && contentType.includes('text/html')) {
      // HTMLの場合は画像を抽出
      const reader = new FileReader()
      reader.onload = (e) => {
        const htmlContent = e.target?.result as string
        console.log('[App] Processing HTML response')
        
        // HTML内の画像を抽出
        const imgMatch = htmlContent.match(/<img[^>]+src="([^">]+)"/)
        if (imgMatch && imgMatch[1]) {
          resultUrl.value = imgMatch[1]
          console.log('[App] Extracted image URL from HTML:', imgMatch[1])
        } else {
          // 画像が見つからない場合はPNG形式で再リクエスト
          console.log('[App] No image found in HTML, retrying with PNG format')
          retryWithPngFormat(url)
        }
      }
      reader.onerror = () => {
        console.error('[App] Failed to read HTML response')
        retryWithPngFormat(url)
      }
      reader.readAsText(response.data)
    } else {
      // それ以外の場合はPNG形式で再リクエスト
      console.log('[App] Unknown content type, retrying with PNG format')
      await retryWithPngFormat(url)
    }

    notificationStore.showSuccess('画像の生成が完了しました！')
  } catch (err: any) {
    console.error('Error generating image:', err)
    
    // より詳細なエラーログ
    console.error('Error details:', {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      url: err.config?.url,
      code: err.code
    })
    
    if (err.message?.includes('API URL is not configured')) {
      error.value = 'API設定が読み込まれていません。ページを再読み込みしてください。'
    } else if (err.code === 'ERR_NAME_NOT_RESOLVED') {
      error.value = 'API サーバーに接続できません。ネットワーク接続を確認してください。'
    } else if (err.response?.status === 500) {
      error.value = 'サーバーエラーが発生しました。しばらく待ってから再試行してください。'
    } else if (err.response?.status === 400) {
      error.value = 'リクエストパラメータに問題があります。設定を確認してください。'
    } else if (err.code === 'ECONNABORTED') {
      error.value = 'リクエストがタイムアウトしました。再試行してください。'
    } else {
      error.value = err.message || 'Unknown error'
    }

    notificationStore.showError(error.value)
    
    // エラーが発生した場合、PNG形式で再試行
    if (apiUrl.value && !err.message?.includes('API URL is not configured')) {
      try {
        console.log('[App] Attempting retry with PNG format')
        await retryWithPngFormat(apiUrl.value)
        error.value = '' // エラーをクリア
        notificationStore.showSuccess('PNG形式での再試行が成功しました')
      } catch (retryError) {
        console.error('Retry failed:', retryError)
        // 再試行も失敗した場合は元のエラーを表示
      }
    }
  } finally {
    appStore.stopLoading()
  }
}

// PNG形式での再試行ヘルパー関数
const retryWithPngFormat = async (originalUrl: string) => {
  const pngUrl = new URL(originalUrl)
  pngUrl.searchParams.set('format', 'png')
  console.log('[App] Retrying with PNG URL:', pngUrl.toString())
  
  const pngResponse = await axios.get(pngUrl.toString(), { 
    responseType: 'blob',
    timeout: 30000
  })
  resultUrl.value = URL.createObjectURL(pngResponse.data)
  console.log('[App] PNG retry successful')
}

const handleImageError = () => {
  console.error('画像の読み込みに失敗しました')
  // PNG形式で再試行
  if (apiUrl.value && !apiUrl.value.includes('format=png')) {
    const pngUrl = new URL(apiUrl.value)
    pngUrl.searchParams.set('format', 'png')
    resultUrl.value = pngUrl.toString()
  }
}

const downloadImage = () => {
  if (!resultUrl.value) return

  const link = document.createElement('a')
  link.href = resultUrl.value
  link.download = 'composite-image.png'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  
  notificationStore.showSuccess('ダウンロードを開始しました')
}

const copyApiUrl = () => {
  if (!apiUrl.value) return

  navigator.clipboard.writeText(apiUrl.value)
    .then(() => {
      notificationStore.showSuccess('API URLをクリップボードにコピーしました')
    })
    .catch(err => {
      console.error('Failed to copy: ', err)
      notificationStore.showError('URLのコピーに失敗しました')
    })
}

const loadExample = (example: any) => {
  // ベース画像の設定
  params.value.baseImage = example.params.baseImage || 'test'
  
  // 例のパラメータを画像設定に変換
  if (example.params.image1) {
    imageConfigs.value.image1.source = example.params.image1
    imageConfigs.value.image1.x = example.params.image1_x || 100
    imageConfigs.value.image1.y = example.params.image1_y || 100
    imageConfigs.value.image1.width = example.params.image1_width || 400
    imageConfigs.value.image1.height = example.params.image1_height || 300
  }
  
  if (example.params.image2) {
    imageConfigs.value.image2.source = example.params.image2
    imageConfigs.value.image2.x = example.params.image2_x || 600
    imageConfigs.value.image2.y = example.params.image2_y || 100
    imageConfigs.value.image2.width = example.params.image2_width || 400
    imageConfigs.value.image2.height = example.params.image2_height || 300
  }
  
  if (example.params.image3) {
    imageConfigs.value.image3.source = example.params.image3
    imageConfigs.value.image3.x = example.params.image3_x || 350
    imageConfigs.value.image3.y = example.params.image3_y || 400
    imageConfigs.value.image3.width = example.params.image3_width || 400
    imageConfigs.value.image3.height = example.params.image3_height || 300
  } else {
    imageConfigs.value.image3.source = ''
  }
  
  params.value.format = example.params.format || 'html'
  generateImage()
}

const handleUploadComplete = (uploadData: any) => {
  notificationStore.showSuccess(`${uploadData.fileName} がアップロードされました。画像選択で使用できます。`)
}

const handleConfigUpdate = (imageKey: string, field: string, value: any) => {
  if (imageConfigs.value[imageKey as keyof typeof imageConfigs.value]) {
    (imageConfigs.value[imageKey as keyof typeof imageConfigs.value] as any)[field] = value
  }
}

const handleRetryGeneration = () => {
  generateImage()
}

const handleClearError = () => {
  error.value = ''
}

// ライフサイクル
onMounted(async () => {
  try {
    // アプリストアを初期化
    appStore.initialize()
    
    // 設定を読み込み
    await configStore.loadConfig()

    console.log('[App] Application initialized successfully')
  } catch (error) {
    console.error('[App] Failed to initialize application:', error)
    appStore.handleApiError(error)
  }
})
</script>

<style>
:root {
  --primary-color: #0078d7;
  --secondary-color: #00a2ed;
  --accent-color: #ff9900;
  --background-color: #f5f7fa;
  --card-background: #ffffff;
  --text-color: #333333;
  --border-color: #e0e0e0;
  --success-color: #28a745;
  --error-color: #dc3545;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  line-height: 1.6;
  color: var(--text-color);
  background-color: var(--background-color);
}

.app-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

header {
  text-align: center;
  margin-bottom: 30px;
  padding: 20px;
  background: linear-gradient(135deg, var(--primary-color), var(--secondary-color));
  color: white;
  border-radius: 8px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.config-info {
  margin-top: 10px;
  opacity: 0.8;
}

.config-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  text-align: center;
}

h1 {
  font-size: 2.5rem;
  margin-bottom: 10px;
}

.subtitle {
  font-size: 1.2rem;
  opacity: 0.9;
}

.main-content {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 30px;
}

.form-container,
.result-container {
  flex: 1;
  min-width: 300px;
  background-color: var(--card-background);
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

h2 {
  margin-bottom: 20px;
  color: var(--primary-color);
  border-bottom: 2px solid var(--border-color);
  padding-bottom: 10px;
}

.form-group {
  margin-bottom: 15px;
}

label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

input,
select {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 16px;
}

button {
  background-color: var(--primary-color);
  color: white;
  border: none;
  padding: 12px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  font-weight: 500;
  transition: background-color 0.3s;
  margin-top: 10px;
}

button:hover {
  background-color: var(--secondary-color);
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
}

.spinner {
  border: 4px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top: 4px solid var(--primary-color);
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

.error {
  color: var(--error-color);
  padding: 20px;
  border: 1px solid var(--error-color);
  border-radius: 4px;
  background-color: rgba(220, 53, 69, 0.1);
}

.result-image {
  max-width: 100%;
  height: auto;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  margin-bottom: 15px;
}

.actions {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.api-url {
  margin-top: 15px;
}

code {
  display: block;
  padding: 10px;
  background-color: #f8f9fa;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: monospace;
  font-size: 14px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.empty-result {
  text-align: center;
  padding: 40px 0;
  color: #666;
}

.examples {
  margin-bottom: 30px;
}

.example-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
}

.example-card {
  flex: 1;
  min-width: 250px;
  background-color: var(--card-background);
  padding: 15px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  cursor: pointer;
  transition: transform 0.3s, box-shadow 0.3s;
}

.example-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.1);
}

.example-card h3 {
  color: var(--primary-color);
  margin-bottom: 10px;
}

footer {
  text-align: center;
  margin-top: 30px;
  padding: 20px;
  background-color: var(--primary-color);
  color: white;
  border-radius: 8px;
}

/* アップロードセクションのスタイル */
.upload-section {
  margin: 20px 0;
}

.form-label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
}

.form-select {
  width: 100%;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
}

/* 目立つ画像生成ボタンのスタイル */
.generate-button-section {
  text-align: center;
  margin: 30px 0;
}

.generate-button {
  background: linear-gradient(135deg, #3b82f6, #8b5cf6);
  color: white;
  font-weight: bold;
  padding: 16px 32px;
  border-radius: 8px;
  font-size: 18px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transform: translateY(0);
  transition: all 0.2s ease;
  min-width: 200px;
  min-height: 56px;
  border: none;
  cursor: pointer;
}

.generate-button:not(:disabled):hover {
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  transform: translateY(-2px);
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.2);
}

.generate-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.loading-content,
.button-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.spinner-icon {
  width: 20px;
  height: 20px;
  animation: spin 1s linear infinite;
}

@media (max-width: 768px) {
  .main-content {
    flex-direction: column;
  }

  .form-container,
  .result-container {
    width: 100%;
  }

  .example-card {
    min-width: 100%;
  }

  .form-select {
    font-size: 12px;
    padding: 6px;
  }

  .generate-button {
    font-size: 16px;
    padding: 14px 28px;
    min-width: 180px;
  }
}
</style>