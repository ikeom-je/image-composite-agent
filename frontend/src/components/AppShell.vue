<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- ナビゲーションバー -->
    <nav class="bg-gradient-to-r from-blue-600 to-indigo-700 shadow-lg">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-14">
          <!-- ロゴ -->
          <router-link to="/" class="flex items-center gap-2 text-white font-bold text-lg hover:opacity-90 transition-opacity">
            <span class="text-xl">Image Compositor</span>
          </router-link>

          <!-- ナビリンク -->
          <div class="flex items-center gap-1">
            <router-link
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              :class="isActive(link.to)
                ? 'bg-white/20 text-white'
                : 'text-blue-100 hover:bg-white/10 hover:text-white'"
            >
              {{ link.label }}
            </router-link>
          </div>
        </div>
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

const navLinks = [
  { to: '/', label: 'Portal' },
  { to: '/api', label: 'API' },
  { to: '/chat', label: 'Chat' },
]

const isActive = (path: string) => {
  if (path === '/') return route.path === '/'
  return route.path.startsWith(path)
}
</script>
