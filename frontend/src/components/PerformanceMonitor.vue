<template>
  <div v-if="showMonitor" class="fixed bottom-4 left-4 z-40">
    <div class="bg-white rounded-lg shadow-lg p-4 max-w-sm">
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-sm font-semibold text-gray-900">パフォーマンス監視</h3>
        <button
          @click="toggleMonitor"
          class="text-gray-400 hover:text-gray-600"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      
      <div class="space-y-2 text-xs">
        <!-- リクエストキューの状態 -->
        <div class="flex justify-between">
          <span class="text-gray-600">キュー待機:</span>
          <span class="font-mono">{{ queueStatus.queueSize }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">実行中:</span>
          <span class="font-mono">{{ queueStatus.activeRequests }}/{{ queueStatus.maxConcurrentRequests }}</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">処理済み:</span>
          <span class="font-mono">{{ queueStatus.totalProcessed }}</span>
        </div>
        
        <!-- パフォーマンスメトリクス -->
        <hr class="my-2">
        <div class="flex justify-between">
          <span class="text-gray-600">平均応答時間:</span>
          <span class="font-mono">{{ averageResponseTime }}ms</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">成功率:</span>
          <span class="font-mono">{{ successRate }}%</span>
        </div>
        <div class="flex justify-between">
          <span class="text-gray-600">エラー数:</span>
          <span class="font-mono text-red-600">{{ errorCount }}</span>
        </div>
        
        <!-- メモリ使用量（利用可能な場合） -->
        <div v-if="memoryInfo" class="flex justify-between">
          <span class="text-gray-600">メモリ使用量:</span>
          <span class="font-mono">{{ formatBytes(memoryInfo.usedJSHeapSize) }}</span>
        </div>
      </div>
      
      <!-- リセットボタン -->
      <button
        @click="resetMetrics"
        class="mt-3 w-full text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 py-1 px-2 rounded"
      >
        メトリクスをリセット
      </button>
    </div>
  </div>
  
  <!-- トグルボタン -->
  <button
    v-else
    @click="toggleMonitor"
    class="fixed bottom-4 left-4 z-40 bg-primary-600 hover:bg-primary-700 text-white p-2 rounded-full shadow-lg"
    title="パフォーマンス監視を表示"
  >
    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { requestQueue } from '@/utils/requestQueue'
import { useConfigStore } from '@/stores/config'

const configStore = useConfigStore()

// 状態
const showMonitor = ref(false)
const queueStatus = ref(requestQueue.getStatus())
const responseTimes = ref<number[]>([])
const requestCount = ref(0)
const errorCount = ref(0)
const memoryInfo = ref<any>(null)

// 更新間隔
let updateInterval: NodeJS.Timeout | null = null

// 計算プロパティ
const averageResponseTime = computed(() => {
  if (responseTimes.value.length === 0) return 0
  const sum = responseTimes.value.reduce((a, b) => a + b, 0)
  return Math.round(sum / responseTimes.value.length)
})

const successRate = computed(() => {
  if (requestCount.value === 0) return 100
  const successCount = requestCount.value - errorCount.value
  return Math.round((successCount / requestCount.value) * 100)
})

// メソッド
const toggleMonitor = () => {
  showMonitor.value = !showMonitor.value
  
  if (showMonitor.value) {
    startMonitoring()
  } else {
    stopMonitoring()
  }
}

const startMonitoring = () => {
  updateInterval = setInterval(() => {
    updateMetrics()
  }, 1000) // 1秒ごとに更新
}

const stopMonitoring = () => {
  if (updateInterval) {
    clearInterval(updateInterval)
    updateInterval = null
  }
}

const updateMetrics = () => {
  // キューの状態を更新
  queueStatus.value = requestQueue.getStatus()
  
  // メモリ情報を更新（利用可能な場合）
  if ('memory' in performance) {
    memoryInfo.value = (performance as any).memory
  }
}

const resetMetrics = () => {
  responseTimes.value = []
  requestCount.value = 0
  errorCount.value = 0
  
  // リクエストキューもクリア
  requestQueue.clear()
  
  console.log('[PerformanceMonitor] Metrics reset')
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

// API呼び出しの監視
const monitorApiCall = (startTime: number, success: boolean) => {
  const responseTime = Date.now() - startTime
  responseTimes.value.push(responseTime)
  
  // 最新の100件のみ保持
  if (responseTimes.value.length > 100) {
    responseTimes.value.shift()
  }
  
  requestCount.value++
  
  if (!success) {
    errorCount.value++
  }
}

// ライフサイクル
onMounted(() => {
  // デバッグモードの場合は自動で表示
  if (configStore.isDebugMode) {
    showMonitor.value = true
    startMonitoring()
  }
  
  // グローバルなAPI監視を設定
  window.addEventListener('api-call-start', (event: any) => {
    const startTime = Date.now()
    event.detail.startTime = startTime
  })
  
  window.addEventListener('api-call-end', (event: any) => {
    const { startTime, success } = event.detail
    if (startTime) {
      monitorApiCall(startTime, success !== false)
    }
  })
})

onUnmounted(() => {
  stopMonitoring()
})

// 外部からアクセス可能にする
defineExpose({
  toggleMonitor,
  resetMetrics,
  monitorApiCall,
})
</script>

<style scoped>
/* カスタムスタイルは必要に応じて追加 */
</style>