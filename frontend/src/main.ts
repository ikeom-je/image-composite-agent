import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { pinia } from '@/stores'
import App from './App.vue'
import '@/assets/css/main.css'

// ルーターの設定
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Home',
      component: App,
      meta: {
        title: '画像合成API v2.4.0 - Image Composite Processor'
      }
    }
  ]
})

// ルートガード
router.beforeEach((to, from, next) => {
  // ページタイトルを設定
  if (to.meta?.title) {
    document.title = to.meta.title as string
  }
  
  next()
})

// アプリケーションの作成
const app = createApp(App)

// プラグインの登録
app.use(pinia)
app.use(router)

// グローバルエラーハンドラー
app.config.errorHandler = (error, instance, info) => {
  console.error('[Vue Error]', error, info)
  
  // エラーハンドラーに送信
  import('@/utils/errorHandler').then(({ default: errorHandler }) => {
    errorHandler.handleError(error, {
      source: 'vue_error_handler',
      componentInfo: info,
      instance: instance?.$options.name || 'Unknown'
    })
  })
}

// 未処理のPromise拒否をキャッチ
window.addEventListener('unhandledrejection', (event) => {
  console.error('[Unhandled Promise Rejection]', event.reason)
  
  import('@/utils/errorHandler').then(({ default: errorHandler }) => {
    errorHandler.handleError(event.reason, {
      source: 'unhandled_promise_rejection',
      type: 'promise_rejection'
    })
  })
})

// パフォーマンス測定
if (import.meta.env.DEV) {
  console.log('[Performance] App initialization started')
  const startTime = performance.now()
  
  app.mount('#app')
  
  const endTime = performance.now()
  console.log(`[Performance] App mounted in ${endTime - startTime}ms`)
} else {
  app.mount('#app')
}

// 開発環境でのデバッグ情報
if (import.meta.env.DEV) {
  console.log('[Dev] Vue app mounted successfully')
  console.log('[Dev] Environment:', import.meta.env.MODE)
  console.log('[Dev] Base URL:', import.meta.env.BASE_URL)
}