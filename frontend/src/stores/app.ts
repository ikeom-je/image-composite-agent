import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LoadingState, ErrorState, ThemeConfig } from '@/types'

export const useAppStore = defineStore('app', () => {
  // State
  const loading = ref<LoadingState>({
    isLoading: false,
    message: '',
    progress: 0
  })
  
  const error = ref<ErrorState>({
    hasError: false,
    message: '',
    code: '',
    details: null
  })
  
  const theme = ref<'light' | 'dark'>('light')
  const language = ref<'ja' | 'en'>('ja')
  const sidebarOpen = ref(false)
  const version = ref('2.4.0')
  
  // Getters
  const isLoading = computed(() => loading.value.isLoading)
  const hasError = computed(() => error.value.hasError)
  const currentTheme = computed(() => theme.value)
  const currentLanguage = computed(() => language.value)
  
  // Actions
  const setLoading = (state: Partial<LoadingState>) => {
    loading.value = { ...loading.value, ...state }
  }
  
  const startLoading = (message?: string) => {
    setLoading({
      isLoading: true,
      message: message || 'Loading...',
      progress: 0
    })
  }
  
  const updateProgress = (progress: number) => {
    loading.value.progress = Math.max(0, Math.min(100, progress))
  }
  
  const stopLoading = () => {
    setLoading({
      isLoading: false,
      message: '',
      progress: 0
    })
  }
  
  const setError = (errorState: Partial<ErrorState>) => {
    error.value = { ...error.value, ...errorState }
  }
  
  const showError = (message: string, code?: string, details?: any) => {
    setError({
      hasError: true,
      message,
      code,
      details
    })
  }
  
  const clearError = () => {
    setError({
      hasError: false,
      message: '',
      code: '',
      details: null
    })
  }
  
  const setTheme = (newTheme: 'light' | 'dark') => {
    theme.value = newTheme
    // ローカルストレージに保存
    localStorage.setItem('theme', newTheme)
    // HTMLクラスを更新
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }
  
  const toggleTheme = () => {
    setTheme(theme.value === 'light' ? 'dark' : 'light')
  }
  
  const setLanguage = (newLanguage: 'ja' | 'en') => {
    language.value = newLanguage
    localStorage.setItem('language', newLanguage)
    // HTMLのlang属性を更新
    document.documentElement.lang = newLanguage
  }
  
  const toggleSidebar = () => {
    sidebarOpen.value = !sidebarOpen.value
  }
  
  const closeSidebar = () => {
    sidebarOpen.value = false
  }
  
  const openSidebar = () => {
    sidebarOpen.value = true
  }
  
  // 初期化処理
  const initialize = () => {
    // ローカルストレージからテーマを復元
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    if (savedTheme) {
      setTheme(savedTheme)
    } else {
      // システムの設定を確認
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      setTheme(prefersDark ? 'dark' : 'light')
    }
    
    // ローカルストレージから言語を復元
    const savedLanguage = localStorage.getItem('language') as 'ja' | 'en' | null
    if (savedLanguage) {
      setLanguage(savedLanguage)
    } else {
      // ブラウザの言語設定を確認
      const browserLanguage = navigator.language.startsWith('ja') ? 'ja' : 'en'
      setLanguage(browserLanguage)
    }
  }
  
  // エラーハンドリング用のヘルパー
  const handleApiError = (error: any) => {
    console.error('API Error:', error)
    
    let message = 'An unexpected error occurred'
    let code = 'UNKNOWN_ERROR'
    
    if (error.response) {
      // HTTPエラーレスポンス
      message = error.response.data?.message || error.response.statusText || message
      code = error.response.data?.code || `HTTP_${error.response.status}`
    } else if (error.request) {
      // ネットワークエラー
      message = 'Network error occurred'
      code = 'NETWORK_ERROR'
    } else {
      // その他のエラー
      message = error.message || message
      code = error.code || code
    }
    
    showError(message, code, error)
  }
  
  // パフォーマンス測定
  const measurePerformance = (name: string, fn: () => Promise<any>) => {
    return async () => {
      const startTime = performance.now()
      try {
        const result = await fn()
        const endTime = performance.now()
        console.log(`Performance [${name}]: ${endTime - startTime}ms`)
        return result
      } catch (error) {
        const endTime = performance.now()
        console.error(`Performance [${name}] Error: ${endTime - startTime}ms`, error)
        throw error
      }
    }
  }
  
  return {
    // State
    loading,
    error,
    theme,
    language,
    sidebarOpen,
    version,
    
    // Getters
    isLoading,
    hasError,
    currentTheme,
    currentLanguage,
    
    // Actions
    setLoading,
    startLoading,
    updateProgress,
    stopLoading,
    setError,
    showError,
    clearError,
    setTheme,
    toggleTheme,
    setLanguage,
    toggleSidebar,
    closeSidebar,
    openSidebar,
    initialize,
    handleApiError,
    measurePerformance
  }
})