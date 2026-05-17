/**
 * Settings ルール管理UI E2Eテスト (issue #9)
 *
 * Acceptance Criteria 対応:
 * - AC 8.x: SettingsPage タブ切替（モデル / ルール）
 * - AC 9.x: ルール一覧UI（プリセットルール表示・トグル・削除ボタン非表示）
 * - AC 10.x: ルール編集UI（保存・文字数超過・保存せずに試す）
 * - AC 11.x: System Prompt プレビュー
 * - AC 12.x: 保存前のテスト送信機能（PendingTestRule バナー表示・解除）
 */

import { test, expect } from '@playwright/test'

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

const PRESET_RULE_NAME = '業界標準 字幕・テロップ配置規定'

test.describe('Settings ルール管理 UI', () => {
  test.beforeEach(async ({ page }) => {
    if (!FRONTEND_URL) test.skip()
    // 残存する localStorage の pending test rule をクリーンアップ
    await page.goto(`${FRONTEND_URL}/`)
    await page.evaluate(() => localStorage.removeItem('chat-pending-test-rule'))
    await page.goto(`${FRONTEND_URL}/chat/settings`)
  })

  test('AC 8.x / 9.x: タブ切替でルール一覧が表示され、プリセットルールが含まれる', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await expect(page.getByRole('heading', { name: 'ルール一覧' })).toBeVisible()
    await expect(page.getByText(PRESET_RULE_NAME)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('デフォルト').first()).toBeVisible()
  })

  test('AC 10.x: 新規作成 → 保存 → 一覧に反映', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByText(PRESET_RULE_NAME).first().waitFor({ timeout: 10000 })

    await page.getByRole('button', { name: '+ 新規作成' }).click()
    const ruleName = `e2e-ui-${Date.now()}`
    await page.getByLabel('ルール名（最大100字）').fill(ruleName)
    await page.locator('textarea').first().fill('## E2Eテスト本文\n- 項目1')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText(ruleName)).toBeVisible({ timeout: 10000 })
  })

  test('AC 10.5: 文字数超過で保存ボタン無効化', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByRole('button', { name: '+ 新規作成' }).click()
    await page.getByLabel('ルール名（最大100字）').fill('oversize')
    await page.locator('textarea').first().fill('a'.repeat(10001))
    await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
    await expect(page.getByText('上限超過')).toBeVisible()
  })

  test('AC 11.x: System Prompt プレビューが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await expect(page.getByRole('heading', { name: /現在の System Prompt/ })).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(/ルール数:/)).toBeVisible()
  })

  test('AC 12.x: 保存せずに試すボタンで /chat へ遷移しテスト中ルールバナーが表示される', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByRole('button', { name: '+ 新規作成' }).click()
    await page.getByLabel('ルール名（最大100字）').fill('pending-e2e')
    await page.locator('textarea').first().fill('テスト用ペンディング本文')
    await page.getByRole('button', { name: '保存せずに試す' }).click()
    await expect(page).toHaveURL(/\/chat$/)
    await expect(page.getByText(/テスト中ルール「.*pending-e2e.*」適用中/)).toBeVisible({ timeout: 5000 })
    await page.getByRole('button', { name: '解除' }).click()
    await expect(page.getByText(/テスト中ルール/)).not.toBeVisible()
  })

  test('AC 9.4: デフォルトルールには削除ボタンが表示されない', async ({ page }) => {
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    // RuleListItem.vue は <div class="rounded-lg border p-4 ..."> を card root として描画する。
    // 単に `div hasText` だと外側リストコンテナ全体にヒットし、他カードの削除ボタンが
    // 残量に含まれて E2E rule 蓄積時に偽 fail を起こすため card 単位に narrowing する。
    const presetCard = page.locator('div.rounded-lg', { hasText: PRESET_RULE_NAME }).first()
    await presetCard.waitFor({ timeout: 10000 })
    await expect(presetCard.getByRole('button', { name: '削除' })).toHaveCount(0)
  })
})

// PR #81 動作レビューで判明した課題に対応する追加テスト:
// Chat 画面から /chat/settings への遷移ボタンが UI 上に存在しないため、
// 設定画面への到達手段が URL 直打ちのみだった。本テストでは ChatPage に
// 追加した歯車ボタンを経由した正規ルートでの「画面遷移 + 設定反映」を検証する。
test.describe('Chat ↔ Settings 画面遷移と設定反映', () => {
  test.beforeEach(async ({ page }) => {
    if (!FRONTEND_URL) test.skip()
    await page.goto(`${FRONTEND_URL}/`)
    await page.evaluate(() => localStorage.removeItem('chat-pending-test-rule'))
  })

  test('/chat の設定ボタン押下で /chat/settings に遷移する', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/chat`)
    await expect(page).toHaveURL(/\/chat$/)

    const settingsLink = page.getByRole('link', { name: 'Agent設定' })
    await expect(settingsLink).toBeVisible()
    await settingsLink.click()

    await expect(page).toHaveURL(/\/chat\/settings$/)
    await expect(page.getByRole('heading', { name: 'Agent 設定' })).toBeVisible()
  })

  test('Chat→Settings→ルール作成→戻る→再度Settingsで保存内容が反映される', async ({ page }) => {
    // 1) /chat から設定ボタンで遷移
    await page.goto(`${FRONTEND_URL}/chat`)
    await page.getByRole('link', { name: 'Agent設定' }).click()
    await expect(page).toHaveURL(/\/chat\/settings$/)

    // 2) ルールタブ → 新規作成 → 保存
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await page.getByText(PRESET_RULE_NAME).first().waitFor({ timeout: 10000 })
    await page.getByRole('button', { name: '+ 新規作成' }).click()
    const ruleName = `e2e-nav-${Date.now()}`
    await page.getByLabel('ルール名（最大100字）').fill(ruleName)
    await page.locator('textarea').first().fill('## ナビゲーションE2E本文\n- 項目1')
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByText(ruleName)).toBeVisible({ timeout: 10000 })

    // 3) SettingsPage の戻る矢印で /chat に戻る
    await page.locator('a[href="/chat"]').first().click()
    await expect(page).toHaveURL(/\/chat$/)

    // 4) 再度 /chat の設定ボタンで /chat/settings に戻り、ルールタブで保存内容が残ること
    await page.getByRole('link', { name: 'Agent設定' }).click()
    await expect(page).toHaveURL(/\/chat\/settings$/)
    await page.getByRole('button', { name: 'ルール（System Prompt）' }).click()
    await expect(page.getByText(ruleName)).toBeVisible({ timeout: 10000 })
  })
})
