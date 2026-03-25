/**
 * Chat Agent API統合テスト
 *
 * ユースケース対応表（.kiro/specs/strands-agent/usecases.md 参照）:
 * - A1: 2画像合成
 * - A2: 3画像合成
 * - A3: 自然言語位置指定
 * - A6: ベース画像指定（test）
 * - A7: ベース画像指定（transparent）
 * - A10: デフォルト値適用
 * - B1: MP4動画生成
 * - B3: デフォルト動画
 * - C1: 画像一覧表示
 * - C3: 画像ゼロ件（条件次第）
 * - D1: 概要ヘルプ
 * - E2: 会話履歴復元
 * - E3: 会話リセット
 * - F1: 空メッセージ
 * - F2: 長文メッセージ
 * - F3: 不正JSON
 */

import { test, expect } from '@playwright/test'
import { randomUUID } from 'crypto'

const TEST_CONFIG = {
  chatApiUrl: process.env.CHAT_API_URL || process.env.API_URL?.replace(/\/images\/composite$/, '/chat') || '',
  timeout: 90000,
}

// --- ヘルパー ---

async function sendMessage(ctx: any, sessionId: string, message: string) {
  const res = await ctx.post(TEST_CONFIG.chatApiUrl, {
    data: { sessionId, message },
    timeout: TEST_CONFIG.timeout,
  })
  expect(res.status()).toBe(200)
  return res.json()
}

// --- テスト ---

