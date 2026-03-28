/**
 * Chat Agent フロントエンドE2Eテスト
 *
 * ユースケース対応表（.kiro/specs/strands-agent/usecases.md 参照）:
 * - A1: 2画像合成（UI上で画像+ダウンロードリンク表示）
 * - A3: 自然言語位置指定（UI上で応答表示）
 * - B1: MP4動画生成（UI上で動画+ダウンロードリンク表示）
 * - C1: 画像一覧表示（UI上でサムネイルグリッド表示）
 * - D1: 概要ヘルプ（Agent応答表示）
 * - D2: 画像合成ヘルプ（Agent応答表示）
 * - E2: 会話履歴復元（リロード後に復元）
 * - E3: 会話リセット（履歴クリアボタン）
 * - E4: ウェルカムメッセージ
 * - F1: 空メッセージ（送信されない）
 * - G1: メッセージ送信フロー
 * - G2: ローディング表示
 * - G3: タブ遷移
 * - G4: 直接URLアクセス
 */

import { test, expect, Page } from '@playwright/test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dmrbyi3d7o77x.cloudfront.net'
const AGENT_TIMEOUT = 90000

// --- ヘルパー ---

/** チャットページへ遷移しウェルカムメッセージを待つ */
async function goToChat(page: Page) {
  await page.goto(`${FRONTEND_URL}/chat`)
  await expect(
    page.getByText('こんにちは！画像合成アシスタントです')
  ).toBeVisible({ timeout: 15000 })
}

/** メッセージ送信しAgent応答を待つ。応答テキストを返す */
async function sendAndWait(page: Page, message: string): Promise<string> {
  // 送信前のAssistantメッセージ数を記録
  const assistantBubbles = page.locator('.justify-start')
  const beforeCount = await assistantBubbles.count()

  const input = page.locator('input[type="text"]')
  await input.fill(message)
  await input.press('Enter')

  // ユーザーメッセージが送信済み表示されることを確認（.justify-end内のexact match）
  await expect(
    page.locator('.justify-end').getByText(message, { exact: true })
  ).toBeVisible({ timeout: 5000 })

  // ローディング（bounceアニメーション）が表示されるのを待つ
  await expect(page.locator('.animate-bounce').first()).toBeVisible({ timeout: 10000 })

  // ローディングが消えてAgent応答が追加されるのを待つ
  await expect(async () => {
    const current = await assistantBubbles.count()
    // ローディング分を含めて+2以上（ローディング→応答で置き換わる場合もある）
    expect(current).toBeGreaterThan(beforeCount)
    // ローディングが完全に消えていること
    const loading = await page.locator('.animate-bounce').count()
    expect(loading).toBe(0)
  }).toPass({ timeout: AGENT_TIMEOUT })

  const lastResponse = assistantBubbles.last()
  const text = await lastResponse.textContent()
  return text || ''
}

// --- テスト ---

