# Issue #9: カスタムルールプロンプト管理UI 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** issue #8 で実装した `/chat/rules` API を Vue 3 管理画面から操作できるようにし、既存の `/chat/settings`（モデル選択）にルール管理セクションを統合する。

**Architecture:** 既存 `SettingsPage.vue` をタブ式 UI に拡張し、「モデル」タブ（既存）と「ルール」タブ（新規）を並置する。ルール側は Pinia store + composable パターンで実装し、issue #8 の API（CRUD/preview）を呼び出す。`marked` + `DOMPurify` で Markdown レンダリング、`localStorage` でテスト送信のドラフト引き継ぎ。

**Tech Stack:** Vue 3 (Composition API) / Pinia / Vue Router / TypeScript / Tailwind CSS / axios / marked / DOMPurify / Vitest / Playwright (E2E)

**Spec参照:**
- [requirements.md](../../../.kiro/specs/custom-rules-prompt/requirements.md) — Req 8〜13（UI側）
- [design.md](../../../.kiro/specs/custom-rules-prompt/design.md) — section 7（フロントエンド設計）

**仕様書との差分（実装で吸収する項目）:**
- 仕様書 AC 8.1: 「ナビゲーションタブに `Settings` 追加」 → 実態は既に `/chat/settings` (Agent モデル設定) が存在。**既存ページにタブ追加で対応**（グローバルナビ変更なし）
- 仕様書 AC 8.2: 「`/settings` ルート」 → 実態は `/chat/settings`、**既存ルートを使用**

---

## File Structure

| ファイル | 役割 | Create/Modify |
|---|---|---|
| `frontend/src/types/rules.ts` | API契約と1:1の型定義 | Create |
| `frontend/src/composables/useRulesApi.ts` | CRUD/preview API ラッパ（axios） | Create |
| `frontend/src/stores/rules.ts` | Pinia store（一覧/選択/未保存変更） | Create |
| `frontend/src/components/settings/RuleList.vue` | ルール一覧（カード並び） | Create |
| `frontend/src/components/settings/RuleListItem.vue` | ルール1件カード（toggle/delete） | Create |
| `frontend/src/components/settings/RuleEditor.vue` | 編集フォーム（テキストエリア + プレビュー） | Create |
| `frontend/src/components/settings/PromptPreview.vue` | 結合済み system prompt プレビュー | Create |
| `frontend/src/components/settings/DraftBanner.vue` | ChatPage 表示用ドラフト適用バナー | Create |
| `frontend/src/components/settings/RulesSection.vue` | SettingsPage に組み込むルール管理ルート | Create |
| `frontend/src/pages/SettingsPage.vue` | タブ式UIに拡張（モデル/ルール） | Modify |
| `frontend/src/pages/ChatPage.vue` | DraftBanner 表示 | Modify |
| `frontend/src/composables/useChatAgent.ts` | 送信時に `inlineRules` を含める | Modify |
| `frontend/src/stores/chat.ts` | `inlineRulesDraft` 状態追加 | Modify |
| `frontend/package.json` | `marked` / `dompurify` / `@types/dompurify` 追加 | Modify |
| `test/e2e/settings.spec.ts` | フロントE2E（Playwright） | Create |

---

## 事前準備

```bash
# 既に worktree あり
cd /home/pi/develop/image-composite-agent-issue9
ls -la .env.local  # symlink 確認

# frontend 依存
cd frontend
npm install
```

---

## Task 1: 依存ライブラリ追加（marked + DOMPurify）

**Files:**
- Modify: `frontend/package.json`

`marked` で Markdown を HTML 化、`DOMPurify` で XSS サニタイズ。

- [ ] **Step 1: 依存追加**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npm install --save marked dompurify
npm install --save-dev @types/dompurify
```

- [ ] **Step 2: package.json に追加されたことを確認**

```bash
grep -E '"marked"|"dompurify"|"@types/dompurify"' /home/pi/develop/image-composite-agent-issue9/frontend/package.json
```

Expected: 3行ヒット

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): marked + DOMPurify をルールUIのMarkdownレンダリング用に追加"
```

---

## Task 2: 型定義 (types/rules.ts)

