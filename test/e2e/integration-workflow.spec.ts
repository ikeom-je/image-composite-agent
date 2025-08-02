/**
 * 統合機能のE2Eテスト
 * 
 * テスト対象:
 * - アップロード→選択→合成の完全ワークフロー
 * - 既存機能との互換性
 * - エラーシナリオ
 * - パフォーマンス
 */

import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://d66gmb5py5515.cloudfront.net';
const API_URL = process.env.API_URL || 'https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod';

test.describe('統合ワークフローテスト', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
  });

  test('完全なアップロード→選択→合成ワークフロー', async ({ page }) => {
    // Step 1: 画像アップロードのモック
    let uploadRequestReceived = false;
    let imageListRequestReceived = false;
    
    // 署名付きURL生成のモック
    await page.route('**/upload/presigned-url', route => {
      uploadRequestReceived = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uploadUrl: 'https://mock-s3-upload-url.com',
          s3Key: 'uploads/images/test-upload.png',
          bucketName: 'test-bucket',
          expiresIn: 3600,
          uniqueFilename: 'test-upload.png'
        })
      });
    });
    
    // S3アップロードのモック
    await page.route('https://mock-s3-upload-url.com', route => {
      route.fulfill({
        status: 200,
        body: ''
      });
    });
    
    // 画像一覧取得のモック
    await page.route('**/upload/images**', route => {
      imageListRequestReceived = true;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          images: [
            {
              key: 'uploads/images/test-upload.png',
              s3Path: 's3://test-bucket/uploads/images/test-upload.png',
              fileName: 'test-upload.png',
              size: 1024000,
              lastModified: new Date().toISOString(),
              contentType: 'image/png',
              thumbnailUrl: 'https://example.com/test-upload-thumbnail.png'
            }
          ],
          count: 1,
          isTruncated: false
        })
      });
    });
    
    // 画像合成APIのモック
    await page.route('**/images/composite**', route => {
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `
          <html>
            <body>
              <h1>合成画像結果</h1>
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" alt="合成結果" />
            </body>
          </html>
        `
      });
    });
    
    // Step 2: ファイルアップロードのシミュレーション
    const uploadArea = page.locator('.upload-area');
    const fileInput = page.locator('input[type="file"]');
    
    // ファイル選択のシミュレーション
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('.upload-button').click()
    ]);
    
    // テスト用の画像ファイルを作成
    const testFile = await page.evaluateHandle(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext('2d');
      ctx!.fillStyle = 'red';
      ctx!.fillRect(0, 0, 100, 100);
      
      return new Promise<File>((resolve) => {
        canvas.toBlob((blob) => {
          const file = new File([blob!], 'test-upload.png', { type: 'image/png' });
          resolve(file);
        });
      });
    });
    
    // テスト用の画像ファイルを作成
    await fileChooser.setFiles([{
      name: 'test-upload.png',
      mimeType: 'image/png',
      buffer: Buffer.from('test image data')
    }]);
    
    // アップロード進行状況の確認
    const uploadProgress = page.locator('.upload-progress');
    if (await uploadProgress.isVisible()) {
      await expect(uploadProgress).toBeVisible();
      
      // 進行状況バーの確認
      const progressBar = uploadProgress.locator('.progress-bar');
      await expect(progressBar).toBeVisible();
    }
    
    // アップロード完了の確認
    const successMessage = page.locator('.success-message');
    await expect(successMessage).toBeVisible({ timeout: 10000 });
    await expect(successMessage).toContainText('アップロード完了');
    
    // Step 3: アップロードした画像を選択
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    await image1Selector.locator('.main-select').selectOption('s3');
    
    // S3画像一覧の読み込み待機
    const s3Selection = image1Selector.locator('.s3-image-selection');
    const imageGrid = s3Selection.locator('.image-grid');
    
    await expect(imageGrid).toBeVisible({ timeout: 5000 });
    
    // アップロードした画像を選択
    const imageItem = imageGrid.locator('.image-item').first();
    await expect(imageItem).toBeVisible();
    await imageItem.click();
    
    // 選択状態の確認
    await expect(imageItem).toHaveClass(/selected/);
    
    // Step 4: 他の画像も選択
    const image2Selector = page.locator('.image-selector').filter({ hasText: '画像2' });
    await image2Selector.locator('.main-select').selectOption('test');
    
    // Step 5: 画像合成を実行
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).not.toBeDisabled();
    await expect(generateButton).toContainText('2画像を合成');
    
    await generateButton.click();
    
    // Step 6: 結果の確認
    const resultContainer = page.locator('.result-container');
    await expect(resultContainer).toBeVisible();
    
    // 生成中の表示確認
    const loadingState = page.locator('.loading');
    if (await loadingState.isVisible()) {
      await expect(loadingState).toContainText('生成中');
    }
    
    // 結果画像の表示確認
    const resultImage = page.locator('.result-image');
    await expect(resultImage).toBeVisible({ timeout: 15000 });
    
    // ダウンロードボタンの確認
    const downloadButton = page.locator('button').filter({ hasText: 'ダウンロード' });
    await expect(downloadButton).toBeVisible();
    
    // API URLコピーボタンの確認
    const copyButton = page.locator('button').filter({ hasText: 'コピー' });
    await expect(copyButton).toBeVisible();
    
    // Step 7: APIリクエストが正しく送信されたことを確認
    expect(uploadRequestReceived).toBeTruthy();
    expect(imageListRequestReceived).toBeTruthy();
  });

  test('既存機能との互換性確認', async ({ page }) => {
    // 従来のテスト画像のみを使用した合成
    
    // 画像合成APIのモック
    await page.route('**/images/composite**', route => {
      const url = new URL(route.request().url());
      const image1 = url.searchParams.get('image1');
      const image2 = url.searchParams.get('image2');
      const image3 = url.searchParams.get('image3');
      
      // パラメータの確認
      expect(image1).toBe('test');
      expect(image2).toBe('test');
      
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `
          <html>
            <body>
              <h1>従来機能での合成結果</h1>
              <p>画像1: ${image1}</p>
              <p>画像2: ${image2}</p>
              <p>画像3: ${image3 || '未指定'}</p>
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" alt="合成結果" />
            </body>
          </html>
        `
      });
    });
    
    // 画像1でテスト画像を選択
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    await image1Selector.locator('.main-select').selectOption('test');
    
    // 画像2でテスト画像を選択
    const image2Selector = page.locator('.image-selector').filter({ hasText: '画像2' });
    await image2Selector.locator('.main-select').selectOption('test');
    
    // 2画像モードであることを確認
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).toContainText('2画像を合成');
    
    // 画像合成を実行
    await generateButton.click();
    
    // 結果の確認
    const resultImage = page.locator('.result-image');
    await expect(resultImage).toBeVisible({ timeout: 15000 });
    
    // 従来機能が正常に動作することを確認
    const resultContainer = page.locator('.result-container');
    await expect(resultContainer).toContainText('従来機能での合成結果');
  });

  test('3画像合成の完全ワークフロー', async ({ page }) => {
    // 3画像合成APIのモック
    await page.route('**/images/composite**', route => {
      const url = new URL(route.request().url());
      const image1 = url.searchParams.get('image1');
      const image2 = url.searchParams.get('image2');
      const image3 = url.searchParams.get('image3');
      
      // 3画像のパラメータが正しく送信されることを確認
      expect(image1).toBe('test');
      expect(image2).toBe('test');
      expect(image3).toBe('test');
      
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: `
          <html>
            <body>
              <h1>3画像合成結果</h1>
              <p>画像1: ${image1}</p>
              <p>画像2: ${image2}</p>
              <p>画像3: ${image3}</p>
              <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" alt="3画像合成結果" />
            </body>
          </html>
        `
      });
    });
    
    // 3つの画像を選択
    const selectors = [
      { name: '画像1', type: 'circle' },
      { name: '画像2', type: 'rectangle' },
      { name: '画像3', type: 'triangle' }
    ];
    
    for (const selector of selectors) {
      const imageSelector = page.locator('.image-selector').filter({ hasText: selector.name });
      await imageSelector.locator('.main-select').selectOption('test');
      
      const testSelection = imageSelector.locator('.test-image-selection');
      await testSelection.locator('select').selectOption(selector.type);
    }
    
    // 3画像モードになることを確認
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).toContainText('3画像を合成');
    
    // 位置調整
    const configTable = page.locator('.config-table');
    const xInputs = configTable.locator('input[type="number"]');
    
    // 画像1のX座標を調整
    await xInputs.nth(0).fill('100');
    // 画像2のX座標を調整
    await xInputs.nth(2).fill('300');
    // 画像3のX座標を調整
    await xInputs.nth(4).fill('500');
    
    // 画像合成を実行
    await generateButton.click();
    
    // 結果の確認
    const resultImage = page.locator('.result-image');
    await expect(resultImage).toBeVisible({ timeout: 15000 });
    
    // 3画像合成が正常に動作することを確認
    const resultContainer = page.locator('.result-container');
    await expect(resultContainer).toContainText('3画像合成結果');
  });

  test('エラーシナリオの統合テスト', async ({ page }) => {
    // シナリオ1: アップロードエラー
    await page.route('**/upload/presigned-url', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Upload service unavailable'
        })
      });
    });
    
    // ファイルアップロードを試行
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('.upload-button').click()
    ]);
    
    // テスト用の画像ファイルを作成
    await fileChooser.setFiles([{
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from('test')
    }]);
    
    // エラーメッセージの確認
    const uploadError = page.locator('.upload-section .error-message');
    await expect(uploadError).toBeVisible({ timeout: 10000 });
    
    // シナリオ2: S3画像一覧取得エラー
    await page.route('**/upload/images**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Failed to list images'
        })
      });
    });
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    await image1Selector.locator('.main-select').selectOption('s3');
    
    // S3エラーメッセージの確認
    const s3Error = image1Selector.locator('.error-message');
    await expect(s3Error).toBeVisible({ timeout: 5000 });
    
    // シナリオ3: 画像合成エラー
    await page.route('**/images/composite**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Image composition failed'
        })
      });
    });
    
    // テスト画像で合成を試行
    await image1Selector.locator('.main-select').selectOption('test');
    
    const image2Selector = page.locator('.image-selector').filter({ hasText: '画像2' });
    await image2Selector.locator('.main-select').selectOption('test');
    
    const generateButton = page.locator('.generate-button');
    await generateButton.click();
    
    // 合成エラーメッセージの確認
    const compositionError = page.locator('.result-container .error');
    await expect(compositionError).toBeVisible({ timeout: 15000 });
  });

  test('パフォーマンステスト', async ({ page }) => {
    // ページ読み込み時間の測定
    const startTime = Date.now();
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    console.log(`Page load time: ${loadTime}ms`);
    expect(loadTime).toBeLessThan(5000); // 5秒以内
    
    // 画像選択の応答時間測定
    const selectionStartTime = Date.now();
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    await image1Selector.locator('.main-select').selectOption('test');
    
    const testSelection = image1Selector.locator('.test-image-selection');
    await expect(testSelection).toBeVisible();
    
    const selectionTime = Date.now() - selectionStartTime;
    console.log(`Image selection time: ${selectionTime}ms`);
    expect(selectionTime).toBeLessThan(1000); // 1秒以内
    
    // 画像合成の応答時間測定（モック使用）
    await page.route('**/images/composite**', route => {
      // 意図的に遅延を追加
      setTimeout(() => {
        route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: `
            <html>
              <body>
                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==" alt="結果" />
              </body>
            </html>
          `
        });
      }, 2000); // 2秒遅延
    });
    
    const image2Selector = page.locator('.image-selector').filter({ hasText: '画像2' });
    await image2Selector.locator('.main-select').selectOption('test');
    
    const compositionStartTime = Date.now();
    
    const generateButton = page.locator('.generate-button');
    await generateButton.click();
    
    const resultImage = page.locator('.result-image');
    await expect(resultImage).toBeVisible({ timeout: 10000 });
    
    const compositionTime = Date.now() - compositionStartTime;
    console.log(`Image composition time: ${compositionTime}ms`);
    expect(compositionTime).toBeLessThan(8000); // 8秒以内（遅延込み）
  });

  test('メモリリークテスト', async ({ page }) => {
    // 複数回の操作を実行してメモリリークをチェック
    for (let i = 0; i < 5; i++) {
      // 画像選択を繰り返し実行
      const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
      
      await image1Selector.locator('.main-select').selectOption('test');
      await page.waitForTimeout(100);
      
      await image1Selector.locator('.main-select').selectOption('s3');
      await page.waitForTimeout(100);
      
      await image1Selector.locator('.main-select').selectOption('');
      await page.waitForTimeout(100);
    }
    
    // メモリ使用量の確認（基本的なチェック）
    const memoryInfo = await page.evaluate(() => {
      return (performance as any).memory ? {
        usedJSHeapSize: (performance as any).memory.usedJSHeapSize,
        totalJSHeapSize: (performance as any).memory.totalJSHeapSize,
        jsHeapSizeLimit: (performance as any).memory.jsHeapSizeLimit
      } : null;
    });
    
    if (memoryInfo) {
      console.log('Memory usage:', memoryInfo);
      // メモリ使用量が制限の80%を超えていないことを確認
      expect(memoryInfo.usedJSHeapSize).toBeLessThan(memoryInfo.jsHeapSizeLimit * 0.8);
    }
  });

  test('同時操作テスト', async ({ page }) => {
    // 複数の操作を同時に実行
    const promises = [];
    
    // 画像1の選択
    promises.push(
      page.locator('.image-selector').filter({ hasText: '画像1' })
        .locator('.main-select').selectOption('test')
    );
    
    // 画像2の選択
    promises.push(
      page.locator('.image-selector').filter({ hasText: '画像2' })
        .locator('.main-select').selectOption('test')
    );
    
    // 位置調整
    promises.push(
      page.locator('input[type="number"]').first().fill('200')
    );
    
    // 全ての操作を同時実行
    await Promise.all(promises);
    
    // 最終状態の確認
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).not.toBeDisabled();
    await expect(generateButton).toContainText('2画像を合成');
  });

  test('ブラウザ互換性テスト', async ({ page, browserName }) => {
    console.log(`Testing on browser: ${browserName}`);
    
    // 基本機能の動作確認
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    await image1Selector.locator('.main-select').selectOption('test');
    
    const testSelection = image1Selector.locator('.test-image-selection');
    await expect(testSelection).toBeVisible();
    
    // CSS機能の確認
    const uploadArea = page.locator('.upload-area');
    const styles = await uploadArea.evaluate(el => {
      const computed = window.getComputedStyle(el);
      return {
        borderRadius: computed.borderRadius,
        transition: computed.transition,
        transform: computed.transform
      };
    });
    
    // 基本的なCSS機能が動作することを確認
    expect(styles.borderRadius).toBeTruthy();
    
    // JavaScript機能の確認
    const jsFeatures = await page.evaluate(() => {
      return {
        fetch: typeof fetch !== 'undefined',
        promise: typeof Promise !== 'undefined',
        arrow: (() => true)() === true,
        const: (() => { const x = 1; return x === 1; })(),
        let: (() => { let x = 1; return x === 1; })()
      };
    });
    
    // 必要なJavaScript機能が利用可能であることを確認
    expect(jsFeatures.fetch).toBeTruthy();
    expect(jsFeatures.promise).toBeTruthy();
    expect(jsFeatures.arrow).toBeTruthy();
    expect(jsFeatures.const).toBeTruthy();
    expect(jsFeatures.let).toBeTruthy();
  });
});

