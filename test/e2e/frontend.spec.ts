import { test, expect } from '@playwright/test';

test.describe('フロントエンドアプリケーション', () => {
  const frontendUrl = 'http://localhost:5173';

  test.beforeEach(async ({ page }) => {
    await page.goto(frontendUrl);
  });

  test('ページタイトルが正しく表示される', async ({ page }) => {
    await expect(page).toHaveTitle(/画像合成REST API/);
  });
});