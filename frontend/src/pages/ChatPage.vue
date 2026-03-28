<template>
  <div class="flex flex-col h-[calc(100vh-3.5rem)] bg-gray-50">
    <!-- ヘッダー -->
    <div class="px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between">
      <div>
        <h1 class="text-lg font-semibold text-gray-800">Chat Agent - 画像合成アシスタント</h1>
        <p class="text-xs text-gray-500">コマンドで画像合成・動画生成を実行できます</p>
      </div>
      <div class="flex items-center gap-2">
        <select
          v-if="chatStore.availableModels.length > 0"
          :value="chatStore.effectiveModelId"
          @change="chatStore.selectModel(($event.target as HTMLSelectElement).value)"
          :disabled="isBusy"
          class="text-xs px-2 py-1.5 rounded border border-gray-200 bg-gray-50 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-40 cursor-pointer"
        >
          <option
            v-for="model in chatStore.availableModels"
            :key="model.id"
            :value="model.id"
          >
            {{ model.name }}
          </option>
        </select>
        <button
          @click="onClear"
          :disabled="isBusy || chatStore.messages.length === 0"
          class="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          履歴クリア
        </button>
      </div>
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
const { showWelcome, handleUserInput, loadHistory, clearHistory, loadModels } = useChatAgent()

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
}

onMounted(async () => {
  if (!configStore.isLoaded) {
    await configStore.loadConfig()
  }
  // モデル一覧取得と会話履歴復元を並列実行
  await Promise.all([loadModels(), loadHistory()])
  if (chatStore.messages.length === 0) {
    showWelcome()
  }
})
</script>
