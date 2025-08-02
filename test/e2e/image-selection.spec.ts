/**
 * 画像選択機能のE2Eテスト
 * 
 * テスト対象:
 * - 3択選択UI（未選択・テスト画像・S3画像）
 * - 画像選択時のパス設定
 * - 1画像・2画像・3画像モード切り替え
 * - S3画像一覧表示
 */

import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://frontend.example.com';
const API_URL = process.env.API_URL || 'https://api.example.com/prod';

test.describe('画像選択機能', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
  });

  test('3択選択UIが正しく表示される', async ({ page }) => {
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    // 選択肢の確認
    const options = mainSelect.locator('option');
    await expect(options).toHaveCount(3);
    
    await expect(options.nth(0)).toHaveValue('');
    await expect(options.nth(0)).toContainText('未選択');
    
    await expect(options.nth(1)).toHaveValue('test');
    await expect(options.nth(1)).toContainText('既存テスト画像');
    
    await expect(options.nth(2)).toHaveValue('s3');
    await expect(options.nth(2)).toContainText('S3アップロード画像');
  });

  test('未選択状態が正常に動作する', async ({ page }) => {
    const image3Selector = page.locator('.image-selector').filter({ hasText: '画像3' });
    const mainSelect = image3Selector.locator('.main-select');
    
    // 初期状態は未選択
    await expect(mainSelect).toHaveValue('');
    
    // 生成ボタンは2画像モード
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).toContainText('2画像を合成');
    
    // 設定テーブルで画像3が無効状態
    const configTable = page.locator('.config-table');
    const image3Header = configTable.locator('th').filter({ hasText: '画像3' });
    await expect(image3Header).toHaveClass(/disabled-header/);
    
    // 画像3の入力フィールドが無効
    const image3Inputs = configTable.locator('input[disabled]');
    const disabledCount = await image3Inputs.count();
    expect(disabledCount).toBeGreaterThan(0);
  });

  test('テスト画像選択が正常に動作する', async ({ page }) => {
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    // テスト画像を選択
    await mainSelect.selectOption('test');
    
    // サブ選択が表示される
    const testSelection = image1Selector.locator('.test-image-selection');
    await expect(testSelection).toBeVisible();
    
    // サブ選択の選択肢確認
    const subSelect = testSelection.locator('select');
    const subOptions = subSelect.locator('option');
    
    await expect(subOptions.nth(0)).toHaveValue('');
    await expect(subOptions.nth(1)).toHaveValue('test');
    await expect(subOptions.nth(1)).toContainText('自動選択');
    await expect(subOptions.nth(2)).toHaveValue('circle');
    await expect(subOptions.nth(3)).toHaveValue('rectangle');
    await expect(subOptions.nth(4)).toHaveValue('triangle');
    
    // 自動選択の説明が画像タイプに応じて変わることを確認
    await expect(subOptions.nth(1)).toContainText('赤い円'); // image1の場合
  });

  test('テスト画像の自動選択が正常に動作する', async ({ page }) => {
    // 各画像タイプで自動選択をテスト
    const testCases = [
      { selector: '画像1', expectedText: '赤い円' },
      { selector: '画像2', expectedText: '青い四角' },
      { selector: '画像3', expectedText: '緑の三角' }
    ];
    
    for (const testCase of testCases) {
      const imageSelector = page.locator('.image-selector').filter({ hasText: testCase.selector });
      const mainSelect = imageSelector.locator('.main-select');
      
      await mainSelect.selectOption('test');
      
      const testSelection = imageSelector.locator('.test-image-selection');
      const subSelect = testSelection.locator('select');
      
      // 自動選択の説明確認
      const autoOption = subSelect.locator('option[value="test"]');
      await expect(autoOption).toContainText(testCase.expectedText);
      
      // 自動選択を実行
      await subSelect.selectOption('test');
      
      // 選択状態の表示確認
      const selectionStatus = imageSelector.locator('.selection-status');
      await expect(selectionStatus).toBeVisible();
      await expect(selectionStatus).toContainText(testCase.expectedText);
    }
  });

  test('特定テスト画像選択が正常に動作する', async ({ page }) => {
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('test');
    
    const testSelection = image1Selector.locator('.test-image-selection');
    const subSelect = testSelection.locator('select');
    
    // 円を選択
    await subSelect.selectOption('circle');
    
    // プレビューが表示される
    const preview = testSelection.locator('.test-image-preview');
    await expect(preview).toBeVisible();
    
    // プレビューの内容確認
    const previewShape = preview.locator('.preview-shape');
    await expect(previewShape).toHaveClass(/shape-circle/);
    await expect(previewShape).toContainText('●');
    
    const previewLabel = preview.locator('.preview-label');
    await expect(previewLabel).toContainText('赤い円');
    
    // 選択状態の表示確認
    const selectionStatus = image1Selector.locator('.selection-status');
    await expect(selectionStatus).toBeVisible();
    await expect(selectionStatus).toContainText('赤い円');
  });

  test('S3画像選択が正常に動作する', async ({ page }) => {
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    // S3画像を選択
    await mainSelect.selectOption('s3');
    
    // S3選択セクションが表示される
    const s3Selection = image1Selector.locator('.s3-image-selection');
    await expect(s3Selection).toBeVisible();
    
    // ヘッダーの確認
    const s3Header = s3Selection.locator('.s3-header');
    await expect(s3Header).toBeVisible();
    
    const subLabel = s3Header.locator('.sub-label');
    await expect(subLabel).toContainText('S3アップロード画像を選択');
    
    // 更新ボタンの確認
    const refreshButton = s3Header.locator('.refresh-button');
    await expect(refreshButton).toBeVisible();
    await expect(refreshButton).toContainText('更新');
  });

  test('S3画像一覧の読み込み状態が正常に表示される', async ({ page }) => {
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    const s3Selection = image1Selector.locator('.s3-image-selection');
    
    // 読み込み中の表示確認
    const loadingState = s3Selection.locator('.loading-state');
    if (await loadingState.isVisible()) {
      await expect(loadingState).toContainText('読み込み中');
      
      const loadingSpinner = loadingState.locator('.loading-spinner');
      await expect(loadingSpinner).toBeVisible();
    }
    
    // 読み込み完了を待機
    await page.waitForTimeout(3000);
    
    // 結果の確認（画像ありまたは空状態）
    const imageGrid = s3Selection.locator('.image-grid');
    const noImagesState = s3Selection.locator('.no-images-state');
    
    const hasImages = await imageGrid.isVisible();
    const isEmpty = await noImagesState.isVisible();
    
    expect(hasImages || isEmpty).toBeTruthy();
  });

  test('S3画像が存在しない場合の表示が正常に動作する', async ({ page }) => {
    // 空のレスポンスをモック
    await page.route('**/upload/images**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          images: [],
          count: 0,
          isTruncated: false
        })
      });
    });
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    const s3Selection = image1Selector.locator('.s3-image-selection');
    
    // 空状態の表示確認
    const noImagesState = s3Selection.locator('.no-images-state');
    await expect(noImagesState).toBeVisible();
    
    const noImagesIcon = noImagesState.locator('.no-images-icon');
    await expect(noImagesIcon).toBeVisible();
    
    await expect(noImagesState).toContainText('アップロードされた画像がありません');
    await expect(noImagesState).toContainText('画像をアップロードしてから選択してください');
  });

  test('S3画像が存在する場合の表示が正常に動作する', async ({ page }) => {
    // 画像データをモック
    const mockImages = [
      {
        key: 'uploads/images/test1.png',
        s3Path: 's3://test-bucket/uploads/images/test1.png',
        fileName: 'test1.png',
        size: 1024000,
        lastModified: new Date().toISOString(),
        contentType: 'image/png',
        thumbnailUrl: 'https://example.com/thumbnail1.png'
      },
      {
        key: 'uploads/images/test2.jpg',
        s3Path: 's3://test-bucket/uploads/images/test2.jpg',
        fileName: 'test2.jpg',
        size: 2048000,
        lastModified: new Date().toISOString(),
        contentType: 'image/jpeg',
        thumbnailUrl: 'https://example.com/thumbnail2.jpg'
      }
    ];
    
    await page.route('**/upload/images**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          images: mockImages,
          count: mockImages.length,
          isTruncated: false
        })
      });
    });
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    const s3Selection = image1Selector.locator('.s3-image-selection');
    
    // 画像グリッドの表示確認
    const imageGrid = s3Selection.locator('.image-grid');
    await expect(imageGrid).toBeVisible();
    
    // 画像アイテムの確認
    const imageItems = imageGrid.locator('.image-item');
    await expect(imageItems).toHaveCount(2);
    
    // 最初の画像アイテムの詳細確認
    const firstItem = imageItems.first();
    
    const thumbnail = firstItem.locator('.image-thumbnail img');
    await expect(thumbnail).toHaveAttribute('src', mockImages[0].thumbnailUrl);
    await expect(thumbnail).toHaveAttribute('alt', mockImages[0].fileName);
    
    const imageName = firstItem.locator('.image-name');
    await expect(imageName).toContainText(mockImages[0].fileName);
    
    const imageSize = firstItem.locator('.image-size');
    await expect(imageSize).toContainText('1.0 MB');
    
    const imageDate = firstItem.locator('.image-date');
    await expect(imageDate).toContainText('今日');
  });

  test('S3画像選択が正常に動作する', async ({ page }) => {
    // 画像データをモック
    const mockImages = [
      {
        key: 'uploads/images/selected-test.png',
        s3Path: 's3://test-bucket/uploads/images/selected-test.png',
        fileName: 'selected-test.png',
        size: 1024000,
        lastModified: new Date().toISOString(),
        contentType: 'image/png',
        thumbnailUrl: 'https://example.com/selected-thumbnail.png'
      }
    ];
    
    await page.route('**/upload/images**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          images: mockImages,
          count: mockImages.length,
          isTruncated: false
        })
      });
    });
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    const s3Selection = image1Selector.locator('.s3-image-selection');
    const imageGrid = s3Selection.locator('.image-grid');
    const imageItem = imageGrid.locator('.image-item').first();
    
    // 画像を選択
    await imageItem.click();
    
    // 選択状態の確認
    await expect(imageItem).toHaveClass(/selected/);
    
    // 選択オーバーレイの確認
    const selectedOverlay = imageItem.locator('.selected-overlay');
    await expect(selectedOverlay).toBeVisible();
    
    const selectedIcon = selectedOverlay.locator('.selected-icon');
    await expect(selectedIcon).toContainText('✓');
    
    // 選択状態表示の確認
    const selectionStatus = image1Selector.locator('.selection-status');
    await expect(selectionStatus).toBeVisible();
    await expect(selectionStatus).toContainText('selected-test.png');
  });

  test('1画像・2画像・3画像モード切り替えが正常に動作する', async ({ page }) => {
    const generateButton = page.locator('.generate-button');
    
    // 初期状態：画像1,2が選択済み、画像3は未選択 → 2画像モード
    await expect(generateButton).toContainText('2画像を合成');
    
    // 画像3を選択 → 3画像モード
    const image3Selector = page.locator('.image-selector').filter({ hasText: '画像3' });
    const mainSelect3 = image3Selector.locator('.main-select');
    
    await mainSelect3.selectOption('test');
    await expect(generateButton).toContainText('3画像を合成');
    
    // 設定テーブルで画像3が有効になることを確認
    const configTable = page.locator('.config-table');
    const image3Header = configTable.locator('th').filter({ hasText: '画像3' });
    await expect(image3Header).not.toHaveClass(/disabled-header/);
    
    // 画像3の入力フィールドが有効になることを確認
    const image3XInput = configTable.locator('input').nth(4); // 画像3のX座標入力
    await expect(image3XInput).not.toBeDisabled();
    
    // 画像2を未選択にする → 1画像モード（実際には2画像必須なので無効状態）
    const image2Selector = page.locator('.image-selector').filter({ hasText: '画像2' });
    const mainSelect2 = image2Selector.locator('.main-select');
    
    await mainSelect2.selectOption('');
    
    // 生成ボタンが無効になることを確認
    await expect(generateButton).toBeDisabled();
    
    // 画像2を再選択 → 3画像モードに戻る
    await mainSelect2.selectOption('test');
    await expect(generateButton).toContainText('3画像を合成');
    await expect(generateButton).not.toBeDisabled();
  });

  test('更新ボタンが正常に動作する', async ({ page }) => {
    let requestCount = 0;
    
    await page.route('**/upload/images**', route => {
      requestCount++;
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          images: [],
          count: 0,
          isTruncated: false
        })
      });
    });
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    // 初回読み込み
    expect(requestCount).toBe(1);
    
    const s3Selection = image1Selector.locator('.s3-image-selection');
    const refreshButton = s3Selection.locator('.refresh-button');
    
    // 更新ボタンをクリック
    await refreshButton.click();
    
    // 2回目のリクエストが発生することを確認
    await page.waitForTimeout(1000);
    expect(requestCount).toBe(2);
  });

  test('ページネーション機能が正常に動作する', async ({ page }) => {
    // 最初のページのモック
    const firstPageImages = Array.from({ length: 20 }, (_, i) => ({
      key: `uploads/images/page1-${i}.png`,
      s3Path: `s3://test-bucket/uploads/images/page1-${i}.png`,
      fileName: `page1-${i}.png`,
      size: 1024000,
      lastModified: new Date().toISOString(),
      contentType: 'image/png',
      thumbnailUrl: `https://example.com/page1-${i}.png`
    }));
    
    let isFirstRequest = true;
    
    await page.route('**/upload/images**', route => {
      if (isFirstRequest) {
        isFirstRequest = false;
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            images: firstPageImages,
            count: firstPageImages.length,
            isTruncated: true,
            nextContinuationToken: 'next-token-123'
          })
        });
      } else {
        // 2ページ目のモック
        const secondPageImages = Array.from({ length: 5 }, (_, i) => ({
          key: `uploads/images/page2-${i}.png`,
          s3Path: `s3://test-bucket/uploads/images/page2-${i}.png`,
          fileName: `page2-${i}.png`,
          size: 1024000,
          lastModified: new Date().toISOString(),
          contentType: 'image/png',
          thumbnailUrl: `https://example.com/page2-${i}.png`
        }));
        
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            images: secondPageImages,
            count: secondPageImages.length,
            isTruncated: false
          })
        });
      }
    });
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    const s3Selection = image1Selector.locator('.s3-image-selection');
    const imageGrid = s3Selection.locator('.image-grid');
    
    // 最初のページの画像が表示されることを確認
    const imageItems = imageGrid.locator('.image-item');
    await expect(imageItems).toHaveCount(20);
    
    // ページネーションボタンの確認
    const pagination = s3Selection.locator('.pagination');
    await expect(pagination).toBeVisible();
    
    const loadMoreButton = pagination.locator('.load-more-button');
    await expect(loadMoreButton).toBeVisible();
    await expect(loadMoreButton).toContainText('さらに読み込む');
    
    // さらに読み込むボタンをクリック
    await loadMoreButton.click();
    
    // 2ページ目の画像が追加されることを確認
    await expect(imageItems).toHaveCount(25);
    
    // ページネーションボタンが非表示になることを確認
    await expect(pagination).not.toBeVisible();
  });

  test('エラーハンドリングが正常に動作する', async ({ page }) => {
    // エラーレスポンスをモック
    await page.route('**/upload/images**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Internal Server Error'
        })
      });
    });
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    // エラーメッセージが表示されることを確認
    const errorMessage = image1Selector.locator('.error-message');
    await expect(errorMessage).toBeVisible();
    
    const errorIcon = errorMessage.locator('.error-icon');
    await expect(errorIcon).toContainText('⚠️');
    
    const errorContent = errorMessage.locator('.error-content');
    await expect(errorContent).toContainText('S3画像の読み込みに失敗しました');
    
    // エラー解除ボタンの動作確認
    const dismissButton = errorMessage.locator('.error-dismiss');
    await expect(dismissButton).toBeVisible();
    
    await dismissButton.click();
    await expect(errorMessage).not.toBeVisible();
  });

  test('ファイル名の切り詰め表示が正常に動作する', async ({ page }) => {
    // 長いファイル名の画像をモック
    const longFileName = 'very-long-image-file-name-that-should-be-truncated-for-display.png';
    const mockImages = [
      {
        key: `uploads/images/${longFileName}`,
        s3Path: `s3://test-bucket/uploads/images/${longFileName}`,
        fileName: longFileName,
        size: 1024000,
        lastModified: new Date().toISOString(),
        contentType: 'image/png',
        thumbnailUrl: 'https://example.com/long-name-thumbnail.png'
      }
    ];
    
    await page.route('**/upload/images**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          images: mockImages,
          count: mockImages.length,
          isTruncated: false
        })
      });
    });
    
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    const mainSelect = image1Selector.locator('.main-select');
    
    await mainSelect.selectOption('s3');
    
    const s3Selection = image1Selector.locator('.s3-image-selection');
    const imageGrid = s3Selection.locator('.image-grid');
    const imageItem = imageGrid.locator('.image-item').first();
    
    // ファイル名が切り詰められて表示されることを確認
    const imageName = imageItem.locator('.image-name');
    const displayedName = await imageName.textContent();
    
    expect(displayedName).not.toBe(longFileName);
    expect(displayedName?.length).toBeLessThan(longFileName.length);
    expect(displayedName).toContain('...');
    expect(displayedName).toContain('.png');
    
    // title属性に完全なファイル名が設定されることを確認
    await expect(imageName).toHaveAttribute('title', longFileName);
  });
});

test.describe('画像選択の統合テスト', () => {
  
  test.beforeEach(async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await page.waitForLoadState('networkidle');
  });

  test('複数の画像選択コンポーネントが独立して動作する', async ({ page }) => {
    // 画像1でテスト画像を選択
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    await image1Selector.locator('.main-select').selectOption('test');
    
    // 画像2でS3画像を選択
    const image2Selector = page.locator('.image-selector').filter({ hasText: '画像2' });
    await image2Selector.locator('.main-select').selectOption('s3');
    
    // 画像3で特定のテスト画像を選択
    const image3Selector = page.locator('.image-selector').filter({ hasText: '画像3' });
    await image3Selector.locator('.main-select').selectOption('test');
    
    const testSelection3 = image3Selector.locator('.test-image-selection');
    await testSelection3.locator('select').selectOption('triangle');
    
    // 各選択が独立して動作することを確認
    await expect(image1Selector.locator('.test-image-selection')).toBeVisible();
    await expect(image2Selector.locator('.s3-image-selection')).toBeVisible();
    await expect(image3Selector.locator('.test-image-preview')).toBeVisible();
    
    // 生成ボタンが3画像モードになることを確認
    const generateButton = page.locator('.generate-button');
    await expect(generateButton).toContainText('3画像を合成');
  });

  test('選択状態の保持と復元が正常に動作する', async ({ page }) => {
    // 画像1で特定のテスト画像を選択
    const image1Selector = page.locator('.image-selector').filter({ hasText: '画像1' });
    await image1Selector.locator('.main-select').selectOption('test');
    
    const testSelection = image1Selector.locator('.test-image-selection');
    await testSelection.locator('select').selectOption('rectangle');
    
    // 選択状態の確認
    await expect(image1Selector.locator('.selection-status')).toContainText('青い四角');
    
    // 他の選択に変更
    await image1Selector.locator('.main-select').selectOption('s3');
    
    // 元の選択に戻す
    await image1Selector.locator('.main-select').selectOption('test');
    
    // 選択状態が復元されることを確認
    const subSelect = testSelection.locator('select');
    await expect(subSelect).toHaveValue('rectangle');
    await expect(image1Selector.locator('.selection-status')).toContainText('青い四角');
  });
});