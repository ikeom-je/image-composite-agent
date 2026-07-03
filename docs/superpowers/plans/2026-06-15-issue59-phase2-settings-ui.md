# Issue #59 Phase 2 — SettingsPage デフォルト/プリセット UI 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SettingsPage に「デフォルト」タブを追加し、composite-default.json のプリセット一覧表示・ユーザー個別上書き（localStorage）・リセット機能を実装する。

**Architecture:** `compositeDefaults.ts` に `Preset` 型を追加（読み取り専用）。新設 `userDefaults.ts` が localStorage への上書き値を管理する。App.vue が `applyCompositeDefaults()` → `applyUserOverrides()` の順で初期値を適用することで「system_default < userDefaults < UI明示指定」の優先チェーンを保証する。

**Tech Stack:** Vue 3 (Composition API) / Pinia / TypeScript / Vitest / Tailwind CSS

---

## ファイル構成

| 操作 | ファイル | 責務 |
|------|---------|------|
| 修正 | `frontend/src/stores/compositeDefaults.ts` | `Preset` / `PresetTextOverlay` 型追加、`presets` ゲッター追加 |
| 新規 | `frontend/src/stores/userDefaults.ts` | localStorage上書き管理（baseImage / baseOpacity）、applyPreset / reset |
| 新規 | `frontend/src/stores/__tests__/userDefaults.test.ts` | userDefaults ストアのユニットテスト |
| 修正 | `frontend/src/stores/__tests__/compositeDefaults.test.ts` | presets 型のテスト追加 |
| 修正 | `frontend/src/App.vue` | applyUserOverrides() 追加、onMounted で呼び出し |
| 新規 | `frontend/src/components/settings/DefaultsTab.vue` | プリセットカード一覧 + ユーザー上書き表示 + リセット |
| 修正 | `frontend/src/pages/SettingsPage.vue` | 'defaults' タブ追加、DefaultsTab 参照 |

---

## Task 1: compositeDefaults.ts に Preset 型を追加

**Files:**
- Modify: `frontend/src/stores/compositeDefaults.ts`

- [ ] **Step 1: Preset 型と presets ゲッターを追加**

`frontend/src/stores/compositeDefaults.ts` の `TextPlaceholder` 定義の直後（28行目付近）に以下を追加し、`CompositeDefaults` の `presets` フィールドを強化する：

```typescript
export interface PresetTextOverlay {
  text: string
  position: string
  font_size: number
  font_color: string
  bg_color: string | null
  bg_opacity?: number
}

export interface Preset {
  description: string
  baseImage: string
  baseOpacity: number
  image_placement: Partial<Record<ImageKey, ImagePosition>>
  text_overlays: Record<string, PresetTextOverlay>
}
```

`CompositeDefaults` インターフェース（46行目）の `presets` フィールドを変更：
```typescript
// 変更前
export interface CompositeDefaults {
  version: string
  system_default: SystemDefault
  presets: Record<string, unknown>
}

// 変更後
export interface CompositeDefaults {
  version: string
  system_default: SystemDefault
  presets: Record<string, Preset>
}
```

`defineStore` 内の `systemDefault` computed の直後に `presets` computed を追加：
```typescript
const presets = computed(() => defaults.value?.presets ?? {})
```

`return` ブロックに `presets` を追加：
```typescript
return {
  defaults,
  isLoaded,
  systemDefault,
  presets,          // ← 追加
  loadDefaults,
  determineImageMode,
  getImageDefault,
  getTextPlaceholder,
}
```

- [ ] **Step 2: 既存テストが通ることを確認**

```bash
cd frontend && npm test -- --run src/stores/__tests__/compositeDefaults.test.ts
```

Expected: all tests PASS（`presets: {}` のサンプルはそのまま互換）

- [ ] **Step 3: コミット**

```bash
git add frontend/src/stores/compositeDefaults.ts
git commit -m "feat(stores): compositeDefaults に Preset 型と presets ゲッターを追加 (issue #59)"
```

---

## Task 2: userDefaults.ts 新設とユニットテスト

