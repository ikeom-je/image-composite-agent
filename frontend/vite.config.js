import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

// ビルドごとにユニークなハッシュを生成
const buildHash = crypto.randomBytes(8).toString('hex')

// ビルドハッシュをファイルに保存（CDKが読み込む）
function writeBuildHashPlugin() {
  return {
    name: 'write-build-hash',
    closeBundle() {
      const hashFile = path.resolve(__dirname, 'dist/.build-hash')
      fs.writeFileSync(hashFile, buildHash)
    },
  }
}

// index.htmlのプレースホルダーをビルドハッシュに置換
function htmlBuildHashPlugin() {
  return {
    name: 'html-build-hash',
    transformIndexHtml(html) {
      return html.replace(/%%BUILD_HASH%%/g, buildHash)
    },
  }
}

export default defineConfig({
  plugins: [tailwindcss(), vue(), htmlBuildHashPlugin(), writeBuildHashPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          utils: ['axios']
        }
      }
    }
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        target: process.env.API_URL || 'https://api.example.com/prod',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})