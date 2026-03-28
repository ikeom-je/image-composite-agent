<template>
  <div class="mt-2">
    <!-- 画像一覧 -->
    <ChatAssetGrid v-if="mediaType === 'image_list' && imageList?.length" :images="imageList" />

    <!-- 単体画像 -->
    <div v-else-if="mediaType === 'image'" class="max-w-md">
      <div class="rounded-lg overflow-hidden border border-gray-200">
        <img :src="mediaUrl" alt="合成結果" class="w-full h-auto" @load="$emit('media-loaded')" />
      </div>
      <DownloadButton v-if="mediaUrl" :url="mediaUrl" :filename="filename" />
    </div>

    <!-- 動画 -->
    <div v-else-if="mediaType === 'video'" class="max-w-md">
      <div class="rounded-lg overflow-hidden border border-gray-200">
        <video :src="mediaUrl" controls class="w-full h-auto" @loadeddata="$emit('media-loaded')" />
      </div>
      <DownloadButton v-if="mediaUrl" :url="mediaUrl" :filename="filename" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssetImage } from '@/types/chat'
import ChatAssetGrid from './ChatAssetGrid.vue'
import DownloadButton from './DownloadButton.vue'

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
  const segments = props.mediaUrl.split('/')
  const name = segments[segments.length - 1].split('?')[0]
  if (name) return name
  return props.mediaType === 'video' ? 'video-result.mp4' : 'composite-result.png'
})
</script>
