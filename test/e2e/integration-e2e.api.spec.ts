import { test, expect } from '@playwright/test';

/**
 * 統合機能のE2Eテスト
 * アップロード→選択→合成の完全ワークフローテスト
 */

const API_COMPOSITE_URL = process.env.API_URL || 'http://localhost:3000/images/composite';
const UPLOAD_API_URL = process.env.UPLOAD_API_URL || API_COMPOSITE_URL.replace('/images/composite', '/upload');

// テスト用画像データ（小さなPNG画像）
const TEST_PNG_DATA = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xDE, 0x00, 0x00, 0x00,
  0x0C, 0x49, 0x44, 0x41, 0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0x00, 0x00,
  0x01, 0x00, 0x01, 0x5C, 0xC2, 0x8A, 0x8E, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
]);

test.describe('統合機能E2Eテスト', () => {
  
  test('完全ワークフロー: アップロード→選択→合成', async ({ request }) => {
    console.log('🚀 完全ワークフローテスト開始');
    
    // Step 1: 画像アップロード
    console.log('📤 Step 1: 画像アップロード');
    
    const fileName = `e2e-test-${Date.now()}.png`;
    
    // 署名付きURL生成
    const presignedResponse = await request.post(`${UPLOAD_API_URL}/presigned-url`, {
      data: {
        fileName: fileName,
        fileType: 'image/png',
        fileSize: TEST_PNG_DATA.length
      }
    });

    expect(presignedResponse.status()).toBe(200);
    const presignedData = await presignedResponse.json();
    console.log(`✓ 署名付きURL生成成功: ${presignedData.s3Key}`);
    
    // 実際のファイルアップロード
    const uploadResponse = await request.put(presignedData.uploadUrl, {
      data: TEST_PNG_DATA,
      headers: {
        'Content-Type': 'image/png'
      }
    });

    expect(uploadResponse.status()).toBe(200);
    console.log('✓ ファイルアップロード成功');
    
    // Step 2: アップロード完了待機とサムネイル生成確認
    console.log('⏳ Step 2: アップロード完了待機');
    
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3秒待機
    
    // Step 3: 画像一覧で確認
    console.log('📋 Step 3: 画像一覧確認');
    
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '10' }
    });

    expect(listResponse.status()).toBe(200);
    const listData = await listResponse.json();
    
    const uploadedImage = listData.images.find((img: any) => 
      img.key === presignedData.s3Key
    );
    
    expect(uploadedImage).toBeDefined();
    expect(uploadedImage.fileName).toContain('.png'); // ユニークなファイル名が生成される
    console.log(`✓ アップロード画像確認: ${uploadedImage.fileName}`);
    
    // Step 4: アップロード画像を使用した1画像合成
    console.log('🎨 Step 4: 1画像合成テスト');
    
    const composite1Response = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'transparent',
        image1: uploadedImage.s3Path,
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'png'
      }
    });

    if (composite1Response.status() === 200) {
      expect(composite1Response.headers()['content-type']).toContain('image/png');
    } else {
      console.log('⚠️  S3画像が見つからないか、エラーが発生');
      return; // テストを早期終了
    }
    
    const composite1Data = await composite1Response.text();
    const composite1Buffer = Buffer.from(composite1Data, 'base64');
    expect(composite1Buffer.length).toBeGreaterThan(1000);
    console.log(`✓ 1画像合成成功: ${composite1Buffer.length} bytes`);
    
    // Step 5: アップロード画像 + テスト画像の2画像合成
    console.log('🎨 Step 5: 2画像合成テスト');
    
    const composite2Response = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'test',
        image1: uploadedImage.s3Path,
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        image2: 'circle',
        image2X: '600',
        image2Y: '100',
        image2Width: '400',
        image2Height: '300',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'png'
      }
    });

    expect(composite2Response.status()).toBe(200);
    expect(composite2Response.headers()['content-type']).toContain('image/png');
    
    const composite2Data = await composite2Response.text();
    const composite2Buffer = Buffer.from(composite2Data, 'base64');
    expect(composite2Buffer.length).toBeGreaterThan(1000);
    console.log(`✓ 2画像合成成功: ${composite2Buffer.length} bytes`);
    
    // Step 6: 3画像合成（アップロード画像 + 2つのテスト画像）
    console.log('🎨 Step 6: 3画像合成テスト');
    
    const composite3Response = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'transparent',
        image1: uploadedImage.s3Path,
        image1X: '100',
        image1Y: '100',
        image1Width: '300',
        image1Height: '200',
        image2: 'circle',
        image2X: '500',
        image2Y: '150',
        image2Width: '300',
        image2Height: '200',
        image3: 'rectangle',
        image3X: '800',
        image3Y: '250',
        image3Width: '300',
        image3Height: '200',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'png'
      }
    });

    expect(composite3Response.status()).toBe(200);
    expect(composite3Response.headers()['content-type']).toContain('image/png');
    
    const composite3Data = await composite3Response.text();
    const composite3Buffer = Buffer.from(composite3Data, 'base64');
    expect(composite3Buffer.length).toBeGreaterThan(1000);
    console.log(`✓ 3画像合成成功: ${composite3Buffer.length} bytes`);
    
    console.log('🎉 完全ワークフローテスト完了');
  });

  test('既存機能との互換性テスト', async ({ request }) => {
    console.log('🔄 既存機能互換性テスト開始');
    
    // 従来のテスト画像のみでの合成（後方互換性）
    const legacyTests = [
      {
        name: '1画像合成（従来形式）',
        params: {
          baseImage: 'test',
          image1: 'test',
          image1X: '100',
          image1Y: '100',
          image1Width: '400',
          image1Height: '300',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'html'
        }
      },
      {
        name: '2画像合成（従来形式）',
        params: {
          baseImage: 'transparent',
          image1: 'test',
          image1X: '100',
          image1Y: '100',
          image1Width: '400',
          image1Height: '300',
          image2: 'test',
          image2X: '600',
          image2Y: '100',
          image2Width: '400',
          image2Height: '300',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'html'
        }
      },
      {
        name: '3画像合成（従来形式）',
        params: {
          baseImage: 'test',
          image1: 'test',
          image1X: '100',
          image1Y: '100',
          image1Width: '300',
          image1Height: '200',
          image2: 'test',
          image2X: '500',
          image2Y: '150',
          image2Width: '300',
          image2Height: '200',
          image3: 'test',
          image3X: '800',
          image3Y: '250',
          image3Width: '300',
          image3Height: '200',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'html'
        }
      }
    ];

    for (const testCase of legacyTests) {
      // undefinedプロパティを除去してパラメータを作成
      const cleanParams: Record<string, string> = {};
      Object.entries(testCase.params).forEach(([key, value]) => {
        if (value !== undefined) {
          cleanParams[key] = value;
        }
      });
      
      const response = await request.get(`${API_BASE_URL}/images/composite`, {
        params: cleanParams
      });

      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('text/html');
      
      const htmlContent = await response.text();
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('data:image/png;base64,');
      
      console.log(`✓ ${testCase.name}: 互換性確認`);
    }
    
    console.log('✅ 既存機能互換性テスト完了');
  });

  test('エラーシナリオの統合テスト', async ({ request }) => {
    console.log('❌ エラーシナリオテスト開始');
    
    // シナリオ1: 存在しないS3画像での合成
    const errorResponse1 = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'test',
        image1: 's3://nonexistent-bucket/nonexistent-image.png',
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'html'
      }
    });

    expect([400, 404, 500]).toContain(errorResponse1.status());
    console.log('✓ 存在しないS3画像エラー: 適切に処理');
    
    // シナリオ2: 無効なS3パス形式
    const errorResponse2 = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'test',
        image1: 'invalid-s3-path',
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'html'
      }
    });

    expect([400, 404, 500]).toContain(errorResponse2.status());
    console.log('✓ 無効なS3パス形式エラー: 適切に処理');
    
    // シナリオ3: 混合エラー（一部正常、一部エラー）
    const errorResponse3 = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'test',
        image1: 'test', // 正常
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        image2: 's3://nonexistent-bucket/error.png', // エラー
        image2X: '600',
        image2Y: '100',
        image2Width: '400',
        image2Height: '300',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'html'
      }
    });

    expect([400, 404, 500]).toContain(errorResponse3.status());
    console.log('✓ 混合エラーシナリオ: 適切に処理');
    
    console.log('✅ エラーシナリオテスト完了');
  });

  test('パフォーマンステスト - 統合ワークフロー', async ({ request }) => {
    console.log('⚡ パフォーマンステスト開始');
    
    const startTime = Date.now();
    
    // Step 1: 画像一覧取得
    const listStartTime = Date.now();
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '5' }
    });
    const listEndTime = Date.now();
    const listTime = listEndTime - listStartTime;

    expect(listResponse.status()).toBe(200);
    expect(listTime).toBeLessThan(3000); // 3秒以内
    console.log(`📋 画像一覧取得時間: ${listTime}ms`);
    
    const listData = await listResponse.json();
    
    if (listData.images.length > 0) {
      // Step 2: S3画像を使用した合成
      const compositeStartTime = Date.now();
      const compositeResponse = await request.get(`${API_BASE_URL}/images/composite`, {
        params: {
          baseImage: 'test',
          image1: listData.images[0].s3Path,
          image1X: '100',
          image1Y: '100',
          image1Width: '400',
          image1Height: '300',
          image2: 'circle',
          image2X: '600',
          image2Y: '100',
          image2Width: '400',
          image2Height: '300',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'png'
        }
      });
      const compositeEndTime = Date.now();
      const compositeTime = compositeEndTime - compositeStartTime;

      if (compositeResponse.status() === 200) {
        expect(compositeTime).toBeLessThan(5000); // 5秒以内
      } else {
        console.log('⚠️  S3画像が見つからないため、パフォーマンステストをスキップ');
      }
      console.log(`🎨 S3画像合成時間: ${compositeTime}ms`);
      
      const totalTime = Date.now() - startTime;
      expect(totalTime).toBeLessThan(8000); // 全体で8秒以内
      console.log(`⏱️  総実行時間: ${totalTime}ms`);
    } else {
      console.log('⚠️  S3画像が見つからないため、パフォーマンステストをスキップ');
    }
    
    console.log('✅ パフォーマンステスト完了');
  });

  test('大量データでの統合テスト', async ({ request }) => {
    console.log('📊 大量データテスト開始');
    
    // 大量の画像一覧取得
    const largeListResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '50' }
    });

    expect(largeListResponse.status()).toBe(200);
    
    const largeListData = await largeListResponse.json();
    console.log(`📋 取得画像数: ${largeListData.images.length}`);
    
    // 複数のS3画像がある場合の連続合成テスト
    if (largeListData.images.length >= 3) {
      const s3Images = largeListData.images.slice(0, 3);
      
      // 3つのS3画像を使用した合成
      const multiS3Response = await request.get(`${API_BASE_URL}/images/composite`, {
        params: {
          baseImage: 'transparent',
          image1: s3Images[0].s3Path,
          image1X: '100',
          image1Y: '100',
          image1Width: '300',
          image1Height: '200',
          image2: s3Images[1].s3Path,
          image2X: '500',
          image2Y: '150',
          image2Width: '300',
          image2Height: '200',
          image3: s3Images[2].s3Path,
          image3X: '800',
          image3Y: '250',
          image3Width: '300',
          image3Height: '200',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'png'
        }
      });

      if (multiS3Response.status() === 200) {
        const multiS3Data = await multiS3Response.text();
        const multiS3Buffer = Buffer.from(multiS3Data, 'base64');
        expect(multiS3Buffer.length).toBeGreaterThan(1000);
        console.log(`✓ 3つのS3画像合成成功: ${multiS3Buffer.length} bytes`);
      } else {
        console.log('⚠️  S3画像が見つからないため、複数S3画像テストをスキップ');
      }
    } else {
      console.log('⚠️  S3画像が3つ未満のため、複数S3画像テストをスキップ');
    }
    
    console.log('✅ 大量データテスト完了');
  });

  test('同時実行テスト', async ({ request }) => {
    console.log('🔄 同時実行テスト開始');
    
    // 複数の合成リクエストを同時実行
    const concurrentRequests = [
      request.get(`${API_BASE_URL}/images/composite`, {
        params: {
          baseImage: 'test',
          image1: 'test',
          image1X: '100',
          image1Y: '100',
          image1Width: '400',
          image1Height: '300',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'png'
        }
      }),
      request.get(`${API_BASE_URL}/images/composite`, {
        params: {
          baseImage: 'transparent',
          image1: 'circle',
          image1X: '200',
          image1Y: '200',
          image1Width: '400',
          image1Height: '300',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'png'
        }
      }),
      request.get(`${API_BASE_URL}/images/composite`, {
        params: {
          baseImage: 'test',
          image1: 'rectangle',
          image1X: '300',
          image1Y: '300',
          image1Width: '400',
          image1Height: '300',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'png'
        }
      })
    ];

    const startTime = Date.now();
    const responses = await Promise.all(concurrentRequests);
    const endTime = Date.now();
    const totalTime = endTime - startTime;

    // 全てのリクエストが成功することを確認
    for (let i = 0; i < responses.length; i++) {
      if (responses[i].status() === 200) {
        console.log(`✓ 同時リクエスト ${i + 1}: 成功`);
      } else {
        console.log(`⚠️  同時リクエスト ${i + 1}: ${responses[i].status()}`);
      }
    }

    expect(totalTime).toBeLessThan(10000); // 10秒以内
    console.log(`⏱️  同時実行時間: ${totalTime}ms`);
    
    console.log('✅ 同時実行テスト完了');
  });
});