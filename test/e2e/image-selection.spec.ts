/**
 * 画像選択・モード切替のE2Eテスト
 *
 * 対象ページ: /api（API Demo）の ImageConfigTable コンポーネント
 * 現在のUI構造に存在するセレクタのみ使用する。
 */
import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

test.describe('画像選択・モード切替（/api ページ）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/api`);
    await page.waitForLoadState('networkidle');
  });

  test('画像設定テーブルが表示される', async ({ page }) => {
    // 画像選択テーブル / 位置・サイズ設定テーブル の2テーブル
    const tables = page.locator('table.config-table');
    await expect(tables.first()).toBeVisible();
    const count = await tables.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('合成モードボタンで1/2/3画像モードを切り替えられる', async ({ page }) => {
    const modeButtons = page.locator('.mode-buttons button');
    const generateButton = page.locator('button.generate-button');

    // 1画像モード
    await modeButtons.filter({ hasText: '1画像' }).click();
    await expect(modeButtons.filter({ hasText: '1画像' })).toHaveClass(/active/);
    await expect(generateButton).toContainText('1画像を合成');

    // 2画像モード
    await modeButtons.filter({ hasText: '2画像' }).click();
    await expect(modeButtons.filter({ hasText: '2画像' })).toHaveClass(/active/);
    await expect(generateButton).toContainText('2画像を合成');

    // 3画像モード
    await modeButtons.filter({ hasText: '3画像' }).click();
    await expect(modeButtons.filter({ hasText: '3画像' })).toHaveClass(/active/);
    await expect(generateButton).toContainText('3画像を合成');
  });

  test('数値入力フィールドが正しく動作する', async ({ page }) => {
    // 位置・サイズ設定テーブル内の number input
    const numberInputs = page.locator('table.config-table input[type="number"]');
    const count = await numberInputs.count();
    expect(count).toBeGreaterThan(0);

    // 最初のフィールド（画像1のX座標）に値を入力
    const firstInput = numberInputs.first();
    await firstInput.fill('250');
    await expect(firstInput).toHaveValue('250');
  });
});