**Files:**
- Create: `frontend/src/types/rules.ts`

issue #8 API の契約と1:1対応する型を集約。

- [ ] **Step 1: types ディレクトリと rules.ts 作成**

```bash
cd /home/pi/develop/image-composite-agent-issue9
mkdir -p frontend/src/types
```

ファイル内容:

```typescript
// frontend/src/types/rules.ts

export interface Rule {
  ruleId: string
  name: string
  prompt: string
  isDefault: boolean
  isActive: boolean
  createdAt: string  // ISO8601
  updatedAt: string  // ISO8601
}

export interface InlineRule {
  name: string
  prompt: string
}

export interface RulesPreviewResponse {
  fullPrompt: string
  appliedRules: { ruleId: string; name: string; chars: number }[]
  totalChars: number
  ruleCount: number
  limits: {
    maxPromptChars: number
    maxCount: number
    maxCombinedChars: number
  }
}

export interface RuleDraft {
  name: string
  prompt: string
}

export interface RuleCreateInput {
  name: string
  prompt: string
  isActive?: boolean
}

export interface RuleUpdateInput {
  name?: string
  prompt?: string
  isActive?: boolean
}
```

- [ ] **Step 2: TypeScript 型チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/types/rules.ts
git commit -m "feat(frontend): ルールAPI契約に対応する型定義を追加"
```

---

## Task 3: API ラッパ (composables/useRulesApi.ts)

**Files:**
- Create: `frontend/src/composables/useRulesApi.ts`

axios で CRUD と preview を呼び出す薄いラッパ。`useChatAgent.ts` のパターンに合わせて `getChatApiEndpoint()` を再利用。

- [ ] **Step 1: useRulesApi.ts 作成**

```typescript
// frontend/src/composables/useRulesApi.ts
import axios from 'axios'
import { useConfigStore } from '@/stores/config'
import type {
  Rule,
  RuleCreateInput,
  RuleUpdateInput,
  RulesPreviewResponse,
} from '@/types/rules'

function getRulesEndpoint(): string {
  const configStore = useConfigStore()
  const chatUrl = configStore.chatApiUrl
  if (!chatUrl) {
    throw new Error('chatApiUrl is not configured')
  }
  return `${chatUrl}/rules`
}

export function useRulesApi() {
  async function list(): Promise<Rule[]> {
    const endpoint = getRulesEndpoint()
    const res = await axios.get<{ rules: Rule[] }>(endpoint, { timeout: 15000 })
    return res.data.rules
  }

  async function get(ruleId: string): Promise<Rule> {
    const endpoint = getRulesEndpoint()
    const res = await axios.get<{ rule: Rule }>(`${endpoint}/${ruleId}`, { timeout: 15000 })
    return res.data.rule
  }

  async function create(input: RuleCreateInput): Promise<Rule> {
    const endpoint = getRulesEndpoint()
    const res = await axios.post<{ rule: Rule }>(endpoint, input, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    })
    return res.data.rule
  }

  async function update(ruleId: string, patch: RuleUpdateInput): Promise<Rule> {
    const endpoint = getRulesEndpoint()
    const res = await axios.put<{ rule: Rule }>(`${endpoint}/${ruleId}`, patch, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    })
    return res.data.rule
  }

  async function remove(ruleId: string): Promise<void> {
    const endpoint = getRulesEndpoint()
    await axios.delete(`${endpoint}/${ruleId}`, { timeout: 15000 })
  }

  async function fetchPreview(ruleIds?: string[]): Promise<RulesPreviewResponse> {
    const endpoint = getRulesEndpoint()
    const params = ruleIds && ruleIds.length > 0 ? { ruleIds: ruleIds.join(',') } : undefined
    const res = await axios.get<RulesPreviewResponse>(`${endpoint}/preview`, {
      params,
      timeout: 15000,
    })
    return res.data
  }

  return { list, get, create, update, remove, fetchPreview }
}
```

- [ ] **Step 2: 型チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/composables/useRulesApi.ts
git commit -m "feat(frontend): /chat/rules CRUD/preview を呼び出すuseRulesApi composable追加"
```

