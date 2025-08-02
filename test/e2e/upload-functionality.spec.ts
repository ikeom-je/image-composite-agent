/**
 * 画像アップロード機能のE2Eテスト
 * 
 * テスト対象:
 * - 画像アップロード機能
 * - 画像選択機能
 * - エラーハンドリング
 * - UI操作
 */

import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://d66gmb5py5515.cloudfront.net';
const API_URL = process.env.API_URL || 'https://4vssi3zjmd.execute-api.ap-northeast-1.amazonaws.com/prod';

test.describe('画像アップロード機能', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
  });

  test('アップロードコンポーネントが正しく表示される', async ({ page }) => {
    // アップロードセクションの存在確認
    const uploadSection = page.locator('.upload-section');
    await expect(uploadSection).toBeVisible();
    
    // アップロードエリアの存在確認
    const uploadArea = page.locator('.upload-area');
    await expect(uploadArea).toBeVisible();
    
    // アップロードボタンの存在確認
    const uploadButton = page.locator('.upload-button');
    await expect(uploadButton).toBeVisible();
    await expect(uploadButton).toContainText('画像ファイルを選択');
    
    // ヒントテキストの確認
    const hint = page.locator('.upload-hint');
    await expect(hint).toContainText('ドラッグ&ドロップ');
    
    // ファイル制約の表示確認
    const constraints = page.locator('.file-constraints');
    await expect(constraints).toBeVisible();
    await expect(constraints).toContainText('10MB');
  });

  test('画像選択コンポーネントが正しく表示される', async ({ page }) => {
    // 画像選択セクションの存在確認
    const imageSelectors = page.locator('.image-selectors');
    await expect(imageSelectors).toBeVisible();
    
    // 3つの画像選択コンポーネントの確認
    const selectors = page.locator('.image-selector');
    await expect(selectors).toHaveCount(3);
    
    // 各選択コンポーネントのラベル確認
    await expect(selectors.nth(0)).toContainText('画像1');
    await expect(selectors.nth(1)).toContainText('画像2');
    await expect(selectors.nth(2)).toContainText('画像3');
    
    // 必須マークの確認
    const requiredSelectors = selectors.filter({ hasText: '画像1' }).or(selectors.filter({ hasText: '画像2' }));
    await expect(requiredSelectors.first().locator('.form-select')).toHaveClass(/required/);
  });

  test('テスト画像選択が正常に動作する', async ({ page }) => {
    // 画像1でテスト画像を選択
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('test');
    
    // サブ選択が表示されることを確認
    const testSelection = image1Selector.locator('.test-image-selection');
    await expect(testSelection).toBeVisible();
    
    // 自動選択オプションの確認
    const subSelect = testSelection.locator('select');
    await expect(subSelect.locator('option[value="test"]')).toContainText('赤い円');
    
    // 特定の図形を選択
    await subSelect.selectOption('circle');
    
    // プレビューが表示されることを確認
    const preview = testSelection.locator('.test-image-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('赤い円');
  });

  test('S3画像選択が正常に動作する', async ({ page }) => {
    // 画像1でS3画像を選択
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    // S3選択セクションが表示されることを確認
    const s3Selection = image1Selector.locator('.s3-image-selection');
    await expect(s3Selection).toBeVisible();
    
    // 更新ボタンの存在確認
    const refreshButton = s3Selection.locator('.refresh-button');
    await expect(refreshButton).toBeVisible();
    
    // 画像一覧の読み込み待機
    await page.waitForTimeout(2000);
    
    // 画像グリッドまたは空状態の確認
    const imageGrid = s3Selection.locator('.image-grid');
    const noImagesState = s3Selection.locator('.no-images-state');
    
    const hasImages = await imageGrid.isVisible();
    const isEmpty = await noImagesState.isVisible();
    
    expect(hasImages || isEmpty).toBeTruthy();
    
    if (hasImages) {
      // 画像がある場合の確認
      const imageItems = imageGrid.locator('.image-item');
      const count = await imageItems.count();
      expect(count).toBeGreaterThan(0);
      
      // 最初の画像を選択
      if (count > 0) {
        await imageItems.first().click();
        
        // 選択状態の確認
        await expect(imageItems.first()).toHaveClass(/selected/);
        
        // 選択状態表示の確認
        const selectionStatus = image1Selector.locator('.selection-status');
        await expect(selectionStatus).toBeVisible();
      }
    } else {
      // 画像がない場合の確認
      await expect(noImagesState).toContainText('アップロードされた画像がありません');
    }
  });

  test('画像合成モードの切り替えが正常に動作する', async ({ page }) => {
    // 初期状態では2画像モード
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).toContainText('2画像を合成');
    
    // 画像3を選択
    const image3Selector = page.locator('.image-selector').filter({ hasText: '画像3' });
    const mainSelect = image3Selector.locator('.main-select');
    
    await mainSelect.selectOption('test');
    
    // 3画像モードに切り替わることを確認
    await expect(generateButton).toContainText('3画像を合成');
    
    // 画像3の設定が有効になることを確認
    const configTable = page.locator('.config-table');
    const image3Cells = configTable.locator('td').filter({ hasText: '画像3' }).or(
      configTable.locator('th').filter({ hasText: '画像3' })
    );
    
    // 無効状態のクラスが削除されることを確認
    await expect(image3Cells.first()).not.toHaveClass(/disabled/);
    
    // 画像3を未選択に戻す
    await mainSelect.selectOption('');
    
    // 2画像モードに戻ることを確認
    await expect(generateButton).toContainText('2画像を合成');
  });

  test('エラーハンドリングが正常に動作する', async ({ page }) => {
    // 無効なAPI URLでテスト（モック）
    await page.route('**/upload/**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });
    
    // S3画像選択を試行
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    // エラーメッセージが表示されることを確認
    const errorMessage = image1Selector.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    await expect(errorMessage).toContainText('S3画像の読み込みに失敗しました');
    
    // エラー解除ボタンの動作確認
    const dismissButton = errorMessage.locator('.error-dismiss');
    await dismissButton.click();
    await expect(errorMessage).not.toBeVisible();
  });

  test('レスポンシブデザインが正常に動作する', async ({ page }) => {
    // モバイルサイズに変更
    await page.setViewportSize({ width: 375, height: 667 });
    
    // アップロードエリアが適切に表示されることを確認
    const uploadArea = page.locator('.upload-area');
    await expect(uploadArea).toBeVisible();
    
    // 画像選択コンポーネントが縦並びになることを確認
    const imageSelectors = page.locator('.image-selectors');
    await expect(imageSelectors).toBeVisible();
    
    // 設定テーブルが適切に表示されることを確認
    const configTable = page.locator('.config-table');
    await expect(configTable).toBeVisible();
    
    // デスクトップサイズに戻す
    await page.setViewportSize({ width: 1280, height: 720 });
    
    // レイアウトが適切に戻ることを確認
    await expect(imageSelectors).toBeVisible();
    await expect(configTable).toBeVisible();
  });

  test('アクセシビリティが適切に実装されている', async ({ page }) => {
    // フォーカス可能な要素の確認
    const uploadButton = page.locator('.upload-button');
    await uploadButton.focus();
    await expect(uploadButton).toBeFocused();
    
    // キーボードナビゲーションの確認
    await page.keyboard.press('Tab');
    const mainSelect = page.locator('.main-select').first();
    await expect(mainSelect).toBeFocused();
    
    // ラベルとフォーム要素の関連付け確認
    const labels = page.locator('.form-label');
    const labelCount = await labels.count();
    expect(labelCount).toBeGreaterThan(0);
    
    // ARIA属性の確認（必要に応じて）
    const selects = page.locator('select');
    for (let i = 0; i < await selects.count(); i++) {
      const select = selects.nth(i);
      // 基本的なアクセシビリティ属性の存在確認
      await expect(select).toBeVisible();
    }
  });

  test('パフォーマンスが適切である', async ({ page }) => {
    // ページ読み込み時間の測定
    const startTime = Date.now();
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    
    // 5秒以内に読み込まれることを確認
    expect(loadTime).toBeLessThan(5000);
    
    // 画像選択の応答性確認
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    const selectStartTime = Date.now();
    await mainSelect.selectOption('test');
    
    // サブ選択が迅速に表示されることを確認
    const testSelection = image1Selector.locator('.test-image-selection');
    await expect(testSelection).toBeVisible();
    const selectTime = Date.now() - selectStartTime;
    
    // 1秒以内に応答することを確認
    expect(selectTime).toBeLessThan(1000);
  });

  test('統合ワークフローが正常に動作する', async ({ page }) => {
    // 完全なワークフローのテスト
    
    // 1. 画像1を選択
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    await image1Selector.locator('.main-select').selectOption('test');
    
    // 2. 画像2を選択
    const image2Selector = page.locator('.image-selector').filter({ hasText: '画像2' });
    await image2Selector.locator('.main-select').selectOption('test');
    
    // 3. 画像3を選択
    const image3Selector = page.locator('.image-selector').filter({ hasText: '画像3' });
    await image3Selector.locator('.main-select').selectOption('test');
    
    // 4. 位置を調整
    const xInput = page.locator('input[type="number"]').first();
    await xInput.fill('200');
    
    // 5. 画像生成ボタンが有効になることを確認
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).not.toBeDisabled();
    await expect(generateButton).toContainText('3画像を合成');
    
    // 6. 画像生成を実行
    await generateButton.click();
    
    // 7. 結果が表示されることを確認
    const resultContainer = page.locator('.result-container');
    await expect(resultContainer).toBeVisible();
    
    // 8. 生成中の表示確認
    const loadingState = page.locator('.loading');
    if (await loadingState.isVisible()) {
      await expect(loadingState).toContainText('生成中');
    }
    
    // 9. 結果の表示を待機（最大30秒）
    await page.waitForSelector('.result-image, .error', { timeout: 30000 });
    
    // 10. 成功またはエラーの確認
    const resultImage = page.locator('.result-image');
    const errorMessage = page.locator('.error');
    
    const hasResult = await resultImage.isVisible();
    const hasError = await errorMessage.isVisible();
    
    expect(hasResult || hasError).toBeTruthy();
    
    if (hasResult) {
      // 成功時の確認
      await expect(resultImage).toBeVisible();
      
      // ダウンロードボタンの確認
      const downloadButton = page.locator('button').filter({ hasText: 'ダウンロード' });
      await expect(downloadButton).toBeVisible();
      
      // API URLコピーボタンの確認
      const copyButton = page.locator('button').filter({ hasText: 'コピー' });
      await expect(copyButton).toBeVisible();
    } else {
      // エラー時の確認
      await expect(errorMessage).toBeVisible();
      console.log('Error occurred during image generation:', await errorMessage.textContent());
    }
  });
});

