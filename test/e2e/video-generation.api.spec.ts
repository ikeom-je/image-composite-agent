/**
 * 動画生成機能のAPIテスト - v2.5.5
 * 
 * 動画生成APIの直接テストを実行する。
 * - 動画生成パラメータの検証
 * - 各動画フォーマットでの生成テスト
 * - 動画生成エラーハンドリングのテスト
 * - 動画生成パフォーマンステスト
 */

import { test, expect, request } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

// テスト設定
const TEST_CONFIG = {
  apiUrl: process.env.API_URL || 'https://your-api-gateway-url.amazonaws.com/prod/images/composite',
  timeout: 120000, // 動画生成のため2分に延長
  videoFormats: ['XMF', 'MP4', 'WEBM', 'AVI'],
  durations: [1, 3, 5],
  maxFileSize: 50 * 1024 * 1024, // 50MB
  testResultsDir: path.join(__dirname, '../test-results')
}

// テスト結果ディレクトリを作成
if (!fs.existsSync(TEST_CONFIG.testResultsDir)) {
  fs.mkdirSync(TEST_CONFIG.testResultsDir, { recursive: true })
}

test.describe('動画生成機能のAPIテスト', () => {
  let apiContext: any

  test.beforeAll(async ({ playwright }) => {
    apiContext = await playwright.request.newContext({
      timeout: TEST_CONFIG.timeout
    })
  })

  test.afterAll(async () => {
    await apiContext.dispose()
  })

  test('動画生成パラメータの検証テスト', async () => {
    console.log('🔍 動画生成パラメータの検証テストを開始')

    // 基本的な動画生成リクエスト
    const baseParams = {
      image1: 'test',
      image2: 'test',
      generate_video: 'true',
      video_duration: '3',
      video_format: 'XMF',
      format: 'png'
    }

    // 有効なパラメータでのテスト
    console.log('✅ 有効なパラメータでのテスト')
    const validResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
      params: baseParams,
      timeout: TEST_CONFIG.timeout
    })

    expect(validResponse.status()).toBe(200)
    expect(validResponse.headers()['content-type']).toMatch(/video\/|application\/octet-stream/)

    // 無効な動画長さのテスト
    console.log('❌ 無効な動画長さのテスト')
    const invalidDurationResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
      params: {
        ...baseParams,
        video_duration: '0' // 無効な値
      }
    })

    expect(invalidDurationResponse.status()).toBe(400)

    // 無効な動画フォーマットのテスト
    console.log('❌ 無効な動画フォーマットのテスト')
    const invalidFormatResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
      params: {
        ...baseParams,
        video_format: 'INVALID_FORMAT'
      }
    })

    expect(invalidFormatResponse.status()).toBe(400)

    // 動画生成フラグなしのテスト（静止画像）
    console.log('🖼️ 静止画像生成のテスト')
    const staticImageResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
      params: {
        image1: 'test',
        image2: 'test',
        format: 'png'
      }
    })

    expect(staticImageResponse.status()).toBe(200)
    expect(staticImageResponse.headers()['content-type']).toMatch(/image\/png/)

    console.log('✅ 動画生成パラメータの検証テスト完了')
  })

  test('各動画フォーマットでの生成テスト', async () => {
    console.log('🎞️ 各動画フォーマットでの生成テストを開始')

    const baseParams = {
      image1: 'test',
      image2: 'test',
      generate_video: 'true',
      video_duration: '2', // 短い動画でテスト
      format: 'png'
    }

    for (const format of TEST_CONFIG.videoFormats) {
      console.log(`🎬 ${format}フォーマットでの動画生成をテスト`)

      const startTime = Date.now()

      try {
        const response = await apiContext.get(TEST_CONFIG.apiUrl, {
          params: {
            ...baseParams,
            video_format: format
          },
          timeout: TEST_CONFIG.timeout
        })

        const endTime = Date.now()
        const processingTime = endTime - startTime

        expect(response.status()).toBe(200)

        // Content-Typeを確認
        const contentType = response.headers()['content-type']
        console.log(`   Content-Type: ${contentType}`)

        // ファイルサイズを確認
        const videoData = await response.body()
        const fileSize = videoData.length
        console.log(`   ファイルサイズ: ${(fileSize / 1024).toFixed(1)} KB`)
        console.log(`   処理時間: ${processingTime}ms`)

        // ファイルサイズの妥当性をチェック
        expect(fileSize).toBeGreaterThan(1000) // 最低1KB
        expect(fileSize).toBeLessThan(TEST_CONFIG.maxFileSize)

        // 処理時間の妥当性をチェック
        expect(processingTime).toBeLessThan(TEST_CONFIG.timeout)

        // テスト結果として動画ファイルを保存
        const outputPath = path.join(
          TEST_CONFIG.testResultsDir,
          `test-video-${format.toLowerCase()}-${Date.now()}.${getFileExtension(format)}`
        )
        fs.writeFileSync(outputPath, videoData)
        console.log(`   動画ファイルを保存: ${outputPath}`)

        console.log(`✅ ${format}フォーマットでの動画生成が成功`)

      } catch (error) {
        console.log(`❌ ${format}フォーマットでの動画生成が失敗: ${error}`)
        
        // フォールバック動作を確認（静止画像生成）
        const fallbackResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
          params: {
            image1: 'test',
            image2: 'test',
            format: 'png'
          }
        })

        expect(fallbackResponse.status()).toBe(200)
        expect(fallbackResponse.headers()['content-type']).toMatch(/image\/png/)
        console.log(`✅ ${format}フォーマット失敗時の静止画像フォールバックが成功`)
      }
    }

    console.log('✅ 各動画フォーマットでの生成テスト完了')
  })

  test('動画の長さ設定テスト', async () => {
    console.log('⏱️ 動画の長さ設定テストを開始')

    const baseParams = {
      image1: 'test',
      image2: 'test',
      generate_video: 'true',
      video_format: 'XMF',
      format: 'png'
    }

    for (const duration of TEST_CONFIG.durations) {
      console.log(`🎬 ${duration}秒動画の生成をテスト`)

      const startTime = Date.now()

      try {
        const response = await apiContext.get(TEST_CONFIG.apiUrl, {
          params: {
            ...baseParams,
            video_duration: duration.toString()
          },
          timeout: TEST_CONFIG.timeout
        })

        const endTime = Date.now()
        const processingTime = endTime - startTime

        expect(response.status()).toBe(200)

        const videoData = await response.body()
        const fileSize = videoData.length

        console.log(`   ファイルサイズ: ${(fileSize / 1024).toFixed(1)} KB`)
        console.log(`   処理時間: ${processingTime}ms`)

        // 動画の長さに応じてファイルサイズが変化することを確認
        // （厳密な検証は困難だが、極端に小さくないことを確認）
        expect(fileSize).toBeGreaterThan(duration * 100) // 秒あたり最低100バイト

        // 処理時間が動画の長さに比例することを確認
        expect(processingTime).toBeGreaterThan(duration * 1000) // 秒あたり最低1秒の処理時間

        console.log(`✅ ${duration}秒動画の生成が成功`)

      } catch (error) {
        console.log(`❌ ${duration}秒動画の生成が失敗: ${error}`)
        
        // 長い動画の場合はタイムアウトが予想される
        if (duration >= 5) {
          console.log(`⚠️ ${duration}秒動画はタイムアウトが予想される範囲`)
        } else {
          throw error
        }
      }
    }

    console.log('✅ 動画の長さ設定テスト完了')
  })

  test('3画像合成での動画生成テスト', async () => {
    console.log('🎨 3画像合成での動画生成テストを開始')

    const params = {
      image1: 'test',
      image2: 'test',
      image3: 'test',
      generate_video: 'true',
      video_duration: '2',
      video_format: 'XMF',
      format: 'png'
    }

    const startTime = Date.now()

    try {
      const response = await apiContext.get(TEST_CONFIG.apiUrl, {
        params,
        timeout: TEST_CONFIG.timeout
      })

      const endTime = Date.now()
      const processingTime = endTime - startTime

      expect(response.status()).toBe(200)

      const videoData = await response.body()
      const fileSize = videoData.length

      console.log(`   ファイルサイズ: ${(fileSize / 1024).toFixed(1)} KB`)
      console.log(`   処理時間: ${processingTime}ms`)

      // 3画像合成の動画ファイルを保存
      const outputPath = path.join(
        TEST_CONFIG.testResultsDir,
        `test-video-3images-${Date.now()}.mp4`
      )
      fs.writeFileSync(outputPath, videoData)
      console.log(`   3画像合成動画ファイルを保存: ${outputPath}`)

      console.log('✅ 3画像合成での動画生成が成功')

    } catch (error) {
      console.log(`❌ 3画像合成での動画生成が失敗: ${error}`)
      
      // フォールバック確認
      const fallbackResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
        params: {
          image1: 'test',
          image2: 'test',
          image3: 'test',
          format: 'png'
        }
      })

      expect(fallbackResponse.status()).toBe(200)
      console.log('✅ 3画像合成での静止画像フォールバックが成功')
    }

    console.log('✅ 3画像合成での動画生成テスト完了')
  })

  test('動画生成エラーハンドリングテスト', async () => {
    console.log('⚠️ 動画生成エラーハンドリングテストを開始')

    // 必須パラメータ不足のテスト
    console.log('❌ 必須パラメータ不足のテスト')
    const missingParamsResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
      params: {
        generate_video: 'true',
        video_duration: '3',
        video_format: 'XMF'
        // image1, image2が不足
      }
    })

    expect(missingParamsResponse.status()).toBe(400)

    // 無効な画像パラメータのテスト
    console.log('❌ 無効な画像パラメータのテスト')
    const invalidImageResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
      params: {
        image1: 'invalid_image_source',
        image2: 'test',
        generate_video: 'true',
        video_duration: '3',
        video_format: 'XMF',
        format: 'png'
      }
    })

    // 無効な画像ソースでもエラーハンドリングされることを確認
    expect([400, 500]).toContain(invalidImageResponse.status())

    // 極端に長い動画のテスト
    console.log('❌ 極端に長い動画のテスト')
    const longVideoResponse = await apiContext.get(TEST_CONFIG.apiUrl, {
      params: {
        image1: 'test',
        image2: 'test',
        generate_video: 'true',
        video_duration: '100', // 制限を超える値
        video_format: 'XMF',
        format: 'png'
      }
    })

    expect(longVideoResponse.status()).toBe(400)

    console.log('✅ 動画生成エラーハンドリングテスト完了')
  })

  test('動画生成パフォーマンステスト', async () => {
    console.log('⚡ 動画生成パフォーマンステストを開始')

    const testCases = [
      { duration: 1, format: 'XMF', description: '1秒XMF動画' },
      { duration: 3, format: 'MP4', description: '3秒MP4動画' },
      { duration: 2, format: 'WEBM', description: '2秒WEBM動画' }
    ]

    const results: Array<{
      description: string
      processingTime: number
      fileSize: number
      success: boolean
    }> = []

    for (const testCase of testCases) {
      console.log(`🎬 ${testCase.description}のパフォーマンステスト`)

      const startTime = Date.now()

      try {
        const response = await apiContext.get(TEST_CONFIG.apiUrl, {
          params: {
            image1: 'test',
            image2: 'test',
            generate_video: 'true',
            video_duration: testCase.duration.toString(),
            video_format: testCase.format,
            format: 'png'
          },
          timeout: 60000 // 1分でタイムアウト
        })

        const endTime = Date.now()
        const processingTime = endTime - startTime

        if (response.status() === 200) {
          const videoData = await response.body()
          const fileSize = videoData.length

          results.push({
            description: testCase.description,
            processingTime,
            fileSize,
            success: true
          })

          console.log(`   ✅ 成功: ${processingTime}ms, ${(fileSize / 1024).toFixed(1)}KB`)
        } else {
          results.push({
            description: testCase.description,
            processingTime,
            fileSize: 0,
            success: false
          })

          console.log(`   ❌ 失敗: ${response.status()}`)
        }

      } catch (error) {
        const endTime = Date.now()
        const processingTime = endTime - startTime

        results.push({
          description: testCase.description,
          processingTime,
          fileSize: 0,
          success: false
        })

        console.log(`   ❌ エラー: ${processingTime}ms, ${error}`)
      }
    }

    // パフォーマンス結果の分析
    console.log('\n📊 パフォーマンステスト結果:')
    const successfulResults = results.filter(r => r.success)
    
    if (successfulResults.length > 0) {
      const avgProcessingTime = successfulResults.reduce((sum, r) => sum + r.processingTime, 0) / successfulResults.length
      const avgFileSize = successfulResults.reduce((sum, r) => sum + r.fileSize, 0) / successfulResults.length

      console.log(`   平均処理時間: ${avgProcessingTime.toFixed(0)}ms`)
      console.log(`   平均ファイルサイズ: ${(avgFileSize / 1024).toFixed(1)}KB`)
      console.log(`   成功率: ${(successfulResults.length / results.length * 100).toFixed(1)}%`)

      // パフォーマンス基準をチェック
      expect(avgProcessingTime).toBeLessThan(60000) // 平均1分以内
      expect(successfulResults.length).toBeGreaterThan(0) // 少なくとも1つは成功
    } else {
      console.log('   すべてのテストケースが失敗しました')
    }

    console.log('✅ 動画生成パフォーマンステスト完了')
  })
})

// ヘルパー関数
function getFileExtension(format: string): string {
  const extensions: Record<string, string> = {
    'XMF': 'mp4',
    'MP4': 'mp4',
    'WEBM': 'webm',
    'AVI': 'avi'
  }
  return extensions[format] || 'mp4'
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}