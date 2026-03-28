import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

// gitコミットハッシュを取得（どのコミットがデプロイされたか特定するため）
let buildHash = 'unknown'
try {
  buildHash = execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
} catch {
  // git未使用環境（CI等）のフォールバック
}

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

const packageJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf-8'))

export default defineConfig({
  plugins: [tailwindcss(), vue(), htmlBuildHashPlugin(), writeBuildHashPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(packageJson.version),
    __BUILD_HASH__: JSON.stringify(buildHash),
  },
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