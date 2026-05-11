/**
 * Settings ルール管理UI E2Eテスト (issue #9)
 *
 * Acceptance Criteria 対応:
 * - AC 8.x: SettingsPage タブ切替（モデル / ルール）
 * - AC 9.x: ルール一覧UI（JAA表示・トグル・削除ボタン非表示）
 * - AC 10.x: ルール編集UI（保存・文字数超過・テスト送信）
 * - AC 11.x: System Prompt プレビュー
 * - AC 12.x: テスト送信機能（ドラフトバナー表示・解除）
 */

import { test, expect } from '@playwright/test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

test.describe('Settings ルール管理 UI', () => {
  test.beforeEach(async ({ page }) => {
    if (!FRONTEND_URL) test.skip()
    // 残存する localStorage ドラフトをクリーンアップ
    await page.goto(`${FRONTEND_URL}/`)
    await page.evaluate(() => localStorage.removeItem('__rule_draft__'))
    await page.goto(`${FRONTEND_URL}/chat/settings`)
  })

  test('AC 8.x / 9.x: タブ切替でルール一覧が表示され、JAAルールが含まれる', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await expect(page.getByRole('heading', { name: 'ルール一覧' })).toBeVisible()
    await expect(page.getByText('JAA字幕ハンドブック準拠 配置規定')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('デフォルト').first()).toBeVisible()
  })

  test('AC 10.x: 新規作成 → 保存 → 一覧に反映', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByText('JAA字幕ハンドブック準拠 配置規定').waitFor({ timeout: 10000 })

    await page.getByRole('button', { name: '+ 新規作成' }).click()
    const ruleName = `e2e-ui-${Date.now()}`
    await page.getByLabel('ルール名（最大100字）').fill(ruleName)
    await page.locator('textarea').first().fill('## E2Eテスト本文\n- 項目1')
    await page.getByRole('button', { name: '保存' }).click()
    await expect(page.getByText(ruleName)).toBeVisible({ timeout: 10000 })
  })

  test('AC 10.5: 文字数超過で保存ボタン無効化', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByRole('button', { name: '+ 新規作成' }).click()
    await page.getByLabel('ルール名（最大100字）').fill('oversize')
    await page.locator('textarea').first().fill('a'.repeat(10001))
    await expect(page.getByRole('button', { name: '保存' })).toBeDisabled()
    await expect(page.getByText('上限超過')).toBeVisible()
  })

  test('AC 11.x: System Prompt プレビューが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await expect(page.getByRole('heading', { name: /現在の System Prompt/ })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/ルール数:/)).toBeVisible()
  })

  test('AC 12.x: テスト送信ボタンで /chat へ遷移しドラフトバナーが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByRole('button', { name: '+ 新規作成' }).click()
    await page.getByLabel('ルール名（最大100字）').fill('draft-e2e')
    await page.locator('textarea').first().fill('テスト用ドラフト本文')
    await page.getByRole('button', { name: 'このドラフトでテスト送信' }).click()
    await expect(page).toHaveURL(/\/chat$/)
    await expect(page.getByText(/ドラフトルール「.*draft-e2e.*」適用中/)).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: '解除' }).click()
    await expect(page.getByText(/ドラフトルール/)).not.toBeVisible()
  })

  test('AC 9.4: デフォルトルールには削除ボタンが表示されない', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    const jaaCard = page.locator('div', { hasText: 'JAA字幕ハンドブック準拠 配置規定' }).first()
    await jaaCard.waitFor({ timeout: 10000 })
    await expect(jaaCard.getByRole('button', { name: '削除' })).toHaveCount(0)
  })
})
