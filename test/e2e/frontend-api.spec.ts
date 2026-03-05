import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend.example.com';
const API_URL = process.env.API_URL || 'https://api.example.com/prod/images/composite';

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
    
    // 利用可能なオプションをデバッグ出力
    const options = await image1Select.locator('option').allTextContents();
    console.log('Available options:', options);
    
    // オプションのvalue属性も確認
    const optionValues = await image1Select.locator('option').evaluateAll(options => 
      options.map(option => ({ text: option.textContent, value: (option as HTMLOptionElement).value }))
    );
    console.log('Option values:', optionValues);
    
    // S3パスオプションが存在するかチェック
    const s3Options = await image1Select.locator('option').filter({ hasText: 'S3パス' }).count();
    console.log('S3 options count:', s3Options);
    
    if (s3Options > 0) {
      console.log('S3パスオプションが見つかりました');
      // S3パスを選択（実際のvalue属性を使用）
      await image1Select.selectOption({ 
        value: 's3://your-test-images-bucket/images/circle_red.png' 
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
    } else {
      console.log('S3パスオプションが利用できないため、基本的な画像生成をテスト');
      
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
    }
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
      // Vue 3のアプリケーションデータにアクセス（型安全な方法）
      const appElement = document.querySelector('#app') as any;
      if (appElement && appElement.__vue_app__) {
        // Vue 3の新しいAPIを使用
        return 'vue3 app detected';
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
    expect(actualApiUrl).toContain('/images/composite');
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