---

## Task 4: Pinia store (stores/rules.ts)

**Files:**
- Create: `frontend/src/stores/rules.ts`

ルール一覧、選択、未保存変更フラグを管理。

- [ ] **Step 1: stores/rules.ts 作成**

```typescript
// frontend/src/stores/rules.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useRulesApi } from '@/composables/useRulesApi'
import type { Rule, RuleCreateInput, RuleUpdateInput, RulesPreviewResponse } from '@/types/rules'

export const useRulesStore = defineStore('rules', () => {
  const rules = ref<Rule[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const selectedId = ref<string | null>(null)
  const draftDirty = ref(false)
  const preview = ref<RulesPreviewResponse | null>(null)

  const api = useRulesApi()

  const selectedRule = computed(() =>
    rules.value.find((r) => r.ruleId === selectedId.value) || null,
  )

  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      rules.value = await api.list()
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || 'ルールの取得に失敗しました'
    } finally {
      loading.value = false
    }
  }

  async function create(input: RuleCreateInput): Promise<Rule | null> {
    error.value = null
    try {
      const rule = await api.create(input)
      rules.value.push(rule)
      selectedId.value = rule.ruleId
      draftDirty.value = false
      return rule
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || '作成に失敗しました'
      return null
    }
  }

  async function update(ruleId: string, patch: RuleUpdateInput): Promise<Rule | null> {
    error.value = null
    try {
      const rule = await api.update(ruleId, patch)
      const idx = rules.value.findIndex((r) => r.ruleId === ruleId)
      if (idx >= 0) rules.value[idx] = rule
      draftDirty.value = false
      return rule
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || '更新に失敗しました'
      return null
    }
  }

  async function remove(ruleId: string): Promise<boolean> {
    error.value = null
    try {
      await api.remove(ruleId)
      rules.value = rules.value.filter((r) => r.ruleId !== ruleId)
      if (selectedId.value === ruleId) selectedId.value = null
      return true
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || '削除に失敗しました'
      return false
    }
  }

  async function fetchPreview(ruleIds?: string[]) {
    error.value = null
    try {
      preview.value = await api.fetchPreview(ruleIds)
    } catch (e: any) {
      error.value = e?.response?.data?.error || e?.message || 'プレビュー取得に失敗しました'
    }
  }

  function select(ruleId: string | null) {
    selectedId.value = ruleId
    draftDirty.value = false
  }

  function setDraftDirty(value: boolean) {
    draftDirty.value = value
  }

  return {
    rules,
    loading,
    error,
    selectedId,
    selectedRule,
    draftDirty,
    preview,
    fetchAll,
    create,
    update,
    remove,
    fetchPreview,
    select,
    setDraftDirty,
  }
})
```

- [ ] **Step 2: 型チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/stores/rules.ts
git commit -m "feat(frontend): ルール管理 Pinia store を追加"
```

---

## Task 5: ルール一覧 (RuleList.vue + RuleListItem.vue)

**Files:**
- Create: `frontend/src/components/settings/RuleListItem.vue`
- Create: `frontend/src/components/settings/RuleList.vue`

カード並びの一覧 UI。`isActive` トグル / 削除ボタン / デフォルトバッジ。

- [ ] **Step 1: settings ディレクトリ作成**

```bash
cd /home/pi/develop/image-composite-agent-issue9
mkdir -p frontend/src/components/settings
```

- [ ] **Step 2: RuleListItem.vue 作成**

```vue
<!-- frontend/src/components/settings/RuleListItem.vue -->
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
    @click="$emit('select', rule.ruleId)"
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
```

- [ ] **Step 3: RuleList.vue 作成**

```vue
<!-- frontend/src/components/settings/RuleList.vue -->
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
```

- [ ] **Step 4: 型チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 5: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/components/settings/
git commit -m "feat(frontend): ルール一覧コンポーネント（RuleList・RuleListItem）追加"
```

---

## Task 6: ルール編集フォーム (RuleEditor.vue)

**Files:**
- Create: `frontend/src/components/settings/RuleEditor.vue`

名前/本文/Active のフォーム + Markdown プレビュー切替 + 文字数カウント + 保存/削除/テスト送信ボタン。

