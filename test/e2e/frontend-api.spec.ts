/**
 * API Demo ページ（/api）のE2Eテスト
 *
 * テスト対象:
 * - SPA マルチページ構成における API Demo ページの動作
 * - 主要UI要素の表示
 * - 画像合成API呼び出し
 * - エラーハンドリング
 * - ページ間ナビゲーション
 */
import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// 1×1透明PNG（モック合成結果として使用）
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

test.describe('API Demoページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/api`);
    await page.waitForLoadState('networkidle');
  });

  test('ページが正常に読み込まれる', async ({ page }) => {
    // App.vue のメイン見出し（emoji付き）
    const heading = page.locator('.app-container h1');
    await expect(heading).toBeVisible();
    await expect(heading).toContainText('画像合成REST API');
  });

  test('ナビゲーションタブが表示される', async ({ page }) => {
    // AppShell の router-link タブ
    await expect(page.locator('nav').getByText('Portal', { exact: true })).toBeVisible();
    await expect(page.locator('nav').getByText('APIDemo', { exact: true })).toBeVisible();
    await expect(page.locator('nav').getByText('ChatAgent', { exact: true })).toBeVisible();
  });

  test('主要UI要素が表示される', async ({ page }) => {
    // 設定テーブル
    await expect(page.locator('table.config-table').first()).toBeVisible();
    // モード切替ボタン群
    await expect(page.locator('.mode-buttons')).toBeVisible();
    // アップロードエリア
    await expect(page.locator('.upload-area')).toBeVisible();
    // 生成ボタン
    await expect(page.locator('button.generate-button')).toBeVisible();
  });

  test('生成ボタンのテキストがモードに応じて変わる', async ({ page }) => {
    const generateButton = page.locator('button.generate-button');

    // 初期は2画像モード
    await expect(generateButton).toContainText('2画像を合成');

    // 1画像モード
    await page.locator('.mode-buttons button').filter({ hasText: '1画像' }).click();
    await expect(generateButton).toContainText('1画像を合成');

    // 3画像モード
    await page.locator('.mode-buttons button').filter({ hasText: '3画像' }).click();
    await expect(generateButton).toContainText('3画像を合成');
  });

  test('生成ボタンクリックでAPIリクエストが送信される', async ({ page }) => {
    // 合成APIをモックして応答を返す
    await page.route('**/images/composite**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'),
      });
    });

    const requestPromise = page.waitForRequest(
      (req) => req.url().includes('/images/composite') && req.method() === 'POST'
    );

    await page.locator('button.generate-button').click();

    const request = await requestPromise;
    expect(request.method()).toBe('POST');
  });

  test('画像生成成功時にresult-imageが表示される（モック）', async ({ page }) => {
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

  test('APIエラー時にエラーメッセージが表示される（モック）', async ({ page }) => {
    await page.route('**/images/composite**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.locator('button.generate-button').click();

    // ResultDisplay の error-state
    const errorState = page.locator('.error-state');
    await expect(errorState).toBeVisible({ timeout: 15000 });
  });

  test('ChatAgent タブクリックで /chat に遷移する', async ({ page }) => {
    await page.locator('nav').getByText('ChatAgent', { exact: true }).click();
    await page.waitForURL('**/chat');
    expect(page.url()).toContain('/chat');
  });

  test('Portal タブクリックで / に遷移する', async ({ page }) => {
    await page.locator('nav').getByText('Portal', { exact: true }).click();
    await page.waitForURL((url) => url.pathname === '/');
    expect(new URL(page.url()).pathname).toBe('/');
  });
});
