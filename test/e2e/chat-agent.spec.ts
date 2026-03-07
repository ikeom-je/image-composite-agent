import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://d1apj9glns7l6g.cloudfront.net';

test.describe('チャットエージェント E2Eテスト', () => {

  test.describe('ポータルページ', () => {
    test('ポータルページが正しく表示される', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await expect(page.getByRole('heading', { name: 'Image Compositor' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'API確認ページ' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'チャットエージェント' })).toBeVisible();
    });

    test('ポータルからチャットページに遷移できる', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await page.getByRole('heading', { name: 'チャットエージェント' }).click();
      await expect(page).toHaveURL(/\/chat/);
      await expect(page.getByRole('heading', { name: /Chat Agent/ })).toBeVisible();
    });

    test('ポータルからAPIページに遷移できる', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      await page.getByRole('heading', { name: 'API確認ページ' }).click();
      await expect(page).toHaveURL(/\/api/);
    });
  });

  test.describe('ナビゲーション', () => {
    test('ナビゲーションバーが全ページで表示される', async ({ page }) => {
      await page.goto(FRONTEND_URL);
      const nav = page.locator('nav');
      await expect(nav).toBeVisible();
      await expect(nav.getByText('Portal')).toBeVisible();
      await expect(nav.getByText('API')).toBeVisible();
      await expect(nav.getByText('Chat')).toBeVisible();
    });

    test('ナビゲーションでページ間遷移が動作する', async ({ page }) => {
      await page.goto(FRONTEND_URL);

      // Chat へ遷移
      await page.locator('nav').getByText('Chat').click();
      await expect(page).toHaveURL(/\/chat/);

      // API へ遷移
      await page.locator('nav').getByText('API').click();
      await expect(page).toHaveURL(/\/api/);

      // Portal へ戻る
      await page.locator('nav').getByText('Portal').click();
      await expect(page).toHaveURL(new RegExp(`^${FRONTEND_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/?$`));
    });

    test('直接URLアクセスでSPAルーティングが動作する', async ({ page }) => {
      // /chat に直接アクセス
      await page.goto(`${FRONTEND_URL}/chat`);
      await expect(page.getByRole('heading', { name: /Chat Agent/ })).toBeVisible({ timeout: 10000 });

      // /api に直接アクセス
      await page.goto(`${FRONTEND_URL}/api`);
      await page.waitForLoadState('networkidle');
      await expect(page.getByText('画像合成パラメータ')).toBeVisible({ timeout: 10000 });
    });
  });

  test.describe('チャット機能', () => {
    test.beforeEach(async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/chat`);
      // ウェルカムメッセージの表示を待つ
      await expect(page.getByText('こんにちは！画像合成アシスタントです')).toBeVisible({ timeout: 10000 });
    });

    test('ウェルカムメッセージが表示される', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Chat Agent/ })).toBeVisible();
    });

    test('ヘルプコマンドが動作する', async ({ page }) => {
      const input = page.locator('input[type="text"]');
      await input.fill('ヘルプ');
      await input.press('Enter');

      await expect(page.getByText('使い方', { exact: true })).toBeVisible({ timeout: 5000 });
    });

    test('設定確認コマンドが動作する', async ({ page }) => {
      const input = page.locator('input[type="text"]');
      await input.fill('設定確認');
      await input.press('Enter');

      await expect(page.getByText('現在の設定:')).toBeVisible({ timeout: 5000 });
    });

    test('画像パラメータ設定コマンドが動作する', async ({ page }) => {
      const input = page.locator('input[type="text"]');
      await input.fill('画像1: test, 位置(200,300), サイズ(500,400)');
      await input.press('Enter');

      await expect(page.getByText('画像1を設定しました')).toBeVisible({ timeout: 5000 });
    });

    test('リセットコマンドが動作する', async ({ page }) => {
      const input = page.locator('input[type="text"]');
      await input.fill('リセット');
      await input.press('Enter');

      await expect(page.getByText('リセットしました')).toBeVisible({ timeout: 5000 });
    });

    test('認識できないコマンドでエラーメッセージが表示される', async ({ page }) => {
      const input = page.locator('input[type="text"]');
      await input.fill('あいうえお');
      await input.press('Enter');

      await expect(page.getByText('認識できませんでした')).toBeVisible({ timeout: 5000 });
    });

    test('画像合成を実行してAPIが呼ばれる', async ({ page }) => {
      const input = page.locator('input[type="text"]');

      // 画像1を設定
      await input.fill('画像1: test, 位置(100,100), サイズ(400,400)');
      await input.press('Enter');
      await expect(page.getByText('画像1を設定しました')).toBeVisible({ timeout: 5000 });

      // 実行
      await input.fill('実行');
      await input.press('Enter');

      // API呼び出し結果を待つ（成功 or エラー）
      const result = page.getByText(/画像を合成しました|APIエラー|エラー/);
      await expect(result).toBeVisible({ timeout: 60000 });
    });
  });

  test.describe('APIページ（既存機能の互換性）', () => {
    test('APIページで既存UIが表示される', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/api`);
      await page.waitForLoadState('networkidle');

      // App.vueのコンテンツが表示される
      await expect(page.getByRole('heading', { name: /画像合成REST API/ })).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('画像合成パラメータ')).toBeVisible({ timeout: 10000 });
    });
  });
});
