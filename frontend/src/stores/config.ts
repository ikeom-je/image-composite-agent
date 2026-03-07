import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AppConfig } from '@/types'
import { useAppStore } from './app'
import { useNotificationStore } from './notification'

export const useConfigStore = defineStore('config', () => {
  const appStore = useAppStore()
  const notificationStore = useNotificationStore()
  
  // State
  const config = ref<AppConfig | null>(null)
  const isLoaded = ref(false)
  const lastLoadTime = ref<Date | null>(null)
  
  // Getters
  const apiUrl = computed(() => {
    // 環境変数から取得を優先
    const envApiUrl = import.meta.env.VITE_API_URL
    if (envApiUrl) {
      return envApiUrl
    }
    
    // 設定ファイルから取得
    const configApiUrl = config.value?.apiUrl
    if (configApiUrl) {
      // 相対パスの場合は絶対URLに変換
      return configApiUrl.startsWith('/') ? window.location.origin + configApiUrl : configApiUrl
    }
    
    // フォールバック: 動的に構築
    return `${window.location.origin}/api/images/composite`
  })
  const uploadApiUrl = computed(() => {
    // 環境変数から取得を優先
    const envUploadUrl = import.meta.env.VITE_UPLOAD_API_URL
    if (envUploadUrl) {
      return envUploadUrl
    }
    
    // 設定ファイルから取得
    const configUploadUrl = config.value?.uploadApiUrl
    if (configUploadUrl) {
      // 相対パスの場合は絶対URLに変換
      return configUploadUrl.startsWith('/') ? window.location.origin + configUploadUrl : configUploadUrl
    }
    
    // フォールバック: 動的に構築
    return `${window.location.origin}/api/upload`
  })
  const cloudfrontUrl = computed(() => config.value?.cloudfrontUrl || '')
  const version = computed(() => config.value?.version || '2.4.0')
  const environment = computed(() => config.value?.environment || 'production')
  const features = computed(() => config.value?.features || {})
  const isDevelopment = computed(() => environment.value === 'development')
  const isProduction = computed(() => environment.value === 'production')
  const isDebugMode = computed(() => features.value.enableDebugMode || false)
  
  // Actions
  const loadConfig = async (forceReload = false): Promise<AppConfig> => {
    if (config.value && !forceReload) {
      return config.value
    }
    
    try {
      const configUrls = getConfigUrls()
      
      for (const url of configUrls) {
        try {
          console.log(`[ConfigStore] Attempting to load config from: ${url}`)
          
          const response = await fetch(url, {
            cache: 'no-cache',
            headers: {
              'Cache-Control': 'no-cache',
              'Pragma': 'no-cache',
            },
          })
          
          if (response.ok) {
            const configData = await response.json()
            const mergedConfig = mergeWithDefaults(configData)
            const finalConfig = applyEnvironmentOverrides(mergedConfig)
            
            config.value = finalConfig
            isLoaded.value = true
            lastLoadTime.value = new Date()
            
            console.log(`[ConfigStore] Successfully loaded config from: ${url}`)
            console.log(`[ConfigStore] Environment: ${finalConfig.environment}`)
            console.log(`[ConfigStore] Version: ${finalConfig.version}`)
            
            if (isDebugMode.value) {
              console.log('[ConfigStore] Full config:', finalConfig)
            }
            
            return finalConfig
          } else {
            console.warn(`[ConfigStore] Failed to load config from ${url}: ${response.status}`)
          }
        } catch (error) {
          console.warn(`[ConfigStore] Error loading config from ${url}:`, error)
        }
      }
      
      // すべての設定ファイルの読み込みに失敗した場合はデフォルト設定を使用
      console.warn('[ConfigStore] All config sources failed, using default configuration')
      const defaultConfig = getDefaultConfig()
      config.value = applyEnvironmentOverrides(defaultConfig)
      isLoaded.value = true
      lastLoadTime.value = new Date()
      
      return config.value
    } catch (error: any) {
      appStore.handleApiError(error)
      notificationStore.showError('Failed to load configuration')
      throw error
    } finally {
      // loadConfig用のローディングは不要（App.vueに独自の読み込み中表示あり）
    }
  }
  
  const reloadConfig = async (): Promise<AppConfig> => {
    return loadConfig(true)
  }
  
  const getConfigUrls = (): string[] => {
    const environment = detectEnvironment()
    const baseUrl = window.location.origin
    
    return [
      `${baseUrl}/config.${environment}.json`, // 環境固有設定
      `${baseUrl}/config.json`, // デフォルト設定
      '/config.json', // 相対パス
    ]
  }
  
  const detectEnvironment = (): string => {
    // 環境変数から検出
    if (import.meta.env.VITE_ENVIRONMENT) {
      return import.meta.env.VITE_ENVIRONMENT
    }
    
    // ホスト名から推測
    const hostname = window.location.hostname
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'development'
    }
    if (hostname.includes('staging') || hostname.includes('dev')) {
      return 'staging'
    }
    
    return 'production'
  }
  
  const getDefaultConfig = (): AppConfig => {
    return {
      apiUrl: '', // 動的に設定される
      uploadApiUrl: '', // 動的に設定される
      cloudfrontUrl: '',
      s3BucketNames: {
        resources: '',
        testImages: '',
        frontend: '',
        upload: '',
      },
      version: '2.5.3',
      environment: 'production',
      buildTimestamp: new Date().toISOString(),
      region: 'us-east-1',
      features: {
        enableS3Upload: true,
        enableAdvancedFilters: false,
        enable3ImageComposition: true,
        enableDebugMode: false,
        enableAnalytics: true,
        enableCaching: true,
        enableErrorReporting: true,
      },
      api: {
        keyId: '',
        throttling: {
          rateLimit: 100,
          burstLimit: 200,
          dailyQuota: 10000,
        },
        timeout: 30000,
        retryAttempts: 3,
      },
      ui: {
        theme: 'light',
        language: 'ja',
        showAdvancedOptions: false,
        maxImageSize: 10 * 1024 * 1024, // 10MB
        supportedFormats: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
      },
      monitoring: {
        enableCloudWatchLogs: true,
        logLevel: 'info',
        enablePerformanceMetrics: true,
        enableErrorTracking: true,
      },
      security: {
        enableCSP: true,
        enableSRI: true,
        corsOrigins: ['*'],
      },
      development: {
        enableHotReload: false,
        enableSourceMaps: false,
        enableConsoleLogging: false,
        mockApiResponses: false,
      },
    }
  }
  
  const mergeWithDefaults = (configData: Partial<AppConfig>): AppConfig => {
    const defaultConfig = getDefaultConfig()
    
    return {
      ...defaultConfig,
      ...configData,
      features: {
        ...defaultConfig.features,
        ...configData.features,
      },
      api: {
        ...defaultConfig.api,
        ...configData.api,
      },
      ui: {
        ...defaultConfig.ui,
        ...configData.ui,
      },
      monitoring: {
        ...defaultConfig.monitoring,
        ...configData.monitoring,
      },
      security: {
        ...defaultConfig.security,
        ...configData.security,
      },
      development: {
        ...defaultConfig.development,
        ...configData.development,
      },
      s3BucketNames: {
        ...defaultConfig.s3BucketNames,
        ...configData.s3BucketNames,
      },
    }
  }
  
  const applyEnvironmentOverrides = (config: AppConfig): AppConfig => {
    const overrides: Partial<AppConfig> = {}
    
    // 環境変数からのオーバーライド
    if (import.meta.env.VITE_API_URL) {
      overrides.apiUrl = import.meta.env.VITE_API_URL
    }
    if (import.meta.env.VITE_UPLOAD_API_URL) {
      overrides.uploadApiUrl = import.meta.env.VITE_UPLOAD_API_URL
    }
    if (import.meta.env.VITE_CLOUDFRONT_URL) {
      overrides.cloudfrontUrl = import.meta.env.VITE_CLOUDFRONT_URL
    }

    // 開発環境での特別な設定
    if (config.environment === 'development') {
      overrides.development = {
        ...config.development,
        enableHotReload: true,
        enableSourceMaps: true,
        enableConsoleLogging: true,
        mockApiResponses: false,
      }
      
      overrides.features = {
        ...config.features,
        enableDebugMode: true,
      }
    }

    return {
      ...config,
      ...overrides,
      features: {
        ...config.features,
        ...overrides.features,
      },
      development: {
        ...config.development,
        ...overrides.development,
      },
    }
  }

  const updateConfig = (updates: Partial<AppConfig>) => {
    if (config.value) {
      config.value = {
        ...config.value,
        ...updates,
        features: {
          ...config.value.features,
          ...updates.features,
        },
        api: {
          ...config.value.api,
          ...updates.api,
        },
        ui: {
          ...config.value.ui,
          ...updates.ui,
        },
      }
    }
  }

  const getConfigValue = <T>(path: string, defaultValue?: T): T => {
    if (!config.value) {
      return defaultValue as T
    }

    const keys = path.split('.')
    let value: any = config.value

    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key]
      } else {
        return defaultValue as T
      }
    }

    return value as T
  }

  const isFeatureEnabled = (featureName: string): boolean => {
    return getConfigValue(`features.${featureName}`, false)
  }

  const getApiConfig = () => {
    return config.value?.api || getDefaultConfig().api
  }

  const getUIConfig = () => {
    return config.value?.ui || getDefaultConfig().ui
  }

  const getMonitoringConfig = () => {
    return config.value?.monitoring || getDefaultConfig().monitoring
  }

  const getSecurityConfig = () => {
    return config.value?.security || getDefaultConfig().security
  }

  const getDevelopmentConfig = () => {
    return config.value?.development || getDefaultConfig().development
  }

  return {
    // State
    config,
    isLoaded,
    lastLoadTime,

    // Getters
    apiUrl,
    uploadApiUrl,
    cloudfrontUrl,
    version,
    environment,
    features,
    isDevelopment,
    isProduction,
    isDebugMode,

    // Actions
    loadConfig,
    reloadConfig,
    updateConfig,
    getConfigValue,
    isFeatureEnabled,
    getApiConfig,
    getUIConfig,
    getMonitoringConfig,
    getSecurityConfig,
    getDevelopmentConfig,
  }
})