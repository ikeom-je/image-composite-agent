<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useRulesStore } from '@/stores/rules'
import { useChatStore } from '@/stores/chat'
import type { Rule, PendingTestRule } from '@/types/rules'

const props = defineProps<{
  rule: Rule | null
  isNew: boolean
}>()

const emit = defineEmits<{
  (e: 'saved', ruleId: string): void
  (e: 'deleted'): void
  (e: 'cancel'): void
}>()

const store = useRulesStore()
const chatStore = useChatStore()
const router = useRouter()

const MAX_CHARS = 10000

const name = ref('')
const prompt = ref('')
const isActive = ref(false)
const showPreview = ref(false)
const saving = ref(false)

const charCount = computed(() => prompt.value.length)
const overLimit = computed(() => charCount.value > MAX_CHARS)
const renderedPrompt = computed(() => {
  const html = marked.parse(prompt.value, { breaks: true, gfm: true, async: false }) as string
  return DOMPurify.sanitize(html)
})

function syncFromProps() {
  if (props.rule) {
    name.value = props.rule.name
    prompt.value = props.rule.prompt
    isActive.value = props.rule.isActive
  } else {
    name.value = ''
    prompt.value = ''
    isActive.value = false
  }
  store.setDraftDirty(false)
  showPreview.value = false
}

watch(() => props.rule?.ruleId, syncFromProps, { immediate: true })
watch(() => props.isNew, () => {
  if (props.isNew) syncFromProps()
})

watch([name, prompt, isActive], () => {
  if (!props.rule && !props.isNew) return
  const original = props.rule
  const dirty = !original
    || name.value !== original.name
    || prompt.value !== original.prompt
    || isActive.value !== original.isActive
  store.setDraftDirty(dirty)
})

function onBeforeUnload(e: BeforeUnloadEvent) {
  if (store.draftDirty) {
    e.preventDefault()
    e.returnValue = ''
  }
}
window.addEventListener('beforeunload', onBeforeUnload)
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', onBeforeUnload)
})

onBeforeRouteLeave(() => {
  if (store.draftDirty && !window.confirm('未保存の変更があります。破棄して移動しますか？')) {
    return false
  }
  store.setDraftDirty(false)
  return true
})

const canSave = computed(() =>
  name.value.trim().length > 0
    && name.value.length <= 100
    && prompt.value.length > 0
    && !overLimit.value
    && !saving.value,
)

async function onSave() {
  if (!canSave.value) return
  saving.value = true
  try {
    if (props.rule) {
      const updated = await store.update(props.rule.ruleId, {
        name: name.value.trim(),
        prompt: prompt.value,
        isActive: isActive.value,
      })
      if (updated) emit('saved', updated.ruleId)
    } else {
      const created = await store.create({
        name: name.value.trim(),
        prompt: prompt.value,
        isActive: isActive.value,
      })
      if (created) emit('saved', created.ruleId)
    }
    await store.fetchPreview()
  } finally {
    saving.value = false
  }
}

async function onDelete() {
  if (!props.rule) return
  if (!window.confirm(`ルール "${props.rule.name}" を削除しますか？`)) return
  const ok = await store.remove(props.rule.ruleId)
  if (ok) {
    await store.fetchPreview()
    emit('deleted')
  }
}

function onTestSend() {
  const rule: PendingTestRule = { name: name.value.trim() || '(無題)', prompt: prompt.value }
  chatStore.setPendingTestRule(rule)
  store.setDraftDirty(false)
  router.push('/chat')
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-sm font-medium text-gray-700">
      {{ isNew ? '新規ルール作成' : (rule?.isDefault ? `編集: ${rule.name}（デフォルト）` : '編集') }}
    </h2>

    <div>
      <label for="rule-name-input" class="block text-xs text-gray-600 mb-1">ルール名（最大100字）</label>
      <input
        id="rule-name-input"
        v-model="name"
        type="text"
        maxlength="100"
        class="w-full text-sm px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-400"
      >
    </div>

    <div>
      <div class="flex items-center justify-between mb-1">
        <label class="block text-xs text-gray-600">本文（Markdown対応）</label>
        <button
          class="text-xs text-blue-500 hover:text-blue-700"
          @click="showPreview = !showPreview"
        >
          {{ showPreview ? '編集に戻る' : 'プレビュー' }}
        </button>
      </div>
      <textarea
        v-if="!showPreview"
        v-model="prompt"
        rows="14"
        class="w-full text-sm font-mono px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-400 resize-y"
      ></textarea>
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div
        v-else
        class="prose prose-sm max-w-none px-3 py-2 border border-gray-200 rounded bg-gray-50 min-h-[14rem]"
        v-html="renderedPrompt"
      ></div>
      <div class="flex items-center justify-between text-xs mt-1">
        <span :class="overLimit ? 'text-red-500' : 'text-gray-400'">
          文字数: {{ charCount.toLocaleString() }} / {{ MAX_CHARS.toLocaleString() }}
          <span v-if="overLimit" class="ml-1">（上限超過）</span>
        </span>
      </div>
    </div>

    <label class="inline-flex items-center gap-2 text-sm">
      <input v-model="isActive" type="checkbox" class="rounded">
      <span class="text-gray-700">アクティブにする（POST /chat に自動注入）</span>
    </label>

    <div class="flex items-center gap-2 pt-2 border-t border-gray-100">
      <button
        :disabled="!canSave"
        class="text-xs px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        @click="onSave"
      >
        {{ saving ? '保存中...' : '保存' }}
      </button>
      <button
        class="text-xs px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors"
        @click="onTestSend"
      >
        保存せずに試す
      </button>
      <button
        v-if="rule && !rule.isDefault"
        class="text-xs px-4 py-2 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors ml-auto"
        @click="onDelete"
      >
        削除
      </button>
    </div>

    <div v-if="store.error" class="text-xs text-red-500">{{ store.error }}</div>
  </div>
</template>
