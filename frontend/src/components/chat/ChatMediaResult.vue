<template>
  <div class="mt-2">
    <!-- 画像一覧 -->
    <ChatAssetGrid v-if="mediaType === 'image_list' && imageList?.length" :images="imageList" />

    <!-- 単体画像 -->
    <div v-else-if="mediaType === 'image'" class="max-w-md">
      <div class="rounded-lg overflow-hidden border border-gray-200">
        <img :src="mediaUrl" alt="合成結果" class="w-full h-auto" @load="$emit('media-loaded')" />
      </div>
      <a
        v-if="mediaUrl"
        :href="mediaUrl"
        :download="filename"
        class="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        ダウンロード
      </a>
    </div>

    <!-- 動画 -->
    <div v-else-if="mediaType === 'video'" class="max-w-md">
      <div class="rounded-lg overflow-hidden border border-gray-200">
        <video :src="mediaUrl" controls class="w-full h-auto" @loadeddata="$emit('media-loaded')" />
      </div>
      <a
        v-if="mediaUrl"
        :href="mediaUrl"
        :download="filename"
        class="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1.5 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-md transition-colors"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
        ダウンロード
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssetImage } from '@/types/chat'
import ChatAssetGrid from './ChatAssetGrid.vue'

const props = defineProps<{
  mediaUrl?: string
  mediaType: 'image' | 'video' | 'image_list'
  imageList?: AssetImage[]
}>()

defineEmits<{
  'media-loaded': []
}>()

const filename = computed(() => {
  if (!props.mediaUrl) return ''
  const url = props.mediaUrl
  const segments = url.split('/')
  return segments[segments.length - 1].split('?')[0] || 'download'
})
</script>
