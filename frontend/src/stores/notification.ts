import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NotificationState } from '@/types'

export const useNotificationStore = defineStore('notification', () => {
  // State
  const notifications = ref<NotificationState[]>([])
  const maxNotifications = ref(5)
  const defaultDuration = ref(5000) // 5秒

  // Getters
  const hasNotifications = computed(() => notifications.value.length > 0)
  const latestNotification = computed(() => 
    notifications.value.length > 0 ? notifications.value[notifications.value.length - 1] : null
  )

  // Actions
  const addNotification = (notification: Omit<NotificationState, 'id'>): string => {
    const id = generateId()
    const newNotification: NotificationState = {
      ...notification,
      id,
      duration: notification.duration || defaultDuration.value
    }

    notifications.value.push(newNotification)

    // 最大数を超えた場合は古いものを削除
    if (notifications.value.length > maxNotifications.value) {
      notifications.value.shift()
    }

    // 自動削除のタイマーを設定
    if (newNotification.duration > 0) {
      setTimeout(() => {
        removeNotification(id)
      }, newNotification.duration)
    }

    return id
  }

  const removeNotification = (id: string) => {
    const index = notifications.value.findIndex(n => n.id === id)
    if (index > -1) {
      notifications.value.splice(index, 1)
    }
  }

  const clearAllNotifications = () => {
    notifications.value = []
  }

  // 便利メソッド
  const showSuccess = (message: string, duration?: number): string => {
    return addNotification({
      type: 'success',
      message,
      duration
    })
  }

  const showError = (message: string, duration?: number): string => {
    return addNotification({
      type: 'error',
      message,
      duration: duration || 0 // エラーは手動で閉じるまで表示
    })
  }

  const showWarning = (message: string, duration?: number): string => {
    return addNotification({
      type: 'warning',
      message,
      duration
    })
  }

  const showInfo = (message: string, duration?: number): string => {
    return addNotification({
      type: 'info',
      message,
      duration
    })
  }

  // ヘルパー関数
  const generateId = (): string => {
    return `notification_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  return {
    // State
    notifications,
    maxNotifications,
    defaultDuration,

    // Getters
    hasNotifications,
    latestNotification,

    // Actions
    addNotification,
    removeNotification,
    clearAllNotifications,
    showSuccess,
    showError,
    showWarning,
    showInfo
  }
})