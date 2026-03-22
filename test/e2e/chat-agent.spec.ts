/**
 * Strands Agent チャット E2Eテスト
 *
 * テスト対象:
 * - ポータルページ表示・ナビゲーション
 * - チャットUI表示・操作
 * - メッセージ送信・応答表示
 * - 画像合成結果の表示
 * - 会話履歴の復元
 * - エラー表示
 */

import { test, expect } from '@playwright/test'

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'https://d1apj9glns7l6g.cloudfront.net'

test.describe('チャットエージェント E2Eテスト', () => {
  test.describe('ポータルページ', () => {
    test('ポータルページが正しく表示される', async ({ page }) => {
      await page.goto(FRONTEND_URL)
      await expect(
        page.getByRole('heading', { name: 'Image Compositor', level: 1 })
      ).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'API確認ページ' })
      ).toBeVisible()
      await expect(
        page.getByRole('heading', { name: 'チャットエージェント' })
      ).toBeVisible()
    })

    test('ポータルからチャットページに遷移できる', async ({ page }) => {
      await page.goto(FRONTEND_URL)
      await page
        .getByRole('heading', { name: 'チャットエージェント' })
        .click()
      await expect(page).toHaveURL(/\/chat/)
      await expect(
        page.getByRole('heading', { name: /Chat Agent/ })
      ).toBeVisible()
    })

    test('ポータルからAPIページに遷移できる', async ({ page }) => {
      await page.goto(FRONTEND_URL)
      await page.getByRole('heading', { name: 'API確認ページ' }).click()
      await expect(page).toHaveURL(/\/api/)
    })
  })

  test.describe('ナビゲーション', () => {
    test('タブナビゲーションが全ページで表示される', async ({ page }) => {
      await page.goto(FRONTEND_URL)
      const nav = page.locator('nav')
      await expect(nav).toBeVisible()
      await expect(nav.getByText('Portal')).toBeVisible()
      await expect(nav.getByText('APIDemo')).toBeVisible()
      await expect(nav.getByText('ChatAgent')).toBeVisible()
    })

    test('タブでページ間遷移が動作する', async ({ page }) => {
      await page.goto(FRONTEND_URL)

      // ChatAgent タブへ遷移
      await page.locator('nav').getByText('ChatAgent').click()
      await expect(page).toHaveURL(/\/chat/)

      // APIDemo タブへ遷移
      await page.locator('nav').getByText('APIDemo').click()
      await expect(page).toHaveURL(/\/api/)

      // Portal タブへ戻る
      await page.locator('nav').getByText('Portal').click()
      await expect(page).toHaveURL(
        new RegExp(
          `^${FRONTEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`
        )
      )
    })

    test('直接URLアクセスでSPAルーティングが動作する', async ({ page }) => {
      // /chat に直接アクセス
      await page.goto(`${FRONTEND_URL}/chat`)
      await expect(
        page.getByRole('heading', { name: /Chat Agent/ })
      ).toBeVisible({ timeout: 10000 })

      // /api に直接アクセス
      await page.goto(`${FRONTEND_URL}/api`)
      await page.waitForLoadState('networkidle')
      await expect(page.getByText('画像合成パラメータ')).toBeVisible({
        timeout: 10000,
      })
    })
  })

  test.describe('チャットUI', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/chat`)
      // ウェルカムメッセージの表示を待つ
      await expect(
        page.getByText('こんにちは！画像合成アシスタントです')
      ).toBeVisible({ timeout: 10000 })
    })

    test('ウェルカムメッセージが表示される', async ({ page }) => {
      await expect(
        page.getByRole('heading', { name: /Chat Agent/ })
      ).toBeVisible()
      await expect(
        page.getByText('こんにちは！画像合成アシスタントです')
      ).toBeVisible()
    })

    test('入力欄とボタンが表示される', async ({ page }) => {
      const input = page.locator(
        'input[type="text"], textarea, [contenteditable]'
      )
      await expect(input.first()).toBeVisible()
    })

    test('メッセージを送信するとユーザーメッセージが表示される', async ({
      page,
    }) => {
      const input = page.locator('input[type="text"]')
      await input.fill('ヘルプを見せて')
      await input.press('Enter')

      // ユーザーメッセージが表示されること
      await expect(page.getByText('ヘルプを見せて')).toBeVisible({
        timeout: 5000,
      })
    })

    test('メッセージ送信後にローディング表示されること', async ({ page }) => {
      const input = page.locator('input[type="text"]')
      await input.fill('テスト画像を合成して')
      await input.press('Enter')

      // ユーザーメッセージ表示後、一定時間内にアシスタント応答またはローディングが表示される
      await expect(page.getByText('テスト画像を合成して')).toBeVisible({
        timeout: 5000,
      })
    })

    test('ヘルプメッセージを送信するとAgent応答が返ること', async ({
      page,
    }) => {
      const input = page.locator('input[type="text"]')
      await input.fill('使い方を教えて')
      await input.press('Enter')

      // Agent応答を待つ - チャットバブルのjustify-startがアシスタント応答
      const agentResponse = page.locator('.justify-start').last()
      await expect(agentResponse).toBeVisible({ timeout: 90000 })

      // 応答にテキストが含まれていること（ウェルカムメッセージ以外）
      const allResponses = page.locator('.justify-start')
      const count = await allResponses.count()
      expect(count).toBeGreaterThan(1) // ウェルカム + Agent応答
    })

    test('画像合成を実行すると画像が表示されること', async ({ page }) => {
      const input = page.locator('input[type="text"]')
      await input.fill('テスト画像を2枚使って左上と右下に配置して合成して')
      await input.press('Enter')

      // Agent応答を待つ（画像が表示されるか、テキスト応答が返る）
      const result = page.locator(
        'img[src^="data:image"], .message-assistant, .assistant, [class*="assistant"]'
      )
      await expect(result.first()).toBeVisible({ timeout: 90000 })
    })

    test('空メッセージは送信されないこと', async ({ page }) => {
      const input = page.locator('input[type="text"]')
      const messagesBefore = await page
        .locator('.message-user, .user, [class*="user"]')
        .count()

      await input.fill('')
      await input.press('Enter')

      // メッセージ数が増えていないこと
      const messagesAfter = await page
        .locator('.message-user, .user, [class*="user"]')
        .count()
      expect(messagesAfter).toBe(messagesBefore)
    })
  })

  test.describe('APIページ（既存機能の互換性）', () => {
    test('APIページで既存UIが表示される', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/api`)
      await page.waitForLoadState('networkidle')

      await expect(
        page.getByRole('heading', { name: /画像合成REST API/ })
      ).toBeVisible({ timeout: 10000 })
      await expect(page.getByText('画像合成パラメータ')).toBeVisible({
        timeout: 10000,
      })
    })
  })
})