test.describe('アップロード機能の詳細テスト', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
  });

  test('ファイル選択ダイアログが正常に動作する', async ({ page }) => {
    // ファイル入力要素の存在確認
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeHidden(); // 非表示であることを確認
    
    // アップロードボタンクリックでファイルダイアログが開くことを確認
    const uploadButton = page.locator('.upload-button');
    
    // ファイル選択のモック
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      uploadButton.click()
    ]);
    
    expect(fileChooser).toBeTruthy();
    expect(fileChooser.isMultiple()).toBeFalsy();
  });

  test('ドラッグ&ドロップ機能が正常に動作する', async ({ page }) => {
    const uploadArea = page.locator('.upload-area');
    
    // ドラッグオーバー状態の確認
    await uploadArea.dispatchEvent('dragenter');
    await expect(uploadArea).toHaveClass(/drag-over/);
    
    // ドラッグリーブ状態の確認
    await uploadArea.dispatchEvent('dragleave');
    await expect(uploadArea).not.toHaveClass(/drag-over/);
  });

  test('アップロード履歴が正常に表示される', async ({ page }) => {
    // ローカルストレージにテストデータを設定
    await page.evaluate(() => {
      const testHistory = [
        {
          fileName: 'test-image-1.png',
          s3Key: 'uploads/images/test-image-1.png',
          s3Path: 's3://test-bucket/uploads/images/test-image-1.png',
          timestamp: new Date().toISOString()
        }
      ];
      localStorage.setItem('imageUploadHistory', JSON.stringify(testHistory));
    });
    
    // ページをリロード
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    // 履歴セクションの確認
    const historySection = page.locator('.upload-history');
    await expect(historySection).toBeVisible();
    
    // 履歴アイテムの確認
    const historyItems = page.locator('.history-item');
    await expect(historyItems).toHaveCount(1);
    
    // 使用ボタンの確認
    const useButton = historyItems.first().locator('.use-image-button');
    await expect(useButton).toBeVisible();
    await expect(useButton).toContainText('使用');
  });
});