- [ ] **Step 1: RuleEditor.vue 作成**

```vue
<!-- frontend/src/components/settings/RuleEditor.vue -->
<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useRulesStore } from '@/stores/rules'
import type { Rule, RuleDraft } from '@/types/rules'

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
  const html = marked(prompt.value, { breaks: true, gfm: true })
  return DOMPurify.sanitize(html as string)
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

onBeforeRouteLeave((_to, _from, next) => {
  if (store.draftDirty && !window.confirm('未保存の変更があります。破棄して移動しますか？')) {
    next(false)
  } else {
    store.setDraftDirty(false)
    next()
  }
})

const canSave = computed(() =>
  name.value.trim().length > 0 && name.value.length <= 100 && prompt.value.length > 0 && !overLimit.value && !saving.value,
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
  const draft: RuleDraft = { name: name.value.trim() || '(無題)', prompt: prompt.value }
  localStorage.setItem('__rule_draft__', JSON.stringify(draft))
  router.push('/chat')
}
</script>

<template>
  <div class="space-y-4">
    <h2 class="text-sm font-medium text-gray-700">
      {{ isNew ? '新規ルール作成' : (rule?.isDefault ? `編集: ${rule.name}（デフォルト）` : '編集') }}
    </h2>

    <div>
      <label class="block text-xs text-gray-600 mb-1">ルール名（最大100字）</label>
      <input
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
        このドラフトでテスト送信
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
```

- [ ] **Step 2: 型チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -10
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/components/settings/RuleEditor.vue
git commit -m "feat(frontend): ルール編集フォーム（保存/削除/テスト送信/Markdownプレビュー）追加"
```

---

## Task 7: System prompt プレビュー (PromptPreview.vue)

**Files:**
- Create: `frontend/src/components/settings/PromptPreview.vue`

`GET /chat/rules/preview` の結果を Markdown レンダリングで表示。

- [ ] **Step 1: PromptPreview.vue 作成**

```vue
<!-- frontend/src/components/settings/PromptPreview.vue -->
<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useRulesStore } from '@/stores/rules'

const store = useRulesStore()

