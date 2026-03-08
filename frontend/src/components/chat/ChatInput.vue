<template>
  <form @submit.prevent="send" class="flex items-center gap-2 p-3 border-t border-gray-200 bg-white">
    <input
      ref="inputRef"
      v-model="text"
      type="text"
      placeholder="メッセージを入力..."
      class="flex-1 px-4 py-2.5 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      :disabled="disabled"
    />
    <button
      type="submit"
      :disabled="!text.trim() || disabled"
      class="w-10 h-10 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
    >
      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    </button>
  </form>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ send: [text: string] }>()

const text = ref('')
const inputRef = ref<HTMLInputElement>()

function send() {
  const val = text.value.trim()
  if (!val) return
  emit('send', val)
  text.value = ''
}

onMounted(() => inputRef.value?.focus())
</script>
