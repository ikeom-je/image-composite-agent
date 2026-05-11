<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRulesStore } from '@/stores/rules'
import RuleList from './RuleList.vue'
import RuleEditor from './RuleEditor.vue'
import PromptPreview from './PromptPreview.vue'

const store = useRulesStore()
const isCreating = ref(false)

const editorRule = computed(() => (isCreating.value ? null : store.selectedRule))

function onCreate() {
  isCreating.value = true
  store.select(null)
}

function onSaved(ruleId: string) {
  isCreating.value = false
  store.select(ruleId)
}

function onDeleted() {
  isCreating.value = false
}
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        <RuleList @create="onCreate" />
      </div>
      <div>
        <div v-if="!editorRule && !isCreating" class="text-sm text-gray-400 py-12 text-center">
          左から編集するルールを選択するか、「新規作成」を押してください
        </div>
        <RuleEditor
          v-else
          :rule="editorRule"
          :is-new="isCreating"
          @saved="onSaved"
          @deleted="onDeleted"
        />
      </div>
    </div>

    <PromptPreview />
  </div>
</template>
