<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useRulesStore } from '@/stores/rules'

const store = useRulesStore()

const renderedPrompt = computed(() => {
  if (!store.preview) return ''
  const html = marked.parse(store.preview.fullPrompt, { breaks: true, gfm: true, async: false }) as string
  return DOMPurify.sanitize(html)
})

onMounted(() => {
  if (!store.preview) {
    store.fetchPreview()
  }
})
</script>

<template>
  <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
    <div class="flex items-center justify-between mb-3">
      <h2 class="text-sm font-medium text-gray-700">現在の System Prompt（基本 + アクティブルール）</h2>
      <button
        class="text-xs text-blue-500 hover:text-blue-700"
        @click="store.fetchPreview()"
      >
        再取得
      </button>
    </div>

    <div v-if="!store.preview" class="text-sm text-gray-400">読み込み中...</div>

    <div v-else>
      <div class="text-xs text-gray-500 mb-2 flex items-center gap-3">
        <span>ルール数: {{ store.preview.ruleCount }}</span>
        <span>総文字数: {{ store.preview.totalChars.toLocaleString() }}</span>
        <span>上限: {{ store.preview.limits.maxCombinedChars.toLocaleString() }}</span>
      </div>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div
        class="prose prose-sm max-w-none p-3 border border-gray-200 rounded bg-gray-50 max-h-96 overflow-y-auto"
        v-html="renderedPrompt"
      ></div>
    </div>
  </section>
</template>