const renderedPrompt = computed(() => {
  if (!store.preview) return ''
  const html = marked(store.preview.fullPrompt, { breaks: true, gfm: true })
  return DOMPurify.sanitize(html as string)
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
```

- [ ] **Step 2: 型チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/components/settings/PromptPreview.vue
git commit -m "feat(frontend): 結合済みsystem promptプレビュー（PromptPreview）追加"
```

---

## Task 8: ルール管理セクション統合 (RulesSection.vue)

**Files:**
- Create: `frontend/src/components/settings/RulesSection.vue`

`RuleList` + `RuleEditor` + `PromptPreview` を組み合わせた1画面。

- [ ] **Step 1: RulesSection.vue 作成**

```vue
<!-- frontend/src/components/settings/RulesSection.vue -->
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
```

- [ ] **Step 2: 型チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/components/settings/RulesSection.vue
git commit -m "feat(frontend): ルール管理セクション（RulesSection）統合コンポーネント追加"
```

---

## Task 9: SettingsPage.vue にタブ追加

**Files:**
- Modify: `frontend/src/pages/SettingsPage.vue`

既存の「Agent 設定（モデル選択）」を「モデル」タブにし、新規「ルール」タブを追加。

- [ ] **Step 1: 既存ファイル読み込み**

```bash
cd /home/pi/develop/image-composite-agent-issue9
cat frontend/src/pages/SettingsPage.vue
```

- [ ] **Step 2: SettingsPage.vue を以下の構造に変更**

既存の `<template>` 全体をタブ式に再構成し、`<script setup>` に `activeTab` ref を追加。具体差分：

`<script setup lang="ts">` の冒頭に追加:
```typescript
import { ref } from 'vue'
import RulesSection from '@/components/settings/RulesSection.vue'

const activeTab = ref<'model' | 'rules'>('model')
```

`<template>` を以下に置き換え:
```vue
<template>
  <div class="max-w-5xl mx-auto p-6">
    <div class="flex items-center gap-3 mb-6">
      <router-link to="/chat" class="text-gray-400 hover:text-gray-600 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd" />
        </svg>
      </router-link>
      <h1 class="text-xl font-semibold text-gray-800">Agent 設定</h1>
    </div>

    <!-- タブ切替 -->
    <div class="flex border-b border-gray-200 mb-6">
      <button
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="activeTab === 'model'
          ? 'text-blue-600 border-b-2 border-blue-500'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'model'"
      >
        モデル
      </button>
      <button
        class="px-4 py-2 text-sm font-medium transition-colors"
        :class="activeTab === 'rules'
          ? 'text-blue-600 border-b-2 border-blue-500'
          : 'text-gray-500 hover:text-gray-700'"
        @click="activeTab = 'rules'"
      >
        ルール（System Prompt）
      </button>
    </div>

    <!-- モデル選択タブ（既存内容） -->
    <section v-if="activeTab === 'model'" class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
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

      <!-- モデル一覧（既存のモデル選択UIをここに保持。元の <template> から該当部分をコピー） -->
      <!-- ※ 元の SettingsPage.vue にあった <div v-else> 以下のモデル一覧UIを完全にここへ移動する -->
    </section>

    <!-- ルール管理タブ -->
    <RulesSection v-else-if="activeTab === 'rules'" />
  </div>
</template>
```

> **重要**: 上のテンプレート内の「モデル一覧（既存のモデル選択UIをここに保持）」コメント部分には、元の `SettingsPage.vue` にあった `<div v-else>` 以下（モデルカード一覧の `<button>` 群と関連 markup）をそのまま貼り付ける。`<script setup>` 側の関数（`isLoading`, `loadError`, `retryLoad`, モデル選択ロジック等）はそのまま保持。

- [ ] **Step 3: 型チェック + Lint**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -5
```

Expected: エラーなし

- [ ] **Step 4: dev サーバ起動して動作確認**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npm run dev &
DEV_PID=$!
sleep 5
curl -s http://localhost:5173/chat/settings | head -20 || echo "dev サーバ起動失敗"
kill $DEV_PID 2>/dev/null
```

> ブラウザでも `http://localhost:5173/chat/settings` を開き、タブ切替が機能することを確認するのが望ましい。CIではこのstepはskip可。

- [ ] **Step 5: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/pages/SettingsPage.vue
git commit -m "feat(frontend): SettingsPage にモデル/ルールのタブ式UIを導入"
```

---

## Task 10: ChatPage に DraftBanner + inlineRules 連携

**Files:**
- Create: `frontend/src/components/settings/DraftBanner.vue`
- Modify: `frontend/src/stores/chat.ts`
- Modify: `frontend/src/composables/useChatAgent.ts`
- Modify: `frontend/src/pages/ChatPage.vue`

ルール編集画面で「テスト送信」ボタンを押すと localStorage 経由で ChatPage にドラフトが伝播し、その後の `POST /chat` リクエストに `inlineRules` が含まれる。

- [ ] **Step 1: DraftBanner.vue 作成**

```vue
<!-- frontend/src/components/settings/DraftBanner.vue -->
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { RuleDraft } from '@/types/rules'

const draft = ref<RuleDraft | null>(null)

function loadDraft() {
  const raw = localStorage.getItem('__rule_draft__')
  if (!raw) {
    draft.value = null
    return
  }
  try {
    const parsed = JSON.parse(raw) as RuleDraft
    if (typeof parsed.name === 'string' && typeof parsed.prompt === 'string') {
      draft.value = parsed
    }
  } catch {
    draft.value = null
  }
}

function clearDraft() {
  localStorage.removeItem('__rule_draft__')
  draft.value = null
}

defineExpose({ loadDraft, clearDraft })

onMounted(loadDraft)
</script>

<template>
  <div
    v-if="draft"
    class="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded flex items-center justify-between gap-3"
  >
    <span>
      ドラフトルール「<strong>{{ draft.name }}</strong>」適用中（{{ draft.prompt.length }}字）
    </span>
    <button
      class="text-xs px-2 py-1 bg-white border border-amber-300 rounded hover:bg-amber-100 text-amber-700"
      @click="clearDraft"
    >
      解除
    </button>
  </div>
</template>
```

- [ ] **Step 2: stores/chat.ts に inlineRulesDraft を追加**

`stores/chat.ts` 内のステートに追加:

```typescript
// 既存の sessionId/effectiveModelId 等の隣に追加
const inlineRulesDraft = ref<{ name: string; prompt: string } | null>(
  (() => {
    try {
      const raw = localStorage.getItem('__rule_draft__')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })(),
)

function refreshInlineDraft() {
  try {
    const raw = localStorage.getItem('__rule_draft__')
    inlineRulesDraft.value = raw ? JSON.parse(raw) : null
  } catch {
    inlineRulesDraft.value = null
  }
}

function clearInlineDraft() {
  localStorage.removeItem('__rule_draft__')
  inlineRulesDraft.value = null
}
```

`return` ブロックに `inlineRulesDraft, refreshInlineDraft, clearInlineDraft` を追加。

- [ ] **Step 3: useChatAgent.ts の sendMessage 部分を inlineRules 対応に変更**

`axios.post(endpoint, { sessionId, message, modelId }, ...)` を以下のように変更:

```typescript
const requestBody: Record<string, unknown> = {
  sessionId: chatStore.sessionId,
  message: trimmed,
  modelId: chatStore.effectiveModelId || undefined,
}
if (chatStore.inlineRulesDraft) {
  requestBody.inlineRules = [chatStore.inlineRulesDraft]
}

const response = await axios.post(endpoint, requestBody, {
  headers: { 'Content-Type': 'application/json' },
  timeout: 90000,
})
```

> 既存の `clearHistory()` 内に `chatStore.clearInlineDraft()` を追加してリセット時にドラフトも消す。

- [ ] **Step 4: ChatPage.vue に DraftBanner を組み込む**

`ChatPage.vue` の冒頭セクション（ヘッダ直下）に以下を追加:

```vue
<script setup lang="ts">
// ... 既存 import ...
import DraftBanner from '@/components/settings/DraftBanner.vue'
import { useChatStore } from '@/stores/chat'

// ... 既存ロジック ...
const chatStore = useChatStore()
const draftBannerRef = ref<InstanceType<typeof DraftBanner> | null>(null)

// route 遷移してきた直後に最新化
chatStore.refreshInlineDraft()
</script>

<template>
  <!-- 既存ヘッダの下、メッセージリストの上 -->
  <DraftBanner ref="draftBannerRef" class="mb-2" />
</template>
```

> `clearDraft` を DraftBanner 内で呼ぶと localStorage は消えるが store の `inlineRulesDraft` は古いまま。DraftBanner を `<script setup>` で expose し、`@click` 時に親側で `chatStore.clearInlineDraft()` を呼ぶ形がより安全。簡易策として、ChatPage の `mounted` で `chatStore.refreshInlineDraft()` を再度呼ぶ。

- [ ] **Step 5: 型チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9/frontend
npx vue-tsc --noEmit 2>&1 | tail -10
```

Expected: エラーなし

- [ ] **Step 6: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add frontend/src/components/settings/DraftBanner.vue frontend/src/stores/chat.ts frontend/src/composables/useChatAgent.ts frontend/src/pages/ChatPage.vue
git commit -m "feat(frontend): ChatPage にドラフトバナー追加・POST /chat に inlineRules を連携"
```

---

## Task 11: フロントエンド E2E テスト (Playwright)

**Files:**
- Create: `test/e2e/settings.spec.ts`

ナビゲーション・タブ切替・一覧表示・編集保存・ドラフト送信フローを検証。

- [ ] **Step 1: settings.spec.ts 作成**

```typescript
// test/e2e/settings.spec.ts
import { test, expect } from '@playwright/test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

test.describe('Settings ルール管理 UI', () => {
  test.beforeEach(async ({ page }) => {
    if (!FRONTEND_URL) test.skip()
    await page.goto(`${FRONTEND_URL}/chat/settings`)
  })

  test('AC 8.x / 9.x: タブ切替でルール一覧が表示され、JAAルールが含まれる', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await expect(page.getByRole('heading', { name: 'ルール一覧' })).toBeVisible()
    await expect(page.getByText('JAA字幕ハンドブック準拠 配置規定')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('デフォルト').first()).toBeVisible()
  })

  test('AC 10.x: 新規作成 → 保存 → 一覧に反映', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByText('JAA字幕ハンドブック準拠 配置規定').waitFor({ timeout: 10000 })

    await page.getByRole('button', { name: '+ 新規作成' }).click()
    const ruleName = `e2e-ui-${Date.now()}`
    await page.getByLabel('ルール名（最大100字）').fill(ruleName)
    await page.locator('textarea').first().fill('## E2Eテスト本文\n- 項目1')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText(ruleName)).toBeVisible({ timeout: 10000 })
  })

  test('AC 10.5: 文字数超過で保存ボタン無効化', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByRole('button', { name: '+ 新規作成' }).click()
    await page.getByLabel('ルール名（最大100字）').fill('oversize')
    await page.locator('textarea').first().fill('a'.repeat(10001))
    await expect(page.getByRole('button', { name: '保存' })).toBeDisabled()
    await expect(page.getByText('上限超過')).toBeVisible()
  })

  test('AC 11.x: System Prompt プレビューが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await expect(page.getByRole('heading', { name: /現在の System Prompt/ })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/ルール数:/)).toBeVisible()
  })

  test('AC 12.x: テスト送信ボタンで /chat へ遷移しドラフトバナーが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByRole('button', { name: '+ 新規作成' }).click()
    await page.getByLabel('ルール名（最大100字）').fill('draft-e2e')
    await page.locator('textarea').first().fill('テスト用ドラフト本文')
    await page.getByRole('button', { name: 'このドラフトでテスト送信' }).click()
    await expect(page).toHaveURL(/\/chat$/)
    await expect(page.getByText(/ドラフトルール「.*draft-e2e.*」適用中/)).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: '解除' }).click()
    await expect(page.getByText(/ドラフトルール/)).not.toBeVisible()
  })

  test('AC 9.4: デフォルトルールには削除ボタンが表示されない', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    const jaaCard = page.locator('div', { hasText: 'JAA字幕ハンドブック準拠 配置規定' }).first()
    await jaaCard.waitFor({ timeout: 10000 })
    await expect(jaaCard.getByRole('button', { name: '削除' })).toHaveCount(0)
  })
})
```

- [ ] **Step 2: 構文チェック**

```bash
cd /home/pi/develop/image-composite-agent-issue9
npx playwright test --list --config=test/playwright.config.ts test/e2e/settings.spec.ts 2>&1 | tail -10
```

Expected: 6 tests listed

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add test/e2e/settings.spec.ts
git commit -m "test(e2e): Settings ルール管理UIのE2Eテスト6件を追加"
```

