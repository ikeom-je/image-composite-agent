import { test, expect } from '@playwright/test';

test.describe('フロントエンドアプリケーション', () => {
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8080';

  test.beforeEach(async ({ page }) => {
    await page.goto(frontendUrl);
  });

  test('ページタイトルとヘッダーが正しく表示される', async ({ page }) => {
    await expect(page).toHaveTitle(/画像合成REST API/);
    await expect(page.locator('h1')).toContainText('画像合成REST API');
  });

  test('フォームの入力要素が正しく表示される', async ({ page }) => {
    // ベース画像選択
    await expect(page.locator('select[v-model="params.baseImage"]')).toBeVisible();
    
    // 画像1の設定
    await expect(page.locator('select[v-model="params.image1"]')).toBeVisible();
    await expect(page.locator('input[v-model="params.image1X"]')).toBeVisible();
    await expect(page.locator('input[v-model="params.image1Y"]')).toBeVisible();
    await expect(page.locator('input[v-model="params.image1Width"]')).toBeVisible();
    await expect(page.locator('input[v-model="params.image1Height"]')).toBeVisible();
    
    // 画像2の設定
    await expect(page.locator('select[v-model="params.image2"]')).toBeVisible();
    await expect(page.locator('input[v-model="params.image2X"]')).toBeVisible();
    await expect(page.locator('input[v-model="params.image2Y"]')).toBeVisible();
    await expect(page.locator('input[v-model="params.image2Width"]')).toBeVisible();
    await expect(page.locator('input[v-model="params.image2Height"]')).toBeVisible();
    
    // 出力形式
    await expect(page.locator('select[v-model="params.format"]')).toBeVisible();
    
    // 生成ボタン
    await expect(page.locator('button:has-text("画像を生成")')).toBeVisible();
  });

  test('使用例が表示される', async ({ page }) => {
    await expect(page.locator('.examples h2')).toContainText('使用例');
    await expect(page.locator('.example-card')).toHaveCount(3);
  });

  test('画像生成ボタンをクリックするとAPIが呼び出される', async ({ page }) => {
    // APIリクエストを監視
    await page.route('**/images/composite**', route => {
      route.continue();
    });
    
    const apiRequestPromise = page.waitForRequest(request => 
      request.url().includes('/images/composite') && 
      request.url().includes('baseImage=test')
    );
    
    // 画像生成ボタンをクリック
    await page.locator('button:has-text("画像を生成")').click();
    
    // APIリクエストが発生したことを確認
    const apiRequest = await apiRequestPromise;
    expect(apiRequest.url()).toContain('baseImage=test');
    expect(apiRequest.url()).toContain('image1=test');
    expect(apiRequest.url()).toContain('image2=test');
  });

  test('使用例をクリックするとパラメータが設定される', async ({ page }) => {
    // カスタム配置の例をクリック
    await page.locator('.example-card:has-text("カスタム配置")').click();
    
    // パラメータが更新されたことを確認
    await expect(page.locator('input[v-model="params.image1X"]')).toHaveValue('100');
    await expect(page.locator('input[v-model="params.image1Y"]')).toHaveValue('100');
    await expect(page.locator('input[v-model="params.image1Width"]')).toHaveValue('400');
    await expect(page.locator('input[v-model="params.image1Height"]')).toHaveValue('300');
  });
});
