<template>
  <div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 max-w-lg">
    <div
      v-for="img in images"
      :key="img.key"
      class="group relative rounded-lg border border-gray-200 overflow-hidden bg-gray-50 hover:border-blue-400 transition-colors"
    >
      <div class="aspect-square flex items-center justify-center bg-gray-100">
        <img
          v-if="img.thumbnail_url"
          :src="img.thumbnail_url"
          :alt="img.filename"
          class="w-full h-full object-cover"
          loading="lazy"
          @error="onImgError($event)"
        />
        <span v-else class="text-3xl">&#x1f5bc;&#xfe0f;</span>
      </div>
      <div class="px-2 py-1.5">
        <p class="text-xs font-medium text-gray-700 truncate" :title="img.filename">
          {{ img.filename }}
        </p>
        <p class="text-[10px] text-gray-400">{{ img.size_display }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssetImage } from '@/types/chat'

defineProps<{ images: AssetImage[] }>()

function onImgError(e: Event) {
  const target = e.target as HTMLImageElement
  target.style.display = 'none'
  const parent = target.parentElement
  if (parent) {
    parent.innerHTML = '<span class="text-3xl">&#x1f5bc;&#xfe0f;</span>'
  }
}
</script>