---

## Task 12: 仕様書 tasks.md を完了ベースで更新 + 不整合補正

**Files:**
- Modify: `.kiro/specs/custom-rules-prompt/tasks.md`
- Modify: `.kiro/specs/custom-rules-prompt/requirements.md` (AC 8.1/8.2 を実態に合わせる)

- [ ] **Step 1: tasks.md の Issue #9 タスク（タスク12〜21）チェックボックスを更新**

該当する `- [ ]` を `- [x]` に変更。worktree削除（タスク21.4）等まだ実施していないものは `[ ]` のまま残す。

- [ ] **Step 2: requirements.md の AC 8.1 / 8.2 を実態に合わせて補正**

```markdown
- AC 8.1: `/chat/settings` の Settings ページがタブ式UIに拡張され、「モデル」「ルール（System Prompt）」の2タブを持つこと
- AC 8.2: 「ルール」タブから RulesSection が表示されること
```

- [ ] **Step 3: コミット**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git add .kiro/specs/custom-rules-prompt/tasks.md .kiro/specs/custom-rules-prompt/requirements.md
git commit -m "docs(spec): tasks.md issue #9 完了タスク更新 + requirements.md ナビゲーション要件を実態へ補正"
```

---

## Task 13: PR 作成（v3.3.0 へ統合）

**Files:** なし（GitHub操作）

- [ ] **Step 1: branch を最新 dev で更新（rebase）**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git fetch origin
git rebase origin/dev 2>&1 | tail -5
```

