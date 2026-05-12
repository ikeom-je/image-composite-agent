import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { ChatMessage, CompositeCommand, ModelInfo } from '@/types/chat'

const SESSION_STORAGE_KEY = 'chat-session-id'
const MODEL_STORAGE_KEY = 'chat-selected-model'
const PENDING_TEST_RULE_STORAGE_KEY = 'chat-pending-test-rule'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const command = ref<CompositeCommand>(createDefaultCommand())
  const sessionId = ref<string>(
    localStorage.getItem(SESSION_STORAGE_KEY) || crypto.randomUUID()
  )
  const isProcessing = ref(false)
  const availableModels = ref<ModelInfo[]>([])
  const defaultModelId = ref<string>('')
  const selectedModelId = ref<string>(
    localStorage.getItem(MODEL_STORAGE_KEY) || ''
  )

  function loadPendingTestRule(): { name: string; prompt: string } | null {
    try {
      const raw = localStorage.getItem(PENDING_TEST_RULE_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if (typeof parsed?.name === 'string' && typeof parsed?.prompt === 'string') {
        return { name: parsed.name, prompt: parsed.prompt }
      }
      return null
    } catch {
      return null
    }
  }

  const pendingTestRule = ref<{ name: string; prompt: string } | null>(loadPendingTestRule())

  function setPendingTestRule(rule: { name: string; prompt: string }) {
    localStorage.setItem(PENDING_TEST_RULE_STORAGE_KEY, JSON.stringify(rule))
    pendingTestRule.value = rule
  }

  function refreshPendingTestRule() {
    pendingTestRule.value = loadPendingTestRule()
  }

  function clearPendingTestRule() {
    localStorage.removeItem(PENDING_TEST_RULE_STORAGE_KEY)
    pendingTestRule.value = null
  }

  const messageCount = computed(() => messages.value.length)

  // sessionIdをlocalStorageに永続化
  watch(sessionId, (newId) => {
    localStorage.setItem(SESSION_STORAGE_KEY, newId)
  }, { immediate: true })

  // selectedModelIdをlocalStorageに永続化
  watch(selectedModelId, (newId) => {
    if (newId) {
      localStorage.setItem(MODEL_STORAGE_KEY, newId)
    } else {
      localStorage.removeItem(MODEL_STORAGE_KEY)
    }
  })

  // 実効モデルID（選択値 → デフォルト値）
  const effectiveModelId = computed(() => selectedModelId.value || defaultModelId.value)

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
    // セッションリセット時はテスト送信中のドラフトも消す（AC 12.5）
    clearPendingTestRule()
  }

  function setModels(models: ModelInfo[], defaultId: string) {
    availableModels.value = models
    defaultModelId.value = defaultId
    // 保存済みの選択が有効なモデルか確認
    if (selectedModelId.value && !models.find(m => m.id === selectedModelId.value)) {
      selectedModelId.value = ''
    }
  }

  function selectModel(modelId: string) {
    selectedModelId.value = modelId
  }

  return {
    messages,
    command,
    sessionId,
    isProcessing,
    messageCount,
    availableModels,
    defaultModelId,
    selectedModelId,
    effectiveModelId,
    pendingTestRule,
    setPendingTestRule,
    refreshPendingTestRule,
    clearPendingTestRule,
    addMessage,
    addLoadingMessage,
    replaceMessage,
    resetCommand,
    clearMessages,
    newSession,
    setModels,
    selectModel,
  }
})
