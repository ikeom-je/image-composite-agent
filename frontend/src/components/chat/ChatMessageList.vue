<template>
  <div ref="listRef" class="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar">
    <ChatMessageBubble
      v-for="msg in messages"
      :key="msg.id"
      :message="msg"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import type { ChatMessage } from '@/types/chat'
import ChatMessageBubble from './ChatMessageBubble.vue'

const props = defineProps<{ messages: ChatMessage[] }>()

const listRef = ref<HTMLElement>()

watch(
  () => props.messages.length,
  async () => {
    await nextTick()
    if (listRef.value) {
      listRef.value.scrollTop = listRef.value.scrollHeight
    }
  }
)
</script>
