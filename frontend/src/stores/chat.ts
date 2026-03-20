import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ChatMessage, CompositeCommand } from '@/types/chat'

const SESSION_STORAGE_KEY = 'chat-session-id'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const command = ref<CompositeCommand>(createDefaultCommand())
  const sessionId = ref<string>(
    localStorage.getItem(SESSION_STORAGE_KEY) || crypto.randomUUID()
  )
  const isProcessing = ref(false)

  const messageCount = computed(() => messages.value.length)

  // sessionIdをlocalStorageに永続化
  watch(sessionId, (newId) => {
    localStorage.setItem(SESSION_STORAGE_KEY, newId)
  }, { immediate: true })

  function createDefaultCommand(): CompositeCommand {
    return {
      baseImage: 'test',
      images: {
        image1: { source: 'test', x: 100, y: 100, width: 400, height: 400 },
        image2: { source: '', x: 600, y: 100, width: 400, height: 400 },
        image3: { source: '', x: 350, y: 400, width: 400, height: 400 },
      },
      imageMode: 1,
      format: 'png',
      videoEnabled: false,
      videoDuration: 3,
      videoFormat: 'MXF',
    }
  }

  function addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>) {
    messages.value.push({
      ...msg,
      id: crypto.randomUUID(),
      timestamp: new Date(),
    })
  }

  function addLoadingMessage(): string {
    const id = crypto.randomUUID()
    messages.value.push({
      id,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true,
    })
    return id
  }

  function replaceMessage(id: string, updates: Partial<ChatMessage>) {
    const idx = messages.value.findIndex(m => m.id === id)
    if (idx !== -1) {
      messages.value[idx] = { ...messages.value[idx], ...updates, isLoading: false }
    }
  }

  function resetCommand() {
    command.value = createDefaultCommand()
  }

  function clearMessages() {
    messages.value = []
  }

  function newSession() {
    sessionId.value = crypto.randomUUID()
    messages.value = []
  }

  return {
    messages,
    command,
    sessionId,
    isProcessing,
    messageCount,
    addMessage,
    addLoadingMessage,
    replaceMessage,
    resetCommand,
    clearMessages,
    newSession,
  }
})