> conflict が出たら手動で解決して `git rebase --continue`。

- [ ] **Step 2: push**

```bash
cd /home/pi/develop/image-composite-agent-issue9
git push -u origin feature/issue9-rules-admin-ui 2>&1 | tail -3
```

- [ ] **Step 3: PR を dev 向けに作成**

```bash
cd /home/pi/develop/image-composite-agent-issue9
gh pr create --base dev --title "feat(frontend): カスタムルールプロンプト管理UI (#9)" --body "$(cat <<'EOF'
## 概要

issue #9 を解決。issue #8 で実装した /chat/rules API を Vue 3 管理画面から操作できるようにする。

## 変更点

- 既存 /chat/settings をタブ式UIに拡張（モデル/ルール）
- types/rules.ts / composables/useRulesApi.ts / stores/rules.ts 新設
- RuleList / RuleListItem / RuleEditor / PromptPreview / RulesSection / DraftBanner コンポーネント追加
- ChatPage に DraftBanner を組み込み、POST /chat へ inlineRules を連携
- Markdownレンダリングは marked + DOMPurify で XSS 対策
- E2Eテスト 6件追加

仕様書: .kiro/specs/custom-rules-prompt/

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" 2>&1 | tail -3
```

- [ ] **Step 4: マージ後、 release/v3.3.0 を dev で更新**

