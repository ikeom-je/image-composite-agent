<script setup lang="ts">
import { useChatStore } from '@/stores/chat'

const chatStore = useChatStore()

function onClear() {
  chatStore.clearPendingTestRule()
}
</script>

<template>
  <div
    v-if="chatStore.pendingTestRule"
    class="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded flex items-center justify-between gap-3"
  >
    <span>
      テスト中ルール「<strong>{{ chatStore.pendingTestRule.name }}</strong>」適用中（{{ chatStore.pendingTestRule.prompt.length }}字）
    </span>
    <button
      class="text-xs px-2 py-1 bg-white border border-amber-300 rounded hover:bg-amber-100 text-amber-700"
      @click="onClear"
    >
      解除
    </button>
  </div>
</template>
