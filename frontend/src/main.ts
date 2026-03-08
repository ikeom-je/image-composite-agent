import { createApp } from 'vue'
import { pinia } from '@/stores'
import router from '@/router'
import AppShell from '@/components/AppShell.vue'
import '@/assets/css/main.css'

// アプリケーションの作成
const app = createApp(AppShell)

// プラグインの登録
app.use(pinia)
app.use(router)

// グローバルエラーハンドラー
app.config.errorHandler = (error, instance, info) => {
  console.error('[Vue Error]', error, info)

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

// マウント
app.mount('#app')
