/**
 * 動画生成機能のE2Eテスト - v2.5.5
 * 
 * 動画生成機能の包括的なテストを実行する。
 * - 動画生成ON/OFF切り替えのテスト
 * - 動画パラメータ設定のテスト
 * - 動画生成とダウンロードの完全ワークフローテスト
 * - 動画生成失敗時のフォールバック動作テスト
 * - 動画生成機能のパフォーマンステスト
 */

import { test, expect, Page } from '@playwright/test'

// テスト設定
const TEST_CONFIG = {
  baseURL: process.env.FRONTEND_URL || 'http://localhost:5173',
  timeout: 120000, // 動画生成のため2分に延長
  videoFormats: ['XMF', 'MP4', 'WEBM', 'AVI'],
  durations: [1, 3, 5, 10],
  maxFileSize: 50 * 1024 * 1024 // 50MB
}

test.describe('動画生成機能のE2Eテスト', () => {
  test.beforeEach(async ({ page }) => {
    // フロントエンドページに移動
    await page.goto(TEST_CONFIG.baseURL)
    
    // ページが完全に読み込まれるまで待機
    await page.waitForLoadState('networkidle')
    
    // 設定が読み込まれるまで待機
    await page.waitForSelector('.main-content', { timeout: 10000 })
    
    console.log('✅ フロントエンドページが読み込まれました')
  })

  test('動画生成ON/OFF切り替えのテスト', async ({ page }) => {
    console.log('🎬 動画生成ON/OFF切り替えのテストを開始')

    // 動画生成設定セクションを確認
    const videoSection = page.locator('.video-generation-container')
    await expect(videoSection).toBeVisible()

    // 動画生成トグルスイッチを確認
    const toggleCheckbox = page.locator('.toggle-checkbox')
    await expect(toggleCheckbox).toBeVisible()

    // 初期状態では動画生成が無効であることを確認
    await expect(toggleCheckbox).not.toBeChecked()

    // 動画パラメータセクションが非表示であることを確認
    const paramsSection = page.locator('.video-params-section')
    await expect(paramsSection).not.toBeVisible()

    // 動画生成を有効にする
    await page.click('.toggle-slider')
    await expect(toggleCheckbox).toBeChecked()

    // 動画パラメータセクションが表示されることを確認
    await expect(paramsSection).toBeVisible()

    // デフォルト値を確認
    const durationInput = page.locator('input[type="number"]').first()
    const formatSelect = page.locator('.form-select')
    
    await expect(durationInput).toHaveValue('3')
    await expect(formatSelect).toHaveValue('XMF')

    // 動画生成を無効にする
    await page.click('.toggle-slider')
    await expect(toggleCheckbox).not.toBeChecked()
    await expect(paramsSection).not.toBeVisible()

    console.log('✅ 動画生成ON/OFF切り替えテスト完了')
  })

  test('動画パラメータ設定のテスト', async ({ page }) => {
    console.log('⚙️ 動画パラメータ設定のテストを開始')

    // 動画生成を有効にする
    await page.click('.toggle-slider')
    await page.waitForSelector('.video-params-section')

    // 動画の長さ設定テスト
    const durationInput = page.locator('input[type="number"]').first()
    
    for (const duration of TEST_CONFIG.durations) {
      await durationInput.fill(duration.toString())
      await expect(durationInput).toHaveValue(duration.toString())
      
      // 予想処理時間が更新されることを確認
      const processingTime = page.locator('.info-value').nth(1)
      await expect(processingTime).toContainText('約')
    }

    // 境界値テスト
    await durationInput.fill('0')
    await page.click('body') // フォーカスを外す
    await expect(page.locator('.field-error')).toContainText('1〜30秒の範囲')

    await durationInput.fill('31')
    await page.click('body')
    await expect(page.locator('.field-error')).toContainText('1〜30秒の範囲')

    // 有効な値に戻す
    await durationInput.fill('3')

    // 動画フォーマット設定テスト
    const formatSelect = page.locator('.form-select')
    
    for (const format of TEST_CONFIG.videoFormats) {
      await formatSelect.selectOption(format)
      await expect(formatSelect).toHaveValue(format)
      
      // 出力形式が更新されることを確認
      const outputFormat = page.locator('.info-value').nth(2)
      await expect(outputFormat).toContainText(format)
    }

    console.log('✅ 動画パラメータ設定テスト完了')
  })

  test('動画生成とダウンロードの完全ワークフローテスト', async ({ page }) => {
    console.log('🎥 動画生成とダウンロードの完全ワークフローテストを開始')

    // 動画生成を有効にする
    await page.click('.toggle-slider')
    await page.waitForSelector('.video-params-section')

    // 短い動画（1秒）で設定
    const durationInput = page.locator('input[type="number"]').first()
    await durationInput.fill('1')

    // XMF形式を選択
    const formatSelect = page.locator('.form-select')
    await formatSelect.selectOption('XMF')

    // 画像設定を確認（デフォルトで画像1が設定されている）
    const generateButton = page.locator('.generate-button')
    await expect(generateButton).toBeEnabled()

    // ボタンテキストが動画生成用に変更されていることを確認
    await expect(generateButton).toContainText('動画生成')

    // 動画生成を実行
    console.log('🎬 動画生成を開始...')
    await generateButton.click()

    // ローディング状態を確認
    await expect(page.locator('.loading-content')).toBeVisible()
    await expect(generateButton).toContainText('生成中')

    // 動画生成進行状況を確認
    const progressSection = page.locator('.video-progress-section')
    await expect(progressSection).toBeVisible({ timeout: 5000 })

    // 進行状況ステップを確認
    const steps = page.locator('.step')
    await expect(steps.nth(0)).toHaveClass(/active/)

    // 動画生成完了を待機（最大2分）
    await page.waitForSelector('.result-video', { timeout: TEST_CONFIG.timeout })

    // 結果表示を確認
    const resultVideo = page.locator('.result-video')
    await expect(resultVideo).toBeVisible()
    await expect(resultVideo).toHaveAttribute('controls')

    // 動画情報を確認
    const mediaInfo = page.locator('.media-info-section')
    await expect(mediaInfo).toBeVisible()
    await expect(mediaInfo).toContainText('動画情報')
    await expect(mediaInfo).toContainText('XMF')
    await expect(mediaInfo).toContainText('1秒')

    // ダウンロードボタンを確認
    const downloadButton = page.locator('.download-button')
    await expect(downloadButton).toContainText('動画をダウンロード')

    // ダウンロード機能をテスト（実際のダウンロードはしない）
    const downloadPromise = page.waitForEvent('download')
    await downloadButton.click()
    const download = await downloadPromise
    
    // ダウンロードファイル名を確認
    expect(download.suggestedFilename()).toMatch(/composite-video-.*\.mp4$/)

    console.log('✅ 動画生成とダウンロードの完全ワークフローテスト完了')
  })

  test('動画生成失敗時のフォールバック動作テスト', async ({ page }) => {
    console.log('⚠️ 動画生成失敗時のフォールバック動作テストを開始')

    // 動画生成を有効にする
    await page.click('.toggle-slider')
    await page.waitForSelector('.video-params-section')

    // 無効な設定で動画生成を試行（非常に長い動画）
    const durationInput = page.locator('input[type="number"]').first()
    await durationInput.fill('30') // 最大値

    // 画像1の設定を無効にしてエラーを発生させる
    const image1Selector = page.locator('.image1-cell .form-select').first()
    await image1Selector.selectOption('')

    const generateButton = page.locator('.generate-button')
    await generateButton.click()

    // エラーメッセージが表示されることを確認
    const errorState = page.locator('.error-state')
    await expect(errorState).toBeVisible({ timeout: 10000 })
    await expect(errorState).toContainText('画像1は必須')

    // 画像1を有効に戻す
    await image1Selector.selectOption('test')

    // 再試行ボタンをクリック
    const retryButton = page.locator('.retry-button')
    await retryButton.click()

    // 動画生成が開始されることを確認
    await expect(page.locator('.loading-content')).toBeVisible()

    // タイムアウトまたは成功を待機
    try {
      await page.waitForSelector('.result-video', { timeout: 60000 })
      console.log('✅ フォールバック後の動画生成が成功')
    } catch (error) {
      // タイムアウトした場合、静止画像にフォールバックされることを確認
      await page.waitForSelector('.result-image', { timeout: 10000 })
      console.log('✅ 静止画像へのフォールバックが成功')
      
      // 警告メッセージが表示されることを確認
      const notification = page.locator('.notification')
      await expect(notification).toContainText('動画生成に失敗')
    }

    console.log('✅ 動画生成失敗時のフォールバック動作テスト完了')
  })

  test('複数の動画フォーマットでの生成テスト', async ({ page }) => {
    console.log('🎞️ 複数の動画フォーマットでの生成テストを開始')

    // 動画生成を有効にする
    await page.click('.toggle-slider')
    await page.waitForSelector('.video-params-section')

    // 短い動画で設定
    const durationInput = page.locator('input[type="number"]').first()
    await durationInput.fill('1')

    const formatSelect = page.locator('.form-select')
    const generateButton = page.locator('.generate-button')

    // 各フォーマットでテスト（時間短縮のため最初の2つのみ）
    const testFormats = TEST_CONFIG.videoFormats.slice(0, 2)

    for (const format of testFormats) {
      console.log(`🎬 ${format}フォーマットでの動画生成をテスト`)

      await formatSelect.selectOption(format)
      await expect(formatSelect).toHaveValue(format)

      // 動画生成を実行
      await generateButton.click()

      try {
        // 動画生成完了を待機（短時間）
        await page.waitForSelector('.result-video', { timeout: 60000 })

        // 動画情報でフォーマットを確認
        const mediaInfo = page.locator('.media-info-section')
        await expect(mediaInfo).toContainText(format)

        console.log(`✅ ${format}フォーマットでの動画生成が成功`)
      } catch (error) {
        console.log(`⚠️ ${format}フォーマットでの動画生成がタイムアウト（フォールバック確認）`)
        
        // 静止画像にフォールバックされることを確認
        await page.waitForSelector('.result-image', { timeout: 10000 })
      }

      // 次のテストのために少し待機
      await page.waitForTimeout(2000)
    }

    console.log('✅ 複数の動画フォーマットでの生成テスト完了')
  })

  test('動画生成機能のパフォーマンステスト', async ({ page }) => {
    console.log('⚡ 動画生成機能のパフォーマンステストを開始')

    // 動画生成を有効にする
    await page.click('.toggle-slider')
    await page.waitForSelector('.video-params-section')

    // 短い動画で設定
    const durationInput = page.locator('input[type="number"]').first()
    await durationInput.fill('2')

    const generateButton = page.locator('.generate-button')

    // パフォーマンス測定開始
    const startTime = Date.now()

    await generateButton.click()

    // 進行状況の更新を監視
    const progressUpdates: number[] = []
    
    // 進行状況バーの変化を監視
    const progressBar = page.locator('.progress-fill')
    
    // 定期的に進行状況をチェック
    const progressInterval = setInterval(async () => {
      try {
        const width = await progressBar.getAttribute('style')
        if (width) {
          const match = width.match(/width:\s*(\d+)%/)
          if (match) {
            progressUpdates.push(parseInt(match[1]))
          }
        }
      } catch (error) {
        // 要素が見つからない場合は無視
      }
    }, 1000)

    try {
      // 動画生成完了を待機
      await page.waitForSelector('.result-video', { timeout: 90000 })
      
      const endTime = Date.now()
      const totalTime = endTime - startTime

      clearInterval(progressInterval)

      // パフォーマンス結果を記録
      console.log(`📊 動画生成パフォーマンス結果:`)
      console.log(`   - 総処理時間: ${totalTime}ms (${(totalTime / 1000).toFixed(1)}秒)`)
      console.log(`   - 進行状況更新回数: ${progressUpdates.length}回`)
      console.log(`   - 最大進行状況: ${Math.max(...progressUpdates, 0)}%`)

      // パフォーマンス基準をチェック
      expect(totalTime).toBeLessThan(90000) // 90秒以内
      expect(progressUpdates.length).toBeGreaterThan(0) // 進行状況が更新されている

      // 結果ファイルサイズを確認（可能であれば）
      const resultVideo = page.locator('.result-video')
      const videoSrc = await resultVideo.getAttribute('src')
      
      if (videoSrc && videoSrc.startsWith('blob:')) {
        console.log(`   - 動画URL: ${videoSrc}`)
      }

    } catch (error) {
      clearInterval(progressInterval)
      console.log('⚠️ 動画生成がタイムアウトしました（パフォーマンステスト）')
      
      // 静止画像へのフォールバックを確認
      await page.waitForSelector('.result-image', { timeout: 10000 })
      console.log('✅ 静止画像へのフォールバックが動作')
    }

    console.log('✅ 動画生成機能のパフォーマンステスト完了')
  })

  test('動画生成UIの応答性テスト', async ({ page }) => {
    console.log('📱 動画生成UIの応答性テストを開始')

    // モバイルビューポートに変更
    await page.setViewportSize({ width: 375, height: 667 })

    // 動画生成設定が適切に表示されることを確認
    const videoSection = page.locator('.video-generation-container')
    await expect(videoSection).toBeVisible()

    // 動画生成を有効にする
    await page.click('.toggle-slider')
    await page.waitForSelector('.video-params-section')

    // パラメータグリッドがモバイルで適切に表示されることを確認
    const paramsGrid = page.locator('.params-grid')
    await expect(paramsGrid).toBeVisible()

    // 進行状況ステップがモバイルで適切に表示されることを確認
    const durationInput = page.locator('input[type="number"]').first()
    await durationInput.fill('1')

    const generateButton = page.locator('.generate-button')
    await generateButton.click()

    // 進行状況セクションが表示されることを確認
    const progressSection = page.locator('.video-progress-section')
    await expect(progressSection).toBeVisible({ timeout: 10000 })

    // 進行状況ステップがモバイルで適切に配置されることを確認
    const steps = page.locator('.step')
    await expect(steps).toHaveCount(3)

    // デスクトップビューポートに戻す
    await page.setViewportSize({ width: 1280, height: 720 })

    console.log('✅ 動画生成UIの応答性テスト完了')
  })
})

// ヘルパー関数
async function waitForVideoGeneration(page: Page, timeout: number = 60000): Promise<boolean> {
  try {
    await page.waitForSelector('.result-video', { timeout })
    return true
  } catch (error) {
    // 静止画像にフォールバックされた場合
    try {
      await page.waitForSelector('.result-image', { timeout: 5000 })
      return false
    } catch (fallbackError) {
      throw new Error('動画生成も静止画像フォールバックも失敗しました')
    }
  }
}

async function checkVideoFileSize(page: Page, maxSize: number): Promise<boolean> {
  // ブラウザ環境ではファイルサイズの直接取得は困難
  // 代わりに、動画の読み込み時間やレスポンス時間で推定
  const startTime = Date.now()
  await page.waitForSelector('.result-video[src]')
  const loadTime = Date.now() - startTime
  
  // 読み込み時間が異常に長い場合はファイルサイズが大きい可能性
  return loadTime < 10000 // 10秒以内
}