**Files:**
- Create: `frontend/src/stores/userDefaults.ts`
- Create: `frontend/src/stores/__tests__/userDefaults.test.ts`

- [ ] **Step 1: 失敗テストを書く**

`frontend/src/stores/__tests__/userDefaults.test.ts` を新規作成：

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useUserDefaultsStore } from '@/stores/userDefaults'
import type { Preset } from '@/stores/compositeDefaults'

const SAMPLE_PRESET: Preset = {
  description: 'ライブ配信用',
  baseImage: '#000000',
  baseOpacity: 100,
  image_placement: { image1: { x: 760, y: 290, width: 400, height: 400 } },
  text_overlays: {
    text1: { text: 'LIVE', position: '1800,80', font_size: 56, font_color: '#FF0000', bg_color: null },
  },
}

describe('useUserDefaultsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('初期状態では overrides は空オブジェクト', () => {
    const store = useUserDefaultsStore()
    expect(store.overrides).toEqual({})
    expect(store.hasOverrides).toBe(false)
  })

  it('applyPreset で baseImage/baseOpacity を localStorage に保存する', () => {
    const store = useUserDefaultsStore()
    store.applyPreset(SAMPLE_PRESET)
    expect(store.overrides.baseImage).toBe('#000000')
    expect(store.overrides.baseOpacity).toBe(100)
    expect(store.hasOverrides).toBe(true)
    const saved = JSON.parse(localStorage.getItem('composite-user-defaults') ?? '{}')
    expect(saved.baseImage).toBe('#000000')
  })

  it('reset() で overrides をクリアし localStorage を削除する', () => {
    const store = useUserDefaultsStore()
    store.applyPreset(SAMPLE_PRESET)
    store.reset()
    expect(store.overrides).toEqual({})
    expect(store.hasOverrides).toBe(false)
    expect(localStorage.getItem('composite-user-defaults')).toBeNull()
  })

  it('localStorage に保存済み値があれば初期化時に復元する', () => {
    localStorage.setItem('composite-user-defaults', JSON.stringify({ baseImage: '#FFFFFF', baseOpacity: 80 }))
    const store = useUserDefaultsStore()
    expect(store.overrides.baseImage).toBe('#FFFFFF')
    expect(store.overrides.baseOpacity).toBe(80)
  })

  it('localStorage が壊れていてもエラーにならず空オブジェクトを返す', () => {
    localStorage.setItem('composite-user-defaults', 'invalid json{')
    const store = useUserDefaultsStore()
    expect(store.overrides).toEqual({})
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
cd frontend && npm test -- --run src/stores/__tests__/userDefaults.test.ts
```

Expected: FAIL with "Cannot find module '@/stores/userDefaults'"

- [ ] **Step 3: userDefaults.ts を実装**

`frontend/src/stores/userDefaults.ts` を新規作成：

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Preset } from './compositeDefaults'

const STORAGE_KEY = 'composite-user-defaults'

export interface UserDefaults {
  baseImage?: string
  baseOpacity?: number
}

function loadFromStorage(): UserDefaults {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as UserDefaults) : {}
  } catch {
    return {}
  }
}

export const useUserDefaultsStore = defineStore('userDefaults', () => {
  const overrides = ref<UserDefaults>(loadFromStorage())

  const hasOverrides = computed(
    () => overrides.value.baseImage !== undefined || overrides.value.baseOpacity !== undefined,
  )

  function applyPreset(preset: Preset): void {
    overrides.value = {
      baseImage: preset.baseImage,
      baseOpacity: preset.baseOpacity,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value))
  }

  function reset(): void {
    overrides.value = {}
    localStorage.removeItem(STORAGE_KEY)
  }

  return { overrides, hasOverrides, applyPreset, reset }
})
```

- [ ] **Step 4: テストが通ることを確認**

```bash
cd frontend && npm test -- --run src/stores/__tests__/userDefaults.test.ts
```

Expected: 5 tests PASS

- [ ] **Step 5: コミット**

```bash
git add frontend/src/stores/userDefaults.ts frontend/src/stores/__tests__/userDefaults.test.ts
git commit -m "feat(stores): userDefaults ストア新設 — localStorage上書き管理 (issue #59)"
```

---

## Task 3: App.vue に userOverrides 適用を追加

**Files:**
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: import と store 初期化を追加**

`frontend/src/App.vue` の `script setup` ブロック内、`compositeDefaultsStore` の初期化行（151行目付近）の直後に追加：

```typescript
import { useUserDefaultsStore } from '@/stores/userDefaults'
// ...（既存 import 群の末尾付近）
const userDefaultsStore = useUserDefaultsStore()
```

- [ ] **Step 2: applyUserOverrides() 関数を追加**

`applyCompositeDefaults()` 関数（833行目付近）の直後に追加：

```typescript
function applyUserOverrides(): void {
  const ud = userDefaultsStore.overrides
  if (ud.baseImage !== undefined) params.value.baseImage = ud.baseImage
  if (ud.baseOpacity !== undefined) params.value.baseOpacity = ud.baseOpacity
}
```

- [ ] **Step 3: onMounted で applyUserOverrides() を呼び出す**

`onMounted` 内の `applyCompositeDefaults()` 呼び出し（889行目）の直後に追加：

```typescript
applyCompositeDefaults()
applyUserOverrides()  // ← 追加
```

- [ ] **Step 4: 開発サーバーで動作確認**

```bash
cd frontend && npm run dev
```

1. ブラウザで `http://localhost:5173` を開く
2. localStorage に `composite-user-defaults` キーを手動で設定（DevTools → Application → LocalStorage）：
   `{"baseImage":"#FF0000","baseOpacity":50}`
3. ページをリロードして背景色が赤・不透明度が50%になることを確認
4. localStorage を削除してリロードし、通常のデフォルト（`#000000`, 100%）に戻ることを確認

- [ ] **Step 5: コミット**

```bash
git add frontend/src/App.vue
git commit -m "feat(app): userDefaults の上書き値を起動時に反映 (issue #59)"
```

---

## Task 4: DefaultsTab.vue 新規作成

**Files:**
- Create: `frontend/src/components/settings/DefaultsTab.vue`

- [ ] **Step 1: DefaultsTab.vue を実装**

`frontend/src/components/settings/DefaultsTab.vue` を新規作成：

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { useCompositeDefaultsStore } from '@/stores/compositeDefaults'
import { useUserDefaultsStore } from '@/stores/userDefaults'
import type { Preset } from '@/stores/compositeDefaults'

const compositeStore = useCompositeDefaultsStore()
const userStore = useUserDefaultsStore()

onMounted(async () => {
  if (!compositeStore.isLoaded) {
    await compositeStore.loadDefaults()
  }
})

function applyPreset(preset: Preset) {
  userStore.applyPreset(preset)
}

function reset() {
  userStore.reset()
}
</script>

<template>
  <div class="space-y-6">

    <!-- プリセット一覧 -->
    <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <h2 class="text-sm font-medium text-gray-700 mb-1">プリセット</h2>
      <p class="text-xs text-gray-500 mb-4">
        典型的な配置パターンを適用すると、背景色と不透明度のデフォルト値が更新されます。
      </p>

      <div v-if="!compositeStore.isLoaded" class="text-sm text-gray-400">読み込み中...</div>

      <div v-else-if="Object.keys(compositeStore.presets).length === 0" class="text-sm text-gray-400">
        プリセットが定義されていません。
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div
          v-for="(preset, name) in compositeStore.presets"
          :key="name"
          class="rounded-lg border border-gray-200 p-4 flex flex-col gap-3 bg-gray-50"
        >
          <div class="flex-1">
            <h3 class="text-sm font-semibold text-gray-800 capitalize">{{ name }}</h3>
            <p class="text-xs text-gray-500 mt-1">{{ preset.description }}</p>
            <div class="mt-2 flex items-center gap-2 text-xs text-gray-600">
              <span class="inline-flex items-center gap-1">
                <span
                  class="w-3 h-3 rounded-sm border border-gray-300 inline-block"
                  :style="preset.baseImage.startsWith('#') ? { background: preset.baseImage } : { background: 'transparent' }"
                />
                {{ preset.baseImage === 'transparent' ? '透明' : preset.baseImage }}
              </span>
              <span>/ 不透明度 {{ preset.baseOpacity }}%</span>
            </div>
          </div>
          <button
            class="text-xs px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors self-start"
            @click="applyPreset(preset)"
          >
            適用
          </button>
        </div>
      </div>
    </section>

    <!-- 現在のユーザー上書き -->
    <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h2 class="text-sm font-medium text-gray-700">現在のユーザー上書き</h2>
          <p class="text-xs text-gray-500 mt-0.5">localStorage に保存されたデフォルト上書き値</p>
        </div>
        <button
          v-if="userStore.hasOverrides"
          class="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
          @click="reset"
        >
          リセット
        </button>
      </div>

      <div v-if="!userStore.hasOverrides" class="text-sm text-gray-400">
        上書き設定なし（システムデフォルトを使用中）
      </div>
      <div v-else class="space-y-2 text-sm">
        <div v-if="userStore.overrides.baseImage !== undefined" class="flex items-center gap-3">
          <span class="text-gray-500 w-28 shrink-0">背景色</span>
          <span class="inline-flex items-center gap-2">
            <span
              class="w-4 h-4 rounded-sm border border-gray-300"
              :style="userStore.overrides.baseImage.startsWith('#')
                ? { background: userStore.overrides.baseImage }
                : { background: 'transparent' }"
            />
            <span class="font-mono text-gray-800">{{ userStore.overrides.baseImage }}</span>
          </span>
        </div>
        <div v-if="userStore.overrides.baseOpacity !== undefined" class="flex items-center gap-3">
          <span class="text-gray-500 w-28 shrink-0">不透明度</span>
          <span class="font-mono text-gray-800">{{ userStore.overrides.baseOpacity }}%</span>
        </div>
      </div>
    </section>

    <!-- システムデフォルト（読み取り専用） -->
    <section class="bg-white rounded-lg border border-gray-200 shadow-sm p-5">
      <h2 class="text-sm font-medium text-gray-700 mb-1">システムデフォルト</h2>
      <p class="text-xs text-gray-500 mb-3">composite-default.json の system_default 値（読み取り専用）</p>

      <div v-if="!compositeStore.systemDefault" class="text-sm text-gray-400">読み込み中...</div>
      <dl v-else class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        <div class="flex items-center gap-2">
          <dt class="text-gray-500 w-28 shrink-0">背景色</dt>
          <dd class="flex items-center gap-2">
            <span
              class="w-4 h-4 rounded-sm border border-gray-300"
              :style="compositeStore.systemDefault.baseImage.startsWith('#')
                ? { background: compositeStore.systemDefault.baseImage }
                : { background: 'transparent' }"
            />
            <span class="font-mono text-gray-800">{{ compositeStore.systemDefault.baseImage }}</span>
          </dd>
        </div>
        <div class="flex items-center gap-2">
          <dt class="text-gray-500 w-28 shrink-0">不透明度</dt>
          <dd class="font-mono text-gray-800">{{ compositeStore.systemDefault.baseOpacity }}%</dd>
        </div>
        <div class="flex items-center gap-2">
          <dt class="text-gray-500 w-28 shrink-0">キャンバス</dt>
          <dd class="font-mono text-gray-800">
            {{ compositeStore.systemDefault.canvas.width }}×{{ compositeStore.systemDefault.canvas.height }}
          </dd>
        </div>
        <div class="flex items-center gap-2">
          <dt class="text-gray-500 w-28 shrink-0">動画形式</dt>
          <dd class="font-mono text-gray-800">
            {{ compositeStore.systemDefault.video.format }} / {{ compositeStore.systemDefault.video.duration }}秒
          </dd>
        </div>
      </dl>
    </section>

  </div>
</template>
```

- [ ] **Step 2: コミット**

```bash
git add frontend/src/components/settings/DefaultsTab.vue
git commit -m "feat(settings): DefaultsTab.vue 新規作成 — プリセット一覧 + ユーザー上書き + システムデフォルト表示 (issue #59)"
```

---

## Task 5: SettingsPage.vue に「デフォルト」タブを追加

**Files:**
- Modify: `frontend/src/pages/SettingsPage.vue`

- [ ] **Step 1: 'defaults' タブを追加**

`frontend/src/pages/SettingsPage.vue` の `activeTab` 型定義（123行目）を変更：

```typescript
// 変更前
const activeTab = ref<'model' | 'rules'>('model')

// 変更後
const activeTab = ref<'model' | 'rules' | 'defaults'>('model')
```

`script setup` ブロックの import 群に追加：

```typescript
import DefaultsTab from '@/components/settings/DefaultsTab.vue'
```

- [ ] **Step 2: タブボタンを追加**

`<template>` のタブ切替 `div`（13行目付近）内、`rules` タブボタンの直後に追加：

```html
<button
  class="px-4 py-2 text-sm font-medium transition-colors"
  :class="activeTab === 'defaults'
    ? 'text-blue-600 border-b-2 border-blue-500'
    : 'text-gray-500 hover:text-gray-700'"
  @click="activeTab = 'defaults'"
>
  デフォルト
</button>
```

- [ ] **Step 3: DefaultsTab の表示ブロックを追加**

`</template>` 閉じタグの直前（ルール管理タブの `</template>` の直後）に追加：

```html
<!-- デフォルト/プリセットタブ -->
<section v-else-if="activeTab === 'defaults'">
  <DefaultsTab />
</section>
```

- [ ] **Step 4: 開発サーバーで動作確認**

```bash
cd frontend && npm run dev
```

1. `http://localhost:5173/chat/settings` を開く
2. 「デフォルト」タブが表示されることを確認
3. プリセット（live / promo / subtitle）の3枚カードが表示されることを確認
4. 「適用」ボタンを押すと「現在のユーザー上書き」セクションに値が反映されることを確認
5. 「リセット」ボタンを押すと「上書き設定なし」に戻ることを確認
6. `/api` ページに遷移し、背景色・不透明度の初期値がプリセット適用値になっていることを確認
7. DevTools → LocalStorage → `composite-user-defaults` キーで保存値を確認

- [ ] **Step 5: コミット**

```bash
git add frontend/src/pages/SettingsPage.vue
git commit -m "feat(settings): SettingsPage に「デフォルト」タブ追加 (issue #59 Phase 2)"
```

---

## Task 6: tasks.md 更新と PR 作成準備

**Files:**
- Modify: `.kiro/specs/image-composition/tasks.md`（Phase 2 タスクがある場合）

- [ ] **Step 1: 全テストを通す**

```bash
cd frontend && npm test -- --run
```

Expected: userDefaults テスト 5件 + compositeDefaults テスト 既存全件 PASS

- [ ] **Step 2: TypeScript エラーがないことを確認**

```bash
cd frontend && npx tsc --noEmit
```

Expected: エラーなし（0 errors）

- [ ] **Step 3: 最終コミット（tasks.md 更新）**

`.kiro/specs/image-composition/tasks.md` に Phase 2 の完了状態を反映（既存タスクのチェックボックスを `[x]` に更新）してコミット：

```bash
git add .kiro/specs/image-composition/tasks.md
git commit -m "docs(tasks): issue #59 Phase 2 タスク完了マーク"
```

---

## Self-Review チェックリスト

- [x] Preset 型 → Task 1 で定義、Task 2/4 で参照
- [x] UserDefaults 型 → Task 2 で定義、Task 3/4 で参照
- [x] `applyPreset` シグネチャ一致 → Task 2 で定義、Task 4 で呼び出し
- [x] `hasOverrides` → Task 2 で定義、Task 4 テンプレートで使用
- [x] localStorage キー `'composite-user-defaults'` → Task 2 で定数化、Task 2 テストで検証
- [x] `compositeStore.presets` ゲッター → Task 1 で追加、Task 4 で参照
- [x] `applyCompositeDefaults()` → `applyUserOverrides()` の順序 → Task 3 で確認
- [x] システムデフォルト表示が読み取り専用 → DefaultsTab に編集フォームなし
- [x] image_placement の上書きは扱わない（チャット/Agent Tools 専用）→ `UserDefaults` に含まない
