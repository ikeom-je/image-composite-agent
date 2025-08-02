<template>
  <div class="app-container">
    <!-- 通知システム -->
    <NotificationSystem />
    
    <!-- ローディングオーバーレイ -->
    <LoadingOverlay v-if="appStore.isLoading" :message="appStore.loading.message" />
    
    <!-- パフォーマンス監視 -->
    <PerformanceMonitor v-if="configStore.isDebugMode || configStore.isDevelopment" />

    <header>
      <h1>🎨 画像合成REST API v2.4.2</h1>
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
            :disabled="appStore.isLoading || !imageConfigs.image1.source"
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
              🎨 {{ getImageCountText() }}
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
    source: '', // デフォルトで未選択
    x: 600,
    y: 100,
    width: 400,
    height: 300
  },
  image3: {
    source: '', // デフォルトで未選択
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
    title: '🎨 基本的な1画像合成',
    description: '1つの図形のみを合成',
    params: {
      baseImage: 'test',
      image1: 'test',
      image1_x: 100,
      image1_y: 100,
      image1_width: 400,
      image1_height: 300,
      image2: '',
      image3: '',
      format: 'html'
    }
  },
  {
    title: '📐 基本的な2画像合成',
    description: '円と四角の2つの図形を合成',
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
  },
  {
    title: '🔺 3画像合成',
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

  // 必須パラメータ（image1のみ）
  if (!imageConfigs.value.image1.source) {
    throw new Error('Image1 is required for image composition')
  }
  url.searchParams.set('image1', imageConfigs.value.image1.source)

  // 画像1のパラメータ（1920x1080キャンバス対応）
  url.searchParams.set('image1X', Math.max(0, Math.min(imageConfigs.value.image1.x, 1920 - imageConfigs.value.image1.width)).toString())
  url.searchParams.set('image1Y', Math.max(0, Math.min(imageConfigs.value.image1.y, 1080 - imageConfigs.value.image1.height)).toString())
  url.searchParams.set('image1Width', Math.max(1, Math.min(imageConfigs.value.image1.width, 1920)).toString())
  url.searchParams.set('image1Height', Math.max(1, Math.min(imageConfigs.value.image1.height, 1080)).toString())

  // 画像2のパラメータ（選択されている場合のみ、1920x1080キャンバス対応）
  if (imageConfigs.value.image2.source) {
    url.searchParams.set('image2', imageConfigs.value.image2.source)
    url.searchParams.set('image2X', Math.max(0, Math.min(imageConfigs.value.image2.x, 1920 - imageConfigs.value.image2.width)).toString())
    url.searchParams.set('image2Y', Math.max(0, Math.min(imageConfigs.value.image2.y, 1080 - imageConfigs.value.image2.height)).toString())
    url.searchParams.set('image2Width', Math.max(1, Math.min(imageConfigs.value.image2.width, 1920)).toString())
    url.searchParams.set('image2Height', Math.max(1, Math.min(imageConfigs.value.image2.height, 1080)).toString())
  }

  // 第3画像のパラメータ（指定されている場合のみ、1920x1080キャンバス対応）
  if (imageConfigs.value.image3.source) {
    url.searchParams.set('image3', imageConfigs.value.image3.source)
    url.searchParams.set('image3X', Math.max(0, Math.min(imageConfigs.value.image3.x, 1920 - imageConfigs.value.image3.width)).toString())
    url.searchParams.set('image3Y', Math.max(0, Math.min(imageConfigs.value.image3.y, 1080 - imageConfigs.value.image3.height)).toString())
    url.searchParams.set('image3Width', Math.max(1, Math.min(imageConfigs.value.image3.width, 1920)).toString())
    url.searchParams.set('image3Height', Math.max(1, Math.min(imageConfigs.value.image3.height, 1080)).toString())
  }

  // キャンバスサイズ（1920x1080固定）
  url.searchParams.set('canvasWidth', params.value.canvas_width.toString())
  url.searchParams.set('canvasHeight', params.value.canvas_height.toString())

  // 出力形式
  url.searchParams.set('format', params.value.format)

  console.log('[App] Built API URL with 1920x1080 canvas:', url.toString())
  return url.toString()
}