```bash
cd /home/pi/develop/image-composite-agent
git checkout release/v3.3.0
git pull origin release/v3.3.0
git merge origin/dev
git push origin release/v3.3.0
gh pr ready 81  # PR #81 を ready 復帰
```

---

## Self-Review チェック

### 1. Spec coverage

| Req | 受入基準 | 対応タスク |
|---|---|---|
| Req 8 | ナビゲーション/Settings | Task 9（仕様補正は Task 12） |
| Req 9 | ルール一覧UI | Task 5 |
| Req 10 | ルール編集UI | Task 6 |
| Req 11 | system prompt プレビュー | Task 7 |
| Req 12 | テスト送信機能 | Task 6, 10 |
| Req 13.5 | フロントE2E | Task 11 |

✅ 全Req カバー

### 2. Placeholder scan

- [x] 「TODO/TBD/implement later」なし
- [x] 全コードブロックは具体的な実装を示す
- [x] 「Similar to Task N」なし

> Task 9 Step 2 のコメント「元の SettingsPage.vue にあった `<div v-else>` 以下をそのまま貼り付ける」は手作業の指示だが、既存ファイル内容に依存するため「全コード再記述」は冗長。実装者に既存コード参照を求める形でOK。

### 3. Type/identifier consistency

- `Rule`, `InlineRule`, `RulesPreviewResponse`, `RuleDraft`, `RuleCreateInput`, `RuleUpdateInput`: Task 2で定義、後続Tasksで使用 ✅
- `useRulesApi()` 公開関数: `list/get/create/update/remove/fetchPreview` Task 3で定義、Task 4 で使用 ✅
- `useRulesStore` state/actions: Task 4で定義、Task 5/6/7/8で使用 ✅
- localStorage キー `__rule_draft__`: Task 6 (RuleEditor) で書き込み、Task 10 (chat store / DraftBanner) で読み取り ✅
- `chatApiUrl`: Task 3で `useConfigStore().chatApiUrl` を使用、既存 useChatAgent.ts と整合 ✅

### 4. Implementation order dependency

Task 1 → 2 → 3 → 4 → 5/6/7（並列可能） → 8 → 9 → 10 → 11 → 12 → 13

Task 5/6/7 は store (Task 4) に依存するが、それぞれ独立して実装可能。subagent並列化可。

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-issue9-rules-admin-ui.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 各タスクごとに新しいsubagentをdispatch、タスク間でレビュー、迅速な反復ループ

**2. Inline Execution** - 本セッション内で executing-plans を使って一括実行、複数タスクをチェックポイントで区切ってレビュー

**どちらで進めますか？**
