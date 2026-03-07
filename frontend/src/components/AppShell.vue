<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- ヘッダー -->
    <header class="bg-gradient-to-r from-blue-600 to-indigo-700 shadow-lg px-4 py-3">
      <h1 class="text-xl font-bold text-white tracking-wide">Image Compositor</h1>
      <p class="text-blue-200 text-xs mt-0.5">画像合成REST API &amp; チャットエージェント</p>
    </header>

    <!-- タブナビゲーション -->
    <nav class="bg-white border-b border-gray-200 shadow-sm">
      <div class="flex">
        <router-link
          v-for="tab in tabs"
          :key="tab.to"
          :to="tab.to"
          class="tab-link px-6 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
          :class="isActive(tab.to)
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
        >
          {{ tab.label }}
        </router-link>
      </div>
    </nav>

    <!-- メインコンテンツ -->
    <main class="flex-1">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const tabs = [
  { to: '/', label: 'Portal' },
  { to: '/api', label: 'APIDemo' },
  { to: '/chat', label: 'ChatAgent' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>
