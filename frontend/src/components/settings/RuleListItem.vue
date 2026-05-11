<script setup lang="ts">
import { computed } from 'vue'
import type { Rule } from '@/types/rules'

const props = defineProps<{
  rule: Rule
  selected: boolean
}>()

const emit = defineEmits<{
  (e: 'select', ruleId: string): void
  (e: 'toggleActive', ruleId: string, isActive: boolean): void
  (e: 'delete', ruleId: string): void
}>()

const promptPreview = computed(() => {
  const text = props.rule.prompt.replace(/\n/g, ' ').trim()
  return text.length > 80 ? text.slice(0, 80) + '...' : text
})

const updatedDate = computed(() => {
  const d = new Date(props.rule.updatedAt)
  return d.toLocaleString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' })
})

function onToggle() {
  emit('toggleActive', props.rule.ruleId, !props.rule.isActive)
}

function onDelete() {
  if (window.confirm(`ルール "${props.rule.name}" を削除しますか？`)) {
    emit('delete', props.rule.ruleId)
  }
}
</script>

<template>
  <div
    class="rounded-lg border p-4 cursor-pointer transition-colors"
    :class="selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'"
    @click="emit('select', rule.ruleId)"
  >
    <div class="flex items-start justify-between gap-2 mb-2">
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-medium text-gray-800 truncate">{{ rule.name }}</h3>
        <div class="flex items-center gap-2 mt-1">
          <span
            v-if="rule.isDefault"
            class="text-xs px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded"
          >デフォルト</span>
          <span class="text-xs text-gray-400">更新: {{ updatedDate }}</span>
        </div>
      </div>
      <div class="flex items-center gap-2 shrink-0">
        <label class="inline-flex items-center cursor-pointer" @click.stop>
          <input
            type="checkbox"
            :checked="rule.isActive"
            class="sr-only peer"
            @change="onToggle"
          >
          <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-500 transition-colors relative after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
        </label>
        <button
          v-if="!rule.isDefault"
          class="text-xs text-red-500 hover:text-red-700"
          @click.stop="onDelete"
        >削除</button>
      </div>
    </div>
    <p class="text-xs text-gray-500 leading-relaxed">{{ promptPreview }}</p>
  </div>
</template>
