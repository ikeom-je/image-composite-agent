<template>
  <div class="flex flex-col h-[calc(100vh-3.5rem)] bg-gray-50">
    <!-- ヘッダー -->
    <div class="px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-gray-800">Chat Agent - 画像合成アシスタント</h1>
        <p class="text-xs text-gray-500">コマンドで画像合成・動画生成を実行できます</p>
      </div>
      <button
        @click="onClear"
        :disabled="isBusy || chatStore.messages.length === 0"
        class="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        履歴クリア
      </button>
    </div>

    <!-- メッセージ一覧 -->
    <ChatMessageList :messages="chatStore.messages" />

    <!-- 入力エリア -->
    <ChatInput :disabled="isBusy" @send="onSend" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useConfigStore } from '@/stores/config'
import { useChatAgent } from '@/composables/useChatAgent'
import ChatMessageList from '@/components/chat/ChatMessageList.vue'
import ChatInput from '@/components/chat/ChatInput.vue'

const chatStore = useChatStore()
const configStore = useConfigStore()
const { showWelcome, handleUserInput, loadHistory, clearHistory } = useChatAgent()

const isBusy = ref(false)

async function onSend(text: string) {
  isBusy.value = true
  try {
    await handleUserInput(text)
  } finally {
    isBusy.value = false
  }
}

async function onClear() {
  await clearHistory()
  chatStore.newSession()
  showWelcome()
}

onMounted(async () => {
  if (!configStore.isLoaded) {
    await configStore.loadConfig()
  }
  // サーバーから会話履歴を復元（media情報含む）
  await loadHistory()
  if (chatStore.messages.length === 0) {
    showWelcome()
  }
})
</script>
