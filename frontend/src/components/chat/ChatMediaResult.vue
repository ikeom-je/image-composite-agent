<template>
  <div class="mt-2">
    <!-- 画像一覧 -->
    <ChatAssetGrid v-if="mediaType === 'image_list' && imageList?.length" :images="imageList" />

    <!-- 単体画像 -->
    <div v-else-if="mediaType === 'image'" class="rounded-lg overflow-hidden border border-gray-200 max-w-md">
      <img :src="mediaUrl" alt="合成結果" class="w-full h-auto" @load="$emit('media-loaded')" />
    </div>

    <!-- 動画 -->
    <div v-else-if="mediaType === 'video'" class="rounded-lg overflow-hidden border border-gray-200 max-w-md">
      <video :src="mediaUrl" controls class="w-full h-auto" @loadeddata="$emit('media-loaded')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssetImage } from '@/types/chat'
import ChatAssetGrid from './ChatAssetGrid.vue'

defineProps<{
  mediaUrl?: string
  mediaType: 'image' | 'video' | 'image_list'
  imageList?: AssetImage[]
}>()

defineEmits<{
  'media-loaded': []
}>()
</script>
