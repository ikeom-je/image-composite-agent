<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-transparent">
      <div class="bg-white rounded-lg shadow-xl p-6 max-w-sm w-full mx-4">
        <div class="flex items-center space-x-4">
          <div class="flex-shrink-0">
            <div class="spinner-lg"></div>
          </div>
          <div class="flex-1">
            <h3 class="text-lg font-medium text-gray-900">
              処理中...
            </h3>
            <p class="text-sm text-gray-600 mt-1">
              {{ message || 'しばらくお待ちください' }}
            </p>
            <div v-if="progress !== undefined && progress > 0" class="mt-3">
              <div class="bg-gray-200 rounded-full h-2">
                <div 
                  class="bg-primary-600 h-2 rounded-full transition-all duration-300"
                  :style="{ width: `${Math.min(100, Math.max(0, progress))}%` }"
                ></div>
              </div>
              <p class="text-xs text-gray-500 mt-1 text-center">
                {{ Math.round(progress) }}%
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
interface Props {
  message?: string
  progress?: number
}

defineProps<Props>()
</script>

<style scoped>
.spinner-lg {
  display: inline-block;
  width: 2rem;
  height: 2rem;
  border: 4px solid #e0e7ff;
  border-top-color: #4f46e5;
  border-radius: 9999px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>