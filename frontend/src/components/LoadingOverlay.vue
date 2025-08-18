<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
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
  @apply inline-block w-8 h-8 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin;
}
</style>