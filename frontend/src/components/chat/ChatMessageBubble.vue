<template>
  <div class="flex" :class="message.role === 'user' ? 'justify-end' : 'justify-start'">
    <div
      class="max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed"
      :class="bubbleClass"
    >
      <!-- ローディング -->
      <div v-if="message.isLoading" class="flex items-center gap-2 text-gray-500">
        <span class="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
        <span class="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
        <span class="inline-block w-2 h-2 bg-gray-400 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
      </div>

      <!-- テキスト内容 -->
      <div v-else v-html="renderedContent" class="chat-content"></div>

      <!-- メディア結果 -->
      <ChatMediaResult
        v-if="(message.mediaUrl && message.mediaType) || (message.mediaType === 'image_list' && message.imageList?.length)"
        :media-url="message.mediaUrl"
        :media-type="message.mediaType!"
        :image-list="message.imageList"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage } from '@/types/chat'
import ChatMediaResult from './ChatMediaResult.vue'

const props = defineProps<{ message: ChatMessage }>()

const bubbleClass = computed(() => {
  if (props.message.role === 'user') {
    return 'bg-blue-600 text-white rounded-br-md'
  }
  return 'bg-white text-gray-800 border border-gray-200 rounded-bl-md shadow-sm'
})

const renderedContent = computed(() => {
  let text = props.message.content
  // 簡易マークダウン: **bold**, `code`, 改行
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  text = text.replace(/`([^`]+)`/g, '<code class="bg-gray-100 text-gray-800 px-1 py-0.5 rounded text-xs">$1</code>')
  text = text.replace(/\n/g, '<br>')
  return text
})
</script>
