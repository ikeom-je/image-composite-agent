import { test, expect } from '@playwright/test';

test.describe('フロントエンドアプリケーション', () => {
  // FRONTEND_URL 環境変数で対象を切り替え可能。
  // - ローカル: Vite dev サーバー (`cd frontend && npm run dev` → http://localhost:3000)
  // - staging/production: CloudFront URL を FRONTEND_URL に渡す
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

  test.beforeEach(async ({ page }) => {
    await page.goto(frontendUrl);
  });

  test('ページタイトルが正しく表示される', async ({ page }) => {
    // SPA 起動後に Vue が動的にタイトルを書き換える（"Image Compositor - <ページ名>"）
    await expect(page).toHaveTitle(/Image Compositor/);
  });
});