test.describe('リグレッションテスト', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
  });

  test('既存のテスト画像機能が正常に動作する', async ({ page }) => {
    // 従来のテスト画像選択機能の確認
    const testImages = ['circle', 'rectangle', 'triangle'];
    
    for (let i = 0; i < testImages.length; i++) {
      const imageSelector = page.locator('.image-selector').nth(i);
      await imageSelector.locator('.main-select').selectOption('test');
      
      const testSelection = imageSelector.locator('.test-image-selection');
      await testSelection.locator('select').selectOption(testImages[i]);
      
      const preview = testSelection.locator('.test-image-preview');
      await expect(preview).toBeVisible();
    }
    
    // 3画像合成が正常に動作することを確認
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).toContainText('3画像を合成');
  });

  test('位置・サイズ調整機能が正常に動作する', async ({ page }) => {
    // 設定テーブルの確認
    const configTable = page.locator('.config-table');
    await expect(configTable).toBeVisible();
    
    // 数値入力フィールドの確認
    const numberInputs = configTable.locator('input[type="number"]');
    const inputCount = await numberInputs.count();
    expect(inputCount).toBeGreaterThanOrEqual(4); // 最低でも画像1,2のX,Y座標
    
    // 値の入力テスト
    await numberInputs.first().fill('150');
    await expect(numberInputs.first()).toHaveValue('150');
  });

  test('使用例機能が正常に動作する', async ({ page }) => {
    // 使用例セクションの確認
    const examplesSection = page.locator('.examples');
    await expect(examplesSection).toBeVisible();
    
    // 使用例カードの確認
    const exampleCards = page.locator('.example-card');
    const cardCount = await exampleCards.count();
    expect(cardCount).toBeGreaterThan(0);
    
    // 最初の使用例をクリック
    await exampleCards.first().click();
    
    // パラメータが設定されることを確認
    await page.waitForTimeout(1000);
    
    // 生成ボタンが有効になることを確認
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).not.toBeDisabled();
  });
});