<template>
  <div class="mt-2 rounded-lg overflow-hidden border border-gray-200 max-w-md">
    <img
      v-if="mediaType === 'image'"
      :src="mediaUrl"
      alt="合成結果"
      class="w-full h-auto"
    />
    <video
      v-else-if="mediaType === 'video'"
      :src="mediaUrl"
      controls
      class="w-full h-auto"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  mediaUrl: string
  mediaType: 'image' | 'video'
}>()
</script>
