/**
 * /api ページの統合ワークフローE2Eテスト
 *
 * モックを使った基本的なフローのみをテストする。
 * 完全な実際のAPI連携はAPIテスト側でカバーする。
 */
import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test.describe('API Demo ページ統合ワークフロー', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/api`);
    await page.waitForLoadState('networkidle');
  });

  test('ページ読み込みが10秒以内に完了する', async ({ page }) => {
    const startTime = Date.now();
    await page.goto(`${FRONTEND_URL}/api`);
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    expect(loadTime).toBeLessThan(10000);
  });

  test('APIモックを使った画像合成フロー', async ({ page }) => {
    await page.route('**/images/composite**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
      });
    });

    await page.locator('button.generate-button').click();

    const resultImage = page.locator('img.result-image');
    await expect(resultImage).toBeVisible({ timeout: 15000 });
  });

  test('APIエラー時にエラー表示フローが動作する', async ({ page }) => {
    await page.route('**/images/composite**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.locator('button.generate-button').click();

    const errorState = page.locator('.error-state');
    await expect(errorState).toBeVisible({ timeout: 15000 });
  });

  test('使用例カードをクリックするとパラメータが設定される', async ({ page }) => {
    const exampleCards = page.locator('.example-card');
    const count = await exampleCards.count();
    expect(count).toBeGreaterThan(0);

    // 最初のカードをクリック
    await exampleCards.first().click();

    // 生成ボタンが有効状態（disabled でない）であることを確認
    const generateButton = page.locator('button.generate-button');
    await expect(generateButton).toBeEnabled();
  });
});