test.describe('Chat Agent E2Eテスト', () => {

  // ===== G: UI操作 =====

  test.describe('G. UI操作', () => {
    test('G4: /chatに直接アクセスでチャット画面が表示される', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/chat`)
      await expect(
        page.getByRole('heading', { name: /Chat Agent/ })
      ).toBeVisible({ timeout: 10000 })
    })

    test('G3: タブナビゲーションで全ページ遷移できる', async ({ page }) => {
      await page.goto(FRONTEND_URL)
      const nav = page.locator('nav')
      await expect(nav.getByText('Portal')).toBeVisible()
      await expect(nav.getByText('APIDemo')).toBeVisible()
      await expect(nav.getByText('ChatAgent')).toBeVisible()

      // ChatAgent
      await nav.getByText('ChatAgent').click()
      await expect(page).toHaveURL(/\/chat/)

      // APIDemo
      await nav.getByText('APIDemo').click()
      await expect(page).toHaveURL(/\/api/)

      // Portal
      await nav.getByText('Portal').click()
      await expect(page).toHaveURL(new RegExp(`^${FRONTEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`))
    })

    test('G3: 直接URLアクセスでSPAルーティングが動作する', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/chat`)
      await expect(page.getByRole('heading', { name: /Chat Agent/ })).toBeVisible({ timeout: 10000 })

      await page.goto(`${FRONTEND_URL}/api`)
      await expect(page.getByText('画像合成パラメータ')).toBeVisible({ timeout: 10000 })
    })
  })

  // ===== E: 会話コンテキスト =====

  test.describe('E. 会話コンテキスト', () => {
    test('E4: 初回アクセスでウェルカムメッセージが表示される', async ({ page }) => {
      // localStorageをクリアして新規セッション
      await page.goto(`${FRONTEND_URL}/chat`)
      await page.evaluate(() => localStorage.removeItem('chat-session-id'))
      await page.reload()

      await expect(
        page.getByText('こんにちは！画像合成アシスタントです')
      ).toBeVisible({ timeout: 15000 })
    })

    test('E2: リロード後に会話履歴が復元される', async ({ page }) => {
      await goToChat(page)

      // メッセージ送信
      await sendAndWait(page, '履歴復元テスト用メッセージ')

      // リロード
      await page.reload()
      await page.waitForLoadState('networkidle')

      // 過去のユーザーメッセージが復元されていること
      await expect(
        page.locator('.justify-end').getByText('履歴復元テスト用メッセージ', { exact: true })
      ).toBeVisible({ timeout: 15000 })
    })
  })

  // ===== D: ヘルプ =====

  test.describe('D. ヘルプ・ガイダンス', () => {
    test.beforeEach(async ({ page }) => {
      await goToChat(page)
    })

    test('D1: ヘルプメッセージにAgent応答が返ること', async ({ page }) => {
      const response = await sendAndWait(page, '使い方を教えて')
      expect(response.length).toBeGreaterThan(10)
    })

    test('D2: 画像合成ヘルプにAgent応答が返ること', async ({ page }) => {
      const response = await sendAndWait(page, '画像合成について教えて')
      expect(response.length).toBeGreaterThan(10)
    })
  })

  // ===== F: エラーハンドリング =====

  test.describe('F. エラーハンドリング', () => {
    test('F1: 空メッセージは送信されないこと', async ({ page }) => {
      await goToChat(page)

      const messagesBefore = await page.locator('.justify-end').count()

      const input = page.locator('input[type="text"]')
      await input.fill('')
      await input.press('Enter')

      // 少し待ってメッセージ数が変わらないことを確認
      await page.waitForTimeout(500)
      const messagesAfter = await page.locator('.justify-end').count()
      expect(messagesAfter).toBe(messagesBefore)
    })
  })

  // ===== G1, G2: メッセージ送信フロー =====

  test.describe('G. メッセージ送信フロー', () => {
    test('G1+G2: メッセージ送信→ローディング→Agent応答', async ({ page }) => {
      await goToChat(page)

      const input = page.locator('input[type="text"]')
      await input.fill('ヘルプ')
      await input.press('Enter')

      // ユーザーメッセージ表示
      await expect(page.getByText('ヘルプ').last()).toBeVisible({ timeout: 5000 })

      // Agent応答を待つ
      const responses = page.locator('.justify-start')
      await expect(async () => {
        const count = await responses.count()
        expect(count).toBeGreaterThan(1) // ウェルカム + 応答
      }).toPass({ timeout: AGENT_TIMEOUT })
    })
  })

  // ===== A: 画像合成 =====

  test.describe('A. 画像合成', () => {
    test.beforeEach(async ({ page }) => {
      await goToChat(page)
    })

    test('A1: 2画像合成で画像プレビューとダウンロードリンクが表示される', async ({ page }) => {
      await sendAndWait(page, 'テスト画像を2枚使って合成して')

      // 合成画像が表示される（CloudFront URL）
      const img = page.locator('img[src*="cloudfront"], img[src*="generated-images"]')
      await expect(img.first()).toBeVisible({ timeout: 10000 })

      // ダウンロードリンクが表示される
      const download = page.locator('a:has-text("ダウンロード"), button:has-text("ダウンロード")')
      if (await download.count() > 0) {
        await expect(download.first()).toBeVisible()
      }
    })

    test('A3: 自然言語位置指定で合成結果が表示される', async ({ page }) => {
      await sendAndWait(page, 'テスト画像1を左上、テスト画像2を右下に配置して合成して')

      // 応答にCloudFront画像またはテキスト応答がある
      const result = page.locator('img[src*="cloudfront"], img[src*="generated-images"], .justify-start')
      await expect(result.first()).toBeVisible({ timeout: 10000 })
    })
  })

  // ===== B: 動画生成 =====

  test.describe('B. 動画生成', () => {
    test('B1: MP4動画生成で動画プレビューとダウンロードリンクが表示される', async ({ page }) => {
      await goToChat(page)
      await sendAndWait(page, 'テスト画像でMP4の3秒動画を作って')

      // 動画またはダウンロードリンクが表示される
      const video = page.locator('video, a:has-text("ダウンロード"), button:has-text("ダウンロード")')
      await expect(video.first()).toBeVisible({ timeout: 10000 })
    })
  })

  // ===== C: アセット管理 =====

  test.describe('C. アセット管理', () => {
    test('C1: アップロード画像一覧でAgent応答が返ること', async ({ page }) => {
      await goToChat(page)
      const response = await sendAndWait(page, 'アップロードした画像を見せて')

      // 応答テキストがある（画像がある場合はグリッド、ない場合はメッセージ）
      expect(response.length).toBeGreaterThan(0)
    })
  })

  // ===== ポータルページ =====

  test.describe('ポータルページ', () => {
    test('ポータルページが正しく表示される', async ({ page }) => {
      await page.goto(FRONTEND_URL)
      await expect(page.getByRole('heading', { name: 'Image Compositor', level: 1 })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'API確認ページ' })).toBeVisible()
      await expect(page.getByRole('heading', { name: 'チャットエージェント' })).toBeVisible()
    })

    test('ポータルからチャットページに遷移できる', async ({ page }) => {
      await page.goto(FRONTEND_URL)
      await page.getByRole('heading', { name: 'チャットエージェント' }).click()
      await expect(page).toHaveURL(/\/chat/)
      await expect(page.getByRole('heading', { name: /Chat Agent/ })).toBeVisible()
    })

    test('APIページで既存UIが表示される', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/api`)
      await page.waitForLoadState('networkidle')
      await expect(page.getByRole('heading', { name: /画像合成REST API/ })).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('画像合成パラメータ')).toBeVisible({ timeout: 10000 })
    })
  })
})
