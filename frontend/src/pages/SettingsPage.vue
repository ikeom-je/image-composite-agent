<template>
  <div class="max-w-2xl mx-auto p-6">
    <div class="flex items-center gap-3 mb-6">
      <router-link to="/chat" class="text-gray-400 hover:text-gray-600 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
        </svg>
      </router-link>
      <h1 class="text-xl font-semibold text-gray-800">Agent 設定</h1>
    </div>

    <!-- モデル選択 -->
    <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <h2 class="text-sm font-medium text-gray-700 mb-3">使用モデル</h2>
      <p class="text-xs text-gray-500 mb-4">チャットで使用するAIモデルを選択してください。</p>

      <!-- ローディング中 -->
      <div v-if="isLoading" class="text-sm text-gray-400">
        モデル情報を読み込み中...
      </div>

      <!-- エラー時 -->
      <div v-else-if="loadError" class="text-sm text-red-500 flex items-center gap-2">
        <span>モデル情報の取得に失敗しました。</span>
        <button @click="retryLoad" class="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 text-gray-600 transition-colors">
          再試行
        </button>
      </div>

      <!-- モデル一覧 -->
      <div v-else class="space-y-2">
        <label
          v-for="model in chatStore.availableModels"
          :key="model.id"
          class="flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
          :class="isSelected(model.id)
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'"
        >
          <input
            type="radio"
            name="model"
            :value="model.id"
            :checked="isSelected(model.id)"
            @change="chatStore.selectModel(model.id)"
            class="mt-0.5 text-blue-600 focus:ring-blue-500"
          />
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-gray-800">{{ model.name }}</span>
              <span class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                {{ model.provider }}
              </span>
              <span v-if="model.id === chatStore.defaultModelId" class="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-600">
                デフォルト
              </span>
            </div>
            <p class="text-xs text-gray-500 mt-0.5">{{ model.description }}</p>
            <p class="text-[10px] text-gray-400 mt-0.5 font-mono truncate">{{ model.id }}</p>
          </div>
        </label>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useConfigStore } from '@/stores/config'
import { useChatAgent } from '@/composables/useChatAgent'

const chatStore = useChatStore()
const configStore = useConfigStore()
const { loadModels } = useChatAgent()

const isLoading = ref(true)
const loadError = ref(false)

const isSelected = (modelId: string) => {
  return chatStore.effectiveModelId === modelId
}

async function retryLoad() {
  isLoading.value = true
  loadError.value = false
  await doLoadModels()
}

async function doLoadModels() {
  try {
    await loadModels()
    loadError.value = chatStore.availableModels.length === 0
  } catch {
    loadError.value = true
  } finally {
    isLoading.value = false
  }
}

onMounted(async () => {
  if (!configStore.isLoaded) {
    await configStore.loadConfig()
  }
  if (chatStore.availableModels.length > 0) {
    isLoading.value = false
  } else {
    await doLoadModels()
  }
})
</script>
