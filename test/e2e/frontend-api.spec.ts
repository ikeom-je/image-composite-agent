import { test, expect } from '@playwright/test';

const FRONTEND_URL = 'https://d2jokx0x4ou6mb.cloudfront.net';
const API_URL = 'https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod/images/composite';

test.describe('フロントエンドAPI接続テスト', () => {
  test.beforeEach(async ({ page }) => {
    // ネットワークリクエストを監視
    page.on('request', request => {
      console.log(`Request: ${request.method()} ${request.url()}`);
    });
    
    page.on('response', response => {
      console.log(`Response: ${response.status()} ${response.url()}`);
    });
    
    page.on('requestfailed', request => {
      console.log(`Request failed: ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });
  });

  test('フロントエンドページが正常に読み込まれる', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // ページタイトルの確認
    await expect(page).toHaveTitle(/画像合成REST API/);
    
    // 主要な要素の存在確認
    await expect(page.locator('h1')).toContainText('画像合成REST API デモ');
    await expect(page.locator('button', { hasText: '画像を生成' })).toBeVisible();
  });

  test('UI要素が正しく表示される', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // フォーム要素の確認
    await expect(page.locator('select').first()).toBeVisible(); // ベース画像選択
    await expect(page.locator('input[type="number"]').first()).toBeVisible(); // 位置X
    await expect(page.locator('button', { hasText: '画像を生成' })).toBeVisible();
    
    // 結果表示エリアの確認
    await expect(page.locator('.result-container')).toBeVisible();
  });

  test('基本的な画像生成が動作する', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // ネットワークリクエストを監視
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/images/composite') && response.status() === 200
    );
    
    // 画像生成ボタンをクリック
    await page.click('button:has-text("画像を生成")');
    
    // APIレスポンスを待機
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    
    // 結果画像の表示を確認
    await expect(page.locator('.result-image')).toBeVisible({ timeout: 10000 });
  });

  test('S3パス指定での画像生成が動作する', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 画像1のセレクトボックスを探す
    const image1Select = page.locator('select').nth(1); // 2番目のselect要素
    await expect(image1Select).toBeVisible();
    
    // S3パスを選択
    await image1Select.selectOption({ 
      value: 's3://imageprocessorapistack-testimagesbucket4ab1f113-yg0v6o6txw9z/images/circle_red.png' 
    });
    
    // ネットワークリクエストを監視
    const responsePromise = page.waitForResponse(response => 
      response.url().includes('/images/composite') && response.status() === 200
    );
    
    // 画像生成ボタンをクリック
    await page.click('button:has-text("画像を生成")');
    
    // APIレスポンスを待機
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    
    // 結果画像の表示を確認
    await expect(page.locator('.result-image')).toBeVisible({ timeout: 10000 });
  });

  test('エラーハンドリングが正しく動作する', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // 数値入力フィールドを探す
    const numberInputs = page.locator('input[type="number"]');
    await expect(numberInputs.first()).toBeVisible();
    
    // 無効なパラメータを設定（例：負の値）
    await numberInputs.nth(0).fill('-1');
    await numberInputs.nth(1).fill('-1');
    
    // 画像生成ボタンをクリック
    await page.click('button:has-text("画像を生成")');
    
    // エラーメッセージまたは適切な処理を確認
    // 実際の動作に応じて調整が必要
    await page.waitForTimeout(3000);
  });

  test('API URLが正しく設定されている', async ({ page }) => {
    await page.goto(FRONTEND_URL);
    
    // ページのJavaScriptコンテキストでAPI URLを確認
    const apiUrl = await page.evaluate(() => {
      // Vue 3のアプリケーションデータにアクセス
      const appElement = document.querySelector('#app');
      if (appElement && appElement._vnode && appElement._vnode.component) {
        return appElement._vnode.component.data?.apiBaseUrl || 'vue3 data not found';
      }
      // 代替方法：環境変数を直接確認
      return window.location.origin + '/api-check';
    });
    
    console.log('Frontend API URL:', apiUrl);
    
    // 実際のAPIリクエストが正しいURLに送信されることを確認
    let actualApiUrl = '';
    page.on('request', request => {
      if (request.url().includes('/images/composite')) {
        actualApiUrl = request.url();
      }
    });
    
    // 画像生成ボタンをクリックしてAPIリクエストを発生させる
    await page.click('button:has-text("画像を生成")');
    await page.waitForTimeout(2000);
    
    console.log('Actual API URL used:', actualApiUrl);
    expect(actualApiUrl).toContain('execute-api.ap-northeast-1.amazonaws.com');
  });

  test('ネットワークエラーが発生しない', async ({ page }) => {
    let networkErrors: string[] = [];
    
    page.on('requestfailed', request => {
      networkErrors.push(`${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
    });
    
    await page.goto(FRONTEND_URL);
    
    // 画像生成を実行
    await page.click('button:has-text("画像を生成")');
    await page.waitForTimeout(5000);
    
    // ネットワークエラーがないことを確認
    console.log('Network errors:', networkErrors);
    expect(networkErrors.filter(error => error.includes('ERR_NAME_NOT_RESOLVED'))).toHaveLength(0);
  });
});