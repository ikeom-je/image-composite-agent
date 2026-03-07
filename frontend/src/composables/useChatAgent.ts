import { useChatStore } from '@/stores/chat'
import { useConfigStore } from '@/stores/config'
import axios from 'axios'

const HELP_TEXT = `**使い方**

**合成コマンド:**
- \`ベース画像: test\` または \`ベース画像: transparent\` - ベース画像を設定
- \`画像1: test, 位置(100,200), サイズ(400,300)\` - 画像1を設定
- \`画像2: test, 位置(600,100), サイズ(400,400)\` - 画像2を設定
- \`画像3: test, 位置(350,400), サイズ(400,300)\` - 画像3を設定

**実行:**
- \`実行\` / \`generate\` - 現在の設定で画像合成を実行
- \`動画生成\` / \`video\` - 動画生成モードで実行

**その他:**
- \`設定確認\` / \`status\` - 現在のパラメータを表示
- \`リセット\` / \`reset\` - パラメータを初期値に戻す
- \`ヘルプ\` / \`help\` - この使い方を表示

**画像ソース:** \`test\`（テスト画像）、S3 URL、HTTP URL`

export function useChatAgent() {
  const chatStore = useChatStore()
  const configStore = useConfigStore()

  function showWelcome() {
    chatStore.addMessage({
      role: 'assistant',
      content: 'こんにちは！画像合成アシスタントです。\n\n画像の合成や動画生成をお手伝いします。`ヘルプ` と入力すると使い方を確認できます。',
    })
  }

  async function handleUserInput(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    chatStore.addMessage({ role: 'user', content: trimmed })

    const lower = trimmed.toLowerCase()

    // ヘルプ
    if (/^(ヘルプ|help|使い方|\?)$/i.test(lower)) {
      chatStore.addMessage({ role: 'assistant', content: HELP_TEXT })
      return
    }

    // リセット
    if (/^(リセット|reset|クリア|clear)$/i.test(lower)) {
      chatStore.resetCommand()
      chatStore.addMessage({ role: 'assistant', content: 'パラメータをリセットしました。' })
      return
    }

    // 設定確認
    if (/^(設定確認|status|設定|パラメータ|params)$/i.test(lower)) {
      showStatus()
      return
    }

    // ベース画像設定
    const baseMatch = trimmed.match(/ベース画像[:：]\s*(test|transparent|.+)/i)
    if (baseMatch) {
      chatStore.command.baseImage = baseMatch[1].trim()
      chatStore.addMessage({
        role: 'assistant',
        content: `ベース画像を **${chatStore.command.baseImage}** に設定しました。`,
      })
      return
    }

    // 画像設定パターン: 画像N: source, 位置(x,y), サイズ(w,h)
    const imageMatch = trimmed.match(/画像([1-3])[:：]\s*(\S+)(?:[\s,、]+位置\((\d+)\s*,\s*(\d+)\))?(?:[\s,、]+サイズ\((\d+)\s*,\s*(\d+)\))?/i)
    if (imageMatch) {
      const num = parseInt(imageMatch[1])
      const key = `image${num}` as 'image1' | 'image2' | 'image3'
      const source = imageMatch[2]
      const x = imageMatch[3] ? parseInt(imageMatch[3]) : chatStore.command.images[key].x
      const y = imageMatch[4] ? parseInt(imageMatch[4]) : chatStore.command.images[key].y
      const w = imageMatch[5] ? parseInt(imageMatch[5]) : chatStore.command.images[key].width
      const h = imageMatch[6] ? parseInt(imageMatch[6]) : chatStore.command.images[key].height

      chatStore.command.images[key] = { source, x, y, width: w, height: h }
      chatStore.command.imageMode = Math.max(chatStore.command.imageMode, num)

      chatStore.addMessage({
        role: 'assistant',
        content: `画像${num}を設定しました: source=**${source}**, 位置(${x}, ${y}), サイズ(${w}x${h})`,
      })
      return
    }

    // 動画生成
    if (/^(動画生成|動画|video)$/i.test(lower)) {
      chatStore.command.videoEnabled = true
      await executeComposite()
      return
    }

    // 実行
    if (/^(実行|generate|合成|run|go)$/i.test(lower)) {
      chatStore.command.videoEnabled = false
      await executeComposite()
      return
    }

    // 認識できないコマンド
    chatStore.addMessage({
      role: 'assistant',
      content: 'コマンドを認識できませんでした。`ヘルプ` で使い方を確認してください。',
    })
  }

  function showStatus() {
    const cmd = chatStore.command
    const lines = [
      '**現在の設定:**',
      `- ベース画像: ${cmd.baseImage}`,
      `- 画像モード: ${cmd.imageMode}画像`,
    ]

    for (let i = 1; i <= cmd.imageMode; i++) {
      const key = `image${i}` as keyof typeof cmd.images
      const img = cmd.images[key]
      lines.push(`- 画像${i}: source=${img.source || '(未設定)'}, 位置(${img.x}, ${img.y}), サイズ(${img.width}x${img.height})`)
    }

    if (cmd.videoEnabled) {
      lines.push(`- 動画: ${cmd.videoDuration}秒 (${cmd.videoFormat})`)
    }

    chatStore.addMessage({ role: 'assistant', content: lines.join('\n') })
  }

  async function executeComposite() {
    const cmd = chatStore.command
    if (!cmd.images.image1.source) {
      chatStore.addMessage({
        role: 'assistant',
        content: '画像1が未設定です。`画像1: test, 位置(100,100), サイズ(400,400)` のように設定してください。',
      })
      return
    }

    const loadingId = chatStore.addLoadingMessage()

    try {
      const endpoint = getApiEndpoint()
      const params = buildPostParams(cmd)
      const response = await axios.post(endpoint, params, {
        responseType: 'blob',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'image/png, image/*',
        },
        timeout: cmd.videoEnabled ? 90000 : 30000,
      })

      if (response.data && response.data.size > 0) {
        const blobUrl = URL.createObjectURL(response.data)
        chatStore.replaceMessage(loadingId, {
          content: cmd.videoEnabled ? '動画を生成しました:' : '画像を合成しました:',
          mediaUrl: blobUrl,
          mediaType: cmd.videoEnabled ? 'video' : 'image',
        })
      } else {
        throw new Error('空のレスポンスを受信しました')
      }
    } catch (err: any) {
      const errMsg = err.response?.status
        ? `APIエラー (${err.response.status}): ${err.response.statusText}`
        : `エラー: ${err.message}`
      chatStore.replaceMessage(loadingId, { content: errMsg })
    }
  }

  function getApiEndpoint(): string {
    const rawApiUrl = configStore.apiUrl
    if (!rawApiUrl) throw new Error('API URLが設定されていません')

    if (rawApiUrl.startsWith('/')) {
      return window.location.origin + rawApiUrl
    } else if (rawApiUrl.startsWith('http')) {
      return rawApiUrl
    } else {
      return `${window.location.protocol}//${rawApiUrl}`
    }
  }

  function buildPostParams(cmd: typeof chatStore.command): Record<string, string | number> {
    const p: Record<string, string | number> = {
      baseImage: cmd.baseImage,
      format: 'png',
      image1: cmd.images.image1.source,
      image1X: cmd.images.image1.x,
      image1Y: cmd.images.image1.y,
      image1Width: cmd.images.image1.width,
      image1Height: cmd.images.image1.height,
    }

    if (cmd.imageMode >= 2 && cmd.images.image2.source) {
      const img2 = cmd.images.image2
      p.image2 = img2.source
      p.image2X = img2.x
      p.image2Y = img2.y
      p.image2Width = img2.width
      p.image2Height = img2.height
    }

    if (cmd.imageMode >= 3 && cmd.images.image3.source) {
      const img3 = cmd.images.image3
      p.image3 = img3.source
      p.image3X = img3.x
      p.image3Y = img3.y
      p.image3Width = img3.width
      p.image3Height = img3.height
    }

    if (cmd.videoEnabled) {
      p.generate_video = 'true'
      p.video_duration = cmd.videoDuration
      p.video_format = cmd.videoFormat
    }

    return p
  }

  return { showWelcome, handleUserInput }
}
