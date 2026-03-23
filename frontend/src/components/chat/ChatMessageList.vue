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
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import type { ChatMessage } from '@/types/chat'
import ChatMessageBubble from './ChatMessageBubble.vue'

const props = defineProps<{ messages: ChatMessage[] }>()

const listRef = ref<HTMLElement>()
let observer: MutationObserver | null = null
let scrollTimers: number[] = []

function scrollToBottom() {
  if (listRef.value) {
    listRef.value.scrollTop = listRef.value.scrollHeight
  }
}

function scheduleScroll() {
  // 既存のタイマーをクリア
  scrollTimers.forEach(t => clearTimeout(t))
  scrollTimers = []
  // 即座 + メディアロード用に複数回スクロール
  scrollToBottom()
  scrollTimers.push(window.setTimeout(scrollToBottom, 100))
  scrollTimers.push(window.setTimeout(scrollToBottom, 500))
  scrollTimers.push(window.setTimeout(scrollToBottom, 1500))
}

// DOM変更を監視して自動スクロール
onMounted(() => {
  if (listRef.value) {
    observer = new MutationObserver(() => scrollToBottom())
    observer.observe(listRef.value, { childList: true, subtree: true })
  }
})

onUnmounted(() => {
  observer?.disconnect()
  scrollTimers.forEach(t => clearTimeout(t))
})

watch(
  () => props.messages.map(m => m.content + (m.mediaUrl || '') + (m.isLoading ? '1' : '0')).join('|'),
  async () => {
    await nextTick()
    scheduleScroll()
  }
)
</script>
