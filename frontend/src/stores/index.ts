import { createPinia } from 'pinia'

export const pinia = createPinia()

// ストアのエクスポート
export { useAppStore } from './app'
export { useImageStore } from './image'
export { useConfigStore } from './config'
export { useNotificationStore } from './notification'