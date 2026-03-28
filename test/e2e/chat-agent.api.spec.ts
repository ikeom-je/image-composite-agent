/**
 * Strands Agent チャットAPIの統合テスト
 *
 * テスト対象:
 * - POST /chat: メッセージ送信・応答取得
 * - GET /chat/history/{sessionId}: 会話履歴取得
 * - DELETE /chat/history/{sessionId}: 会話履歴削除
 * - バリデーション: 空メッセージ、長文メッセージ、不正JSON
 * - CORS: プリフライトリクエスト
 */

import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'

// テスト設定
const TEST_CONFIG = {
  chatApiUrl: process.env.CHAT_API_URL || process.env.API_URL?.replace(/\/images\/composite$/, '/chat') || '',
  timeout: 90000,
  maxMessageLength: 2000,
}

test.describe('Chat Agent API テスト', () => {
  let apiContext: any
  const testSessionId = randomUUID()

  test.beforeAll(async ({ playwright }) => {
    if (!TEST_CONFIG.chatApiUrl) {
      test.skip()
      return
    }
    apiContext = await playwright.request.newContext({
      timeout: TEST_CONFIG.timeout,
    })
  })

  test.afterAll(async () => {
    if (apiContext) {
      // テストセッションをクリーンアップ
      try {
        await apiContext.delete(`${TEST_CONFIG.chatApiUrl}/history/${testSessionId}`)
      } catch (_) {
        // クリーンアップ失敗は無視
      }
      await apiContext.dispose()
    }
  })

  test.describe('POST /chat', () => {
    test('ヘルプメッセージに正常応答を返すこと', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: testSessionId,
          message: 'ヘルプ',
        },
        timeout: TEST_CONFIG.timeout,
      })

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body).toHaveProperty('sessionId', testSessionId)
      expect(body).toHaveProperty('response')
      expect(body.response).toHaveProperty('content')
      expect(body.response.content).toBeTruthy()
      expect(body).toHaveProperty('requestId')
    })

    test('画像合成の指示に応答を返すこと', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: testSessionId,
          message: 'テスト画像を2枚使って合成して',
        },
        timeout: TEST_CONFIG.timeout,
      })

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.response).toHaveProperty('content')
      expect(body.response.content).toBeTruthy()

      // 画像メディアが返される場合（S3保存+CloudFront URL）
      if (body.response.media) {
        expect(body.response.media.type).toBe('image')
        expect(body.response.media.url).toBeTruthy()
        expect(body.response.media.url).toMatch(/^https:\/\//)
      }
    })

    test('動画生成の指示でCloudFront URLを返すこと', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: testSessionId,
          message: 'テスト画像でMP4の3秒動画を作って',
        },
        timeout: TEST_CONFIG.timeout,
      })

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.response).toHaveProperty('content')
      expect(body.response.content).toBeTruthy()

      // 動画メディアが返される場合
      if (body.response.media) {
        expect(body.response.media.type).toBe('video')
        expect(body.response.media.url).toBeTruthy()
        expect(body.response.media.url).toMatch(/^https:\/\/.*\.(mp4|mxf|webm|avi)$/)
      }
    })

    test('アップロード画像一覧でサムネイル付きリストを返すこと', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: testSessionId,
          message: 'アップロードした画像を見せて',
        },
        timeout: TEST_CONFIG.timeout,
      })

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body.response).toHaveProperty('content')

      // 画像一覧メディアが返される場合
      if (body.response.media && body.response.media.type === 'image_list') {
        expect(body.response.media.images).toBeTruthy()
        expect(Array.isArray(body.response.media.images)).toBe(true)
        if (body.response.media.images.length > 0) {
          const img = body.response.media.images[0]
          expect(img).toHaveProperty('filename')
          expect(img).toHaveProperty('size_display')
          expect(img).toHaveProperty('thumbnail_url')
          expect(img.thumbnail_url).toMatch(/^https:\/\//)
        }
      }
    })

    test('空メッセージで400を返すこと', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: randomUUID(),
          message: '',
        },
      })

      expect(response.status()).toBe(400)
      const body = await response.json()
      expect(body).toHaveProperty('error')
      expect(body.error).toContain('message')
    })

    test('メッセージなしで400を返すこと', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: randomUUID(),
        },
      })

      expect(response.status()).toBe(400)
      const body = await response.json()
      expect(body).toHaveProperty('error')
    })

    test('2000文字超のメッセージで400を返すこと', async () => {
      const longMessage = 'あ'.repeat(2001)
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: randomUUID(),
          message: longMessage,
        },
      })

      expect(response.status()).toBe(400)
      const body = await response.json()
      expect(body.error).toContain('2000')
    })

    test('不正なJSONボディで400を返すこと', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: 'not json',
        headers: {
          'Content-Type': 'text/plain',
        },
      })

      expect(response.status()).toBe(400)
    })

    test('sessionIdを省略しても自動生成されること', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          message: 'ヘルプ',
        },
        timeout: TEST_CONFIG.timeout,
      })

      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.sessionId).toBeTruthy()
      // UUID形式の検証
      expect(body.sessionId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      )
    })

    test('レスポンスにCORSヘッダーが含まれること', async () => {
      const response = await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: randomUUID(),
          message: 'テスト',
        },
        timeout: TEST_CONFIG.timeout,
      })

      const headers = response.headers()
      expect(headers['access-control-allow-origin']).toBe('*')
    })
  })

  test.describe('GET /chat/history/{sessionId}', () => {
    test('会話履歴を取得できること', async () => {
      // まずメッセージを送って履歴を作成
      await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: testSessionId,
          message: '履歴テスト用のメッセージです',
        },
        timeout: TEST_CONFIG.timeout,
      })

      // 履歴を取得
      const response = await apiContext.get(
        `${TEST_CONFIG.chatApiUrl}/history/${testSessionId}`
      )

      expect(response.status()).toBe(200)

      const body = await response.json()
      expect(body).toHaveProperty('sessionId', testSessionId)
      expect(body).toHaveProperty('messages')
      expect(Array.isArray(body.messages)).toBe(true)
      expect(body.messages.length).toBeGreaterThan(0)

      // メッセージ形式の検証
      for (const msg of body.messages) {
        expect(msg).toHaveProperty('role')
        expect(msg).toHaveProperty('content')
        expect(msg).toHaveProperty('timestamp')
        expect(['user', 'assistant']).toContain(msg.role)
      }
    })

    test('存在しないセッションで空履歴を返すこと', async () => {
      const nonExistentSession = randomUUID()
      const response = await apiContext.get(
        `${TEST_CONFIG.chatApiUrl}/history/${nonExistentSession}`
      )

      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.messages).toHaveLength(0)
    })
  })

  test.describe('DELETE /chat/history/{sessionId}', () => {
    test('会話履歴を削除できること', async () => {
      const deleteSessionId = randomUUID()

      // メッセージを送信して履歴作成
      await apiContext.post(TEST_CONFIG.chatApiUrl, {
        data: {
          sessionId: deleteSessionId,
          message: '削除テスト用メッセージ',
        },
        timeout: TEST_CONFIG.timeout,
      })

      // 履歴を削除
      const deleteResponse = await apiContext.delete(
        `${TEST_CONFIG.chatApiUrl}/history/${deleteSessionId}`
      )

      expect(deleteResponse.status()).toBe(200)
      const deleteBody = await deleteResponse.json()
      expect(deleteBody).toHaveProperty('message')
      expect(deleteBody).toHaveProperty('deletedCount')
      expect(deleteBody.deletedCount).toBeGreaterThanOrEqual(0)

      // 削除後に履歴が空であることを確認
      const historyResponse = await apiContext.get(
        `${TEST_CONFIG.chatApiUrl}/history/${deleteSessionId}`
      )
      const historyBody = await historyResponse.json()
      expect(historyBody.messages).toHaveLength(0)
    })

    test('存在しないセッションの削除で200を返すこと', async () => {
      const response = await apiContext.delete(
        `${TEST_CONFIG.chatApiUrl}/history/${randomUUID()}`
      )

      expect(response.status()).toBe(200)
      const body = await response.json()
      expect(body.deletedCount).toBe(0)
    })
  })

  test.describe('OPTIONS (CORS プリフライト)', () => {
    test('OPTIONSリクエストに200または204を返すこと', async () => {
      const response = await apiContext.fetch(TEST_CONFIG.chatApiUrl, {
        method: 'OPTIONS',
      })

      expect([200, 204]).toContain(response.status())
    })
  })
})