const generateImage = async () => {
  appStore.startLoading('画像を生成中...')
  error.value = ''
  resultUrl.value = ''

  try {
    const url = buildApiUrl()
    apiUrl.value = url

    // デバッグ情報をログ出力
    logApiCallDetails(url)
    
    console.log('[App] Image configurations:', {
      image1: imageConfigs.value.image1,
      image2: imageConfigs.value.image2,
      image3: imageConfigs.value.image3
    })

    // 最初にHTML形式で試行（デバッグ情報付き）
    const htmlResponse = await axios.get(url, {
      responseType: 'text',
      headers: {
        'Accept': 'text/html, image/png, image/jpeg, image/*'
      },
      timeout: 30000 // 30秒タイムアウト
    })

    console.log('[App] HTML response received, content-type:', htmlResponse.headers['content-type'])

    // HTMLレスポンスから画像データを抽出
    if (htmlResponse.data && typeof htmlResponse.data === 'string') {
      // Base64画像データを抽出
      const base64Match = htmlResponse.data.match(/data:image\/[^;]+;base64,([^"']+)/)
      if (base64Match && base64Match[1]) {
        // Base64データからBlobを作成
        const base64Data = base64Match[1]
        const byteCharacters = atob(base64Data)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        const blob = new Blob([byteArray], { type: 'image/png' })
        
        resultUrl.value = URL.createObjectURL(blob)
        console.log('[App] Successfully extracted Base64 image from HTML response')
        notificationStore.showSuccess('画像の生成が完了しました！')
        return
      }

      // 通常のimg srcを抽出
      const imgMatch = htmlResponse.data.match(/<img[^>]+src="([^">]+)"/)
      if (imgMatch && imgMatch[1]) {
        resultUrl.value = imgMatch[1]
        console.log('[App] Extracted image URL from HTML:', imgMatch[1])
        notificationStore.showSuccess('画像の生成が完了しました！')
        return
      }
    }

    // HTMLから画像が抽出できない場合はPNG形式で再試行
    console.log('[App] No image found in HTML response, retrying with PNG format')
    await retryWithPngFormat(url)
    notificationStore.showSuccess('PNG形式での画像生成が完了しました！')

  } catch (err: any) {
    console.error('[App] Error generating image:', err)
    
    // より詳細なエラーログ
    console.error('[App] Error details:', {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      url: err.config?.url,
      code: err.code,
      data: err.response?.data
    })
    
    // エラーメッセージの詳細化
    if (err.message?.includes('Image1 is required')) {
      error.value = '画像1は必須です。画像を選択してください。'
    } else if (err.message?.includes('API URL is not configured')) {
      error.value = 'API設定が読み込まれていません。ページを再読み込みしてください。'
    } else if (err.code === 'ERR_NAME_NOT_RESOLVED') {
      error.value = 'API サーバーに接続できません。ネットワーク接続を確認してください。'
    } else if (err.response?.status === 500) {
      error.value = 'サーバーエラーが発生しました。パラメータを確認してから再試行してください。'
    } else if (err.response?.status === 400) {
      error.value = 'リクエストパラメータに問題があります。画像選択と位置設定を確認してください。'
    } else if (err.response?.status === 404) {
      error.value = 'APIエンドポイントが見つかりません。設定を確認してください。'
    } else if (err.code === 'ECONNABORTED') {
      error.value = 'リクエストがタイムアウトしました（30秒）。再試行してください。'
    } else {
      error.value = `画像生成エラー: ${err.message || 'Unknown error'}`
    }

    notificationStore.showError(error.value)
    
    // エラーが発生した場合、PNG形式で再試行（設定エラー以外）
    if (apiUrl.value && !err.message?.includes('API URL is not configured') && !err.message?.includes('Image1 is required')) {
      try {
        console.log('[App] Attempting retry with PNG format after error')
        await retryWithPngFormat(apiUrl.value)
        error.value = '' // エラーをクリア
        notificationStore.showSuccess('PNG形式での再試行が成功しました')
      } catch (retryError: any) {
        console.error('[App] Retry also failed:', retryError)
        // 再試行も失敗した場合は詳細なエラーを表示
        error.value += ` (再試行も失敗: ${retryError.message})`
      }
    }
  } finally {
    appStore.stopLoading()
  }
}

// PNG形式での再試行ヘルパー関数（改善版）
const retryWithPngFormat = async (originalUrl: string) => {
  const pngUrl = new URL(originalUrl)
  pngUrl.searchParams.set('format', 'png')
  console.log('[App] Retrying with PNG URL:', pngUrl.toString())
  
  try {
    const pngResponse = await axios.get(pngUrl.toString(), { 
      responseType: 'blob',
      headers: {
        'Accept': 'image/png, image/jpeg, image/*'
      },
      timeout: 30000
    })
    
    // レスポンスの検証
    if (pngResponse.data && pngResponse.data.size > 0) {
      const contentType = pngResponse.headers['content-type']
      console.log('[App] PNG response content-type:', contentType, 'size:', pngResponse.data.size)
      
      if (contentType && contentType.includes('image')) {
        resultUrl.value = URL.createObjectURL(pngResponse.data)
        console.log('[App] PNG retry successful with valid image data')
      } else {
        throw new Error(`Invalid content type for PNG response: ${contentType}`)
      }
    } else {
      throw new Error('Empty PNG response received')
    }
  } catch (pngError: any) {
    console.error('[App] PNG retry failed:', pngError)
    throw new Error(`PNG retry failed: ${pngError.message}`)
  }
}

// 1920x1080キャンバス境界チェック関数
const validateImageBounds = (imageConfig: any, imageName: string) => {
  const warnings = []
  const canvasWidth = 1920
  const canvasHeight = 1080
  
  // 位置チェック
  if (imageConfig.x < 0) {
    warnings.push(`${imageName}: X座標が負の値です (${imageConfig.x})`)
  }
  if (imageConfig.y < 0) {
    warnings.push(`${imageName}: Y座標が負の値です (${imageConfig.y})`)
  }
  
  // サイズチェック
  if (imageConfig.width <= 0) {
    warnings.push(`${imageName}: 幅が無効です (${imageConfig.width})`)
  }
  if (imageConfig.height <= 0) {
    warnings.push(`${imageName}: 高さが無効です (${imageConfig.height})`)
  }
  
  // キャンバス境界チェック
  if (imageConfig.x + imageConfig.width > canvasWidth) {
    warnings.push(`${imageName}: 画像が右端を超えています (${imageConfig.x + imageConfig.width} > ${canvasWidth})`)
  }
  if (imageConfig.y + imageConfig.height > canvasHeight) {
    warnings.push(`${imageName}: 画像が下端を超えています (${imageConfig.y + imageConfig.height} > ${canvasHeight})`)
  }
  
  return warnings
}

// デバッグ用のAPI呼び出し情報をログ出力
const logApiCallDetails = (url: string) => {
  const urlObj = new URL(url)
  const params = Object.fromEntries(urlObj.searchParams.entries())
  
  console.group('[App] API Call Details')
  console.log('URL:', url)
  console.log('Parameters:', params)
  console.log('Canvas Size:', `${params.canvasWidth || 'default'}x${params.canvasHeight || 'default'}`)
  console.log('Images:', {
    image1: params.image1 || 'not set',
    image2: params.image2 || 'not set', 
    image3: params.image3 || 'not set'
  })
  console.log('Positions:', {
    image1: `(${params.image1X || 0}, ${params.image1Y || 0})`,
    image2: `(${params.image2X || 0}, ${params.image2Y || 0})`,
    image3: `(${params.image3X || 0}, ${params.image3Y || 0})`
  })
  console.log('Sizes:', {
    image1: `${params.image1Width || 0}x${params.image1Height || 0}`,
    image2: `${params.image2Width || 0}x${params.image2Height || 0}`,
    image3: `${params.image3Width || 0}x${params.image3Height || 0}`
  })
  
  // 境界チェック結果をログ出力
  const allWarnings = []
  if (imageConfigs.value.image1.source) {
    allWarnings.push(...validateImageBounds(imageConfigs.value.image1, 'Image1'))
  }
  if (imageConfigs.value.image2.source) {
    allWarnings.push(...validateImageBounds(imageConfigs.value.image2, 'Image2'))
  }
  if (imageConfigs.value.image3.source) {
    allWarnings.push(...validateImageBounds(imageConfigs.value.image3, 'Image3'))
  }
  
  if (allWarnings.length > 0) {
    console.warn('Boundary Warnings:', allWarnings)
  } else {
    console.log('✅ All images are within canvas bounds')
  }
  
  console.groupEnd()
}

const handleImageError = () => {
  console.error('[App] 画像の読み込みに失敗しました')
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
  console.log('[App] Upload completed:', uploadData)
  notificationStore.showSuccess(`${uploadData.fileName} がアップロードされました。画像選択で使用できます。`)
  
  // ImageConfigTableに画像一覧の更新を通知
  // 少し遅延を入れてS3の整合性を確保
  setTimeout(() => {
    // カスタムイベントを発行してImageSelectorに更新を通知
    window.dispatchEvent(new CustomEvent('s3-images-updated', { 
      detail: uploadData 
    }))
  }, 2000) // 2秒後に更新
}

const handleConfigUpdate = (imageKey: string, field: string, value: any) => {
  if (imageConfigs.value[imageKey as keyof typeof imageConfigs.value]) {
    (imageConfigs.value[imageKey as keyof typeof imageConfigs.value] as any)[field] = value
  }
}

// リトライ機能の改善
const handleRetryGeneration = async () => {
  console.log('[App] Manual retry requested')
  
  // 境界チェックを実行
  const allWarnings = []
  if (imageConfigs.value.image1.source) {
    allWarnings.push(...validateImageBounds(imageConfigs.value.image1, 'Image1'))
  }
  if (imageConfigs.value.image2.source) {
    allWarnings.push(...validateImageBounds(imageConfigs.value.image2, 'Image2'))
  }
  if (imageConfigs.value.image3.source) {
    allWarnings.push(...validateImageBounds(imageConfigs.value.image3, 'Image3'))
  }
  
  // 警告がある場合は通知
  if (allWarnings.length > 0) {
    console.warn('[App] Boundary warnings detected:', allWarnings)
    notificationStore.showWarning(`パラメータに問題があります: ${allWarnings.slice(0, 2).join(', ')}${allWarnings.length > 2 ? '...' : ''}`)
  }
  
  await generateImage()
}

const handleClearError = () => {
  error.value = ''
}

const getImageCountText = () => {
  let count = 0
  if (imageConfigs.value.image1.source) count++
  if (imageConfigs.value.image2.source) count++
  if (imageConfigs.value.image3.source) count++
  
  if (count === 1) return '1画像を合成'
  if (count === 2) return '2画像を合成'
  if (count === 3) return '3画像を合成'
  return '画像を合成'
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