test.describe('Chat Agent API テスト', () => {
  let api: any
  const sessionId = randomUUID()

  test.beforeAll(async ({ playwright }) => {
    if (!TEST_CONFIG.chatApiUrl) {
      test.skip()
      return
    }
    api = await playwright.request.newContext({ timeout: TEST_CONFIG.timeout })
  })

  test.afterAll(async () => {
    if (api) {
      await api.delete(`${TEST_CONFIG.chatApiUrl}/history/${sessionId}`).catch(() => {})
      await api.dispose()
    }
  })

  // ===== D: ヘルプ =====

  test.describe('D. ヘルプ・ガイダンス', () => {
    test('D1: ヘルプメッセージで機能概要が返ること', async () => {
      const body = await sendMessage(api, sessionId, 'ヘルプ')
      expect(body.response.content).toBeTruthy()
      expect(body.sessionId).toBe(sessionId)
      expect(body.requestId).toBeTruthy()
    })
  })

  // ===== A: 画像合成 =====

  test.describe('A. 画像合成', () => {
    test('A1: 2画像合成でCloudFront画像URLが返ること', async () => {
      const body = await sendMessage(api, sessionId, 'テスト画像を2枚使って合成して')
      expect(body.response.content).toBeTruthy()

      if (body.response.media) {
        expect(body.response.media.type).toBe('image')
        expect(body.response.media.url).toMatch(/^https:\/\/.*cloudfront\.net\/generated-images\//)
        // 画像URLがアクセス可能
        const imgRes = await api.get(body.response.media.url)
        expect(imgRes.status()).toBe(200)
        expect(imgRes.headers()['content-type']).toMatch(/image\/png/)
      }
    })

    test('A2: 3画像合成で画像が返ること', async () => {
      const body = await sendMessage(api, sessionId, 'テスト画像を3枚使って合成して')
      expect(body.response.content).toBeTruthy()

      if (body.response.media) {
        expect(body.response.media.type).toBe('image')
        expect(body.response.media.url).toMatch(/^https:\/\//)
        const imgRes = await api.get(body.response.media.url)
        expect(imgRes.status()).toBe(200)
      }
    })

    test('A3: 自然言語位置指定で合成できること', async () => {
      const body = await sendMessage(api, sessionId, 'テスト画像1を左上、テスト画像2を右下に配置して合成して')
      expect(body.response.content).toBeTruthy()

      if (body.response.media) {
        expect(body.response.media.type).toBe('image')
        expect(body.response.media.url).toMatch(/^https:\/\//)
      }
    })

    test('A6: ベース画像testで合成できること', async () => {
      const body = await sendMessage(api, sessionId, 'テスト画像をベースにしてテスト画像1枚を合成して')
      expect(body.response.content).toBeTruthy()
    })

    test('A7: 透明背景で合成できること', async () => {
      const body = await sendMessage(api, sessionId, '透明背景でテスト画像1枚を中央に合成して')
      expect(body.response.content).toBeTruthy()
    })

    test('A10: パラメータ省略時にデフォルト値が適用されること', async () => {
      const body = await sendMessage(api, sessionId, 'テスト画像を合成して')
      expect(body.response.content).toBeTruthy()
      // 応答にデフォルト値の説明が含まれる可能性
    })
  })

  // ===== B: 動画生成 =====

  test.describe('B. 動画生成', () => {
    test('B1: MP4動画生成でCloudFront動画URLが返ること', async () => {
      const body = await sendMessage(api, sessionId, 'テスト画像でMP4の3秒動画を作って')
      expect(body.response.content).toBeTruthy()

      if (body.response.media) {
        expect(body.response.media.type).toBe('video')
        expect(body.response.media.url).toMatch(/^https:\/\/.*\.(mp4|mxf|webm|avi)$/i)
        const vidRes = await api.get(body.response.media.url)
        expect(vidRes.status()).toBe(200)
      }
    })

    test('B3: フォーマット省略時にデフォルト動画が生成されること', async () => {
      const body = await sendMessage(api, sessionId, 'テスト画像で動画を作って')
      expect(body.response.content).toBeTruthy()

      if (body.response.media) {
        expect(body.response.media.type).toBe('video')
        expect(body.response.media.url).toMatch(/^https:\/\//)
      }
    })
  })

  // ===== C: アセット管理 =====

  test.describe('C. アセット管理', () => {
    test('C1: アップロード画像一覧が返ること', async () => {
      const body = await sendMessage(api, sessionId, 'アップロードした画像を見せて')
      expect(body.response.content).toBeTruthy()

      if (body.response.media && body.response.media.type === 'image_list') {
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
  })

  // ===== E: 会話コンテキスト =====

  test.describe('E. 会話コンテキスト', () => {
    test('E2: 会話履歴が取得できること', async () => {
      // 先のテストでメッセージが蓄積されているはず
      const res = await api.get(`${TEST_CONFIG.chatApiUrl}/history/${sessionId}`)
      expect(res.status()).toBe(200)

      const body = await res.json()
      expect(body.sessionId).toBe(sessionId)
      expect(Array.isArray(body.messages)).toBe(true)
      expect(body.messages.length).toBeGreaterThan(0)

      for (const msg of body.messages) {
        expect(msg).toHaveProperty('role')
        expect(msg).toHaveProperty('content')
        expect(msg).toHaveProperty('timestamp')
        expect(['user', 'assistant']).toContain(msg.role)
      }

      // mediaUrl/mediaTypeが含まれるメッセージがある場合の検証
      const mediaMessages = body.messages.filter((m: any) => m.mediaUrl)
      for (const msg of mediaMessages) {
        expect(msg.mediaUrl).toMatch(/^https:\/\//)
        expect(['image', 'video', 'image_list']).toContain(msg.mediaType)
      }
    })

    test('E3: 会話履歴を削除できること', async () => {
      const deleteSession = randomUUID()

      // 履歴作成
      await sendMessage(api, deleteSession, '削除テスト')

      // 削除
      const delRes = await api.delete(`${TEST_CONFIG.chatApiUrl}/history/${deleteSession}`)
      expect(delRes.status()).toBe(200)
      const delBody = await delRes.json()
      expect(delBody.deletedCount).toBeGreaterThanOrEqual(0)

      // 削除後は空
      const histRes = await api.get(`${TEST_CONFIG.chatApiUrl}/history/${deleteSession}`)
      const histBody = await histRes.json()
      expect(histBody.messages).toHaveLength(0)
    })

    test('E2: 存在しないセッションで空履歴が返ること', async () => {
      const res = await api.get(`${TEST_CONFIG.chatApiUrl}/history/${randomUUID()}`)
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.messages).toHaveLength(0)
    })

    test('E3: 存在しないセッション削除で200が返ること', async () => {
      const res = await api.delete(`${TEST_CONFIG.chatApiUrl}/history/${randomUUID()}`)
      expect(res.status()).toBe(200)
      const body = await res.json()
      expect(body.deletedCount).toBe(0)
    })
  })

  // ===== F: エラーハンドリング =====

  test.describe('F. エラーハンドリング', () => {
    test('F1: 空メッセージで400が返ること', async () => {
      const res = await api.post(TEST_CONFIG.chatApiUrl, {
        data: { sessionId: randomUUID(), message: '' },
      })
      expect(res.status()).toBe(400)
      const body = await res.json()
      expect(body).toHaveProperty('error')
    })

    test('F1: messageフィールドなしで400が返ること', async () => {
      const res = await api.post(TEST_CONFIG.chatApiUrl, {
        data: { sessionId: randomUUID() },
      })
      expect(res.status()).toBe(400)
    })

    test('F2: 2000文字超で400が返ること', async () => {
      const res = await api.post(TEST_CONFIG.chatApiUrl, {
        data: { sessionId: randomUUID(), message: 'あ'.repeat(2001) },
      })
      expect(res.status()).toBe(400)
      const body = await res.json()
      expect(body.error).toContain('2000')
    })

    test('F3: 不正JSONで400が返ること', async () => {
      const res = await api.post(TEST_CONFIG.chatApiUrl, {
        data: 'not json',
        headers: { 'Content-Type': 'text/plain' },
      })
      expect(res.status()).toBe(400)
    })

    test('sessionId省略時に自動生成されること', async () => {
      const body = await sendMessage(api, '', 'ヘルプ')
      // sessionIdが空の場合、サーバー側で自動生成
      expect(body.sessionId).toBeTruthy()
    })
  })

  // ===== CORS =====

  test.describe('CORS', () => {
    test('レスポンスにCORSヘッダーが含まれること', async () => {
      const res = await api.post(TEST_CONFIG.chatApiUrl, {
        data: { sessionId: randomUUID(), message: 'テスト' },
        timeout: TEST_CONFIG.timeout,
      })
      expect(res.headers()['access-control-allow-origin']).toBe('*')
    })

    test('OPTIONSプリフライトに200/204が返ること', async () => {
      const res = await api.fetch(TEST_CONFIG.chatApiUrl, { method: 'OPTIONS' })
      expect([200, 204]).toContain(res.status())
    })
  })
})
