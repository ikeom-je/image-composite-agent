<template>
  <button
    @click="download"
    :disabled="isDownloading"
    class="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors disabled:opacity-50 disabled:cursor-wait"
  >
    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
    {{ isDownloading ? 'ダウンロード中...' : 'ダウンロード' }}
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  url: string
  filename: string
}>()

const isDownloading = ref(false)

async function download() {
  isDownloading.value = true
  try {
    const response = await fetch(props.url)
    const blob = await response.blob()
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = props.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(blobUrl)
  } catch {
    // フォールバック: 新しいタブで開く
    window.open(props.url, '_blank')
  } finally {
    isDownloading.value = false
  }
}
</script>
