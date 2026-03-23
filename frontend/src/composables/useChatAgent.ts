import { useChatStore } from '@/stores/chat'
import { useConfigStore } from '@/stores/config'
import type { AssetImage } from '@/types/chat'
import axios from 'axios'

export function useChatAgent() {
  const chatStore = useChatStore()
  const configStore = useConfigStore()

  function showWelcome() {
    chatStore.addMessage({
      role: 'assistant',
      content:
        'こんにちは！画像合成アシスタントです。\n\n' +
        '自然言語で画像の合成や動画生成を指示できます。例えば：\n' +
        '- 「テスト画像を3枚使って合成して」\n' +
        '- 「画像1を左上、画像2を右下に配置して」\n' +
        '- 「アップロードした画像を見せて」\n' +
        '- 「MP4で5秒の動画を作って」\n\n' +
        '何でもお気軽にどうぞ！',
    })
  }

  async function handleUserInput(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    chatStore.addMessage({ role: 'user', content: trimmed })
    const loadingId = chatStore.addLoadingMessage()
    chatStore.isProcessing = true

    try {
      const endpoint = getChatApiEndpoint()
      const response = await axios.post(
        endpoint,
        {
          sessionId: chatStore.sessionId,
          message: trimmed,
        },
        {
          headers: { 'Content-Type': 'application/json' },
          timeout: 90000,
        }
      )

      const { content, media } = response.data.response

      let mediaUrl: string | undefined
      let mediaType: 'image' | 'video' | 'image_list' | undefined
      let imageList: AssetImage[] | undefined

      if (media) {
        mediaType = media.type
        if (media.type === 'image' && media.url) {
          mediaUrl = media.url
        } else if (media.type === 'image' && media.data) {
          mediaUrl = `data:image/png;base64,${media.data}`
        } else if (media.type === 'video' && media.url) {
          mediaUrl = media.url
        } else if (media.type === 'image_list' && media.images) {
          imageList = media.images
        }
      }

      chatStore.replaceMessage(loadingId, {
        content: content || '',
        mediaUrl,
        mediaType,
        imageList,
      })
    } catch (err: any) {
      let errMsg = 'エラーが発生しました'
      if (err.response?.data?.error) {
        errMsg = err.response.data.error
      } else if (err.response?.status) {
        errMsg = `APIエラー (${err.response.status}): ${err.response.statusText}`
      } else if (err.code === 'ECONNABORTED') {
        errMsg = '処理がタイムアウトしました。もう一度お試しください。'
      } else if (err.message) {
        errMsg = `エラー: ${err.message}`
      }
      chatStore.replaceMessage(loadingId, { content: errMsg })
    } finally {
      chatStore.isProcessing = false
    }
  }

  async function loadHistory() {
    try {
      const endpoint = getChatApiEndpoint()
      const response = await axios.get(
        `${endpoint}/history/${chatStore.sessionId}`,
        { timeout: 10000 }
      )

      const messages = response.data.messages || []
      if (messages.length > 0) {
        chatStore.clearMessages()
        for (const msg of messages) {
          chatStore.addMessage({
            role: msg.role,
            content: msg.content,
            mediaUrl: msg.mediaUrl,
            mediaType: msg.mediaType,
          })
        }
      }
    } catch (err) {
      // 履歴ロード失敗は静かに無視
      console.warn('Failed to load chat history:', err)
    }
  }

  async function clearHistory() {
    try {
      const endpoint = getChatApiEndpoint()
      await axios.delete(`${endpoint}/history/${chatStore.sessionId}`, {
        timeout: 10000,
      })
    } catch (err) {
      console.warn('Failed to delete chat history:', err)
    }
    chatStore.newSession()
    showWelcome()
  }

  function getChatApiEndpoint(): string {
    const chatUrl = configStore.chatApiUrl
    if (chatUrl) return chatUrl

    // フォールバック
    const apiUrl = configStore.apiUrl
    if (apiUrl) {
      const base = apiUrl.replace(/\/images\/composite$/, '')
      return `${base}/chat`
    }

    return `${window.location.origin}/api/chat`
  }

  return { showWelcome, handleUserInput, loadHistory, clearHistory }
}
