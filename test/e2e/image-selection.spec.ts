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

  // PR #91 regression: image2 セレクタで shape テスト画像（circle/rectangle/triangle）を
  // 選んで合成ボタンを押した時、composite API が 200 を返すこと。
  // config.json の s3BucketNames.testImages が欠落すると ImageSelector.vue が
  // 旧 fallback `s3://test-bucket/...` を組み立てて 404 になる回帰を検知する。
  test('image2 で shape テスト画像を選択して合成→ composite API は 200', async ({ page }) => {
    const modeButtons = page.locator('.mode-buttons button');
    await modeButtons.filter({ hasText: '2画像' }).click();
    await expect(modeButtons.filter({ hasText: '2画像' })).toHaveClass(/active/);

    const image2Select = page.locator('td.image2-cell select.form-select-compact');
    await expect(image2Select).toBeVisible();
    await image2Select.selectOption('triangle');
    // triangle 選択後、ImageSelector.vue は s3:// パスを emit し
    // selectedS3ImageDisplay computed が新たな option を追加するため、
    // select の HTML value は最終的に s3:// パス全文になる（実装仕様）。
    // 本テストの目的は「フロントが正しい s3:// パスを組み立てて合成 API が 200 を返す」
    // ことなので、select の内部値は検証せず、composite レスポンス URL の image2 パラメータで検証する。

    // baseURL は FRONTEND_URL のため、CloudFront ではなく API Gateway を直接叩く。
    // URL 一致は path のみで判定（環境別 API ホストに左右されない）。
    const compositePromise = page.waitForResponse(
      (resp) => resp.url().includes('/images/composite') && resp.request().method() === 'GET',
      { timeout: 20000 },
    );
    await page.locator('button.generate-button').click();
    const response = await compositePromise;

    expect(response.status()).toBe(200);
    const image2Param = new URL(response.url()).searchParams.get('image2') || '';
    expect(image2Param.startsWith('s3://')).toBe(true);
    expect(image2Param).toContain('triangle_green.png');
    // 旧 fallback `test-bucket` でないこと
    expect(image2Param).not.toContain('s3://test-bucket/');
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
