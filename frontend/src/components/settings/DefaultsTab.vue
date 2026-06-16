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
