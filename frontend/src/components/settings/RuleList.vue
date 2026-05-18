<script setup lang="ts">
import { onMounted } from 'vue'
import { useRulesStore } from '@/stores/rules'
import RuleListItem from './RuleListItem.vue'

const store = useRulesStore()

const emit = defineEmits<{
  (e: 'create'): void
}>()

onMounted(() => {
  if (store.rules.length === 0) {
    store.fetchAll()
  }
})

async function onToggleActive(ruleId: string, isActive: boolean) {
  await store.update(ruleId, { isActive })
  await store.fetchPreview()
}

async function onDelete(ruleId: string) {
  await store.remove(ruleId)
  await store.fetchPreview()
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-medium text-gray-700">ルール一覧</h2>
      <button
        class="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        @click="emit('create')"
      >
        + 新規作成
      </button>
    </div>

    <div v-if="store.loading" class="text-sm text-gray-400 py-4 text-center">
      読み込み中...
    </div>

    <div v-else-if="store.error" class="text-sm text-red-500 flex items-center gap-2 py-2">
      <span>{{ store.error }}</span>
      <button
        class="text-xs px-2 py-1 bg-gray-100 rounded hover:bg-gray-200 text-gray-600"
        @click="store.fetchAll()"
      >
        再試行
      </button>
    </div>

    <div v-else-if="store.rules.length === 0" class="text-sm text-gray-400 py-4 text-center">
      ルールがありません
    </div>

    <div v-else class="space-y-2">
      <RuleListItem
        v-for="rule in store.rules"
        :key="rule.ruleId"
        :rule="rule"
        :selected="rule.ruleId === store.selectedId"
        @select="store.select"
        @toggle-active="onToggleActive"
        @delete="onDelete"
      />
    </div>
  </div>
</template>
