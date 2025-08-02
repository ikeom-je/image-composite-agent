const { defineConfig } = require('vite')
const vue = require('@vitejs/plugin-vue')
const { fileURLToPath } = require('node:url')
const path = require('node:path')

// https://vitejs.dev/config/
module.exports = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  base: './',
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'axios']
        }
      }
    }
  }
})