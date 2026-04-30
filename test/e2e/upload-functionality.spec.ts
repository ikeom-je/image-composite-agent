/**
 * 画像アップロード機能のE2Eテスト
 *
 * 対象ページ: /api（API Demo）の ImageUploader コンポーネント
 * 現在のUI構造に存在するセレクタのみ使用する。
 */
import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

test.describe('画像アップロード機能（/api ページ）', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/api`);
    await page.waitForLoadState('networkidle');
  });

  test('アップロードコンポーネントが正しく表示される', async ({ page }) => {
    // ImageUploader 内の主要要素
    await expect(page.locator('.upload-area')).toBeVisible();

    const uploadButton = page.locator('button.upload-button');
    await expect(uploadButton).toBeVisible();
    await expect(uploadButton).toContainText('画像ファイルを選択');

    const hint = page.locator('.upload-hint');
    await expect(hint).toContainText('ドラッグ');

    const constraints = page.locator('.file-constraints');
    await expect(constraints).toBeVisible();
    await expect(constraints).toContainText('10MB');
  });

  test('ファイルinput（image/* accept）が存在する（hidden）', async ({ page }) => {
    const fileInput = page.locator('input[type="file"][accept="image/*"]');
    await expect(fileInput).toHaveCount(1);
    // display: none で隠されている
    await expect(fileInput).toBeHidden();
  });

  test('S3アップロードAPIエラー時にエラーメッセージが表示される', async ({ page }) => {
    // 署名付きURL生成APIを500でモック
    await page.route('**/upload/presigned-url**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Upload service unavailable' }),
      });
    });

    // ファイルチューザーを介して画像を投入
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('button.upload-button').click(),
    ]);

    await fileChooser.setFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        'base64'
      ),
    });

    // ImageUploader の error-message が表示される
    const errorMessage = page.locator('.image-uploader .error-message').first();
    await expect(errorMessage).toBeVisible({ timeout: 15000 });
  });
});
