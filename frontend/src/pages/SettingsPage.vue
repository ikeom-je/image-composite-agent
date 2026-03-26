<template>
  <div class="max-w-2xl mx-auto p-6">
    <h1 class="text-xl font-semibold text-gray-800 mb-6">Agent 設定</h1>

    <!-- モデル選択 -->
    <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <h2 class="text-sm font-medium text-gray-700 mb-3">使用モデル</h2>
      <p class="text-xs text-gray-500 mb-4">チャットで使用するAIモデルを選択してください。</p>

      <div v-if="chatStore.availableModels.length === 0" class="text-sm text-gray-400">
        モデル情報を読み込み中...
      </div>

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
import { onMounted } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useConfigStore } from '@/stores/config'
import { useChatAgent } from '@/composables/useChatAgent'

const chatStore = useChatStore()
const configStore = useConfigStore()
const { loadModels } = useChatAgent()

const isSelected = (modelId: string) => {
  return chatStore.effectiveModelId === modelId
}

onMounted(async () => {
  if (!configStore.isLoaded) {
    await configStore.loadConfig()
  }
  if (chatStore.availableModels.length === 0) {
    await loadModels()
  }
})
</script>
