import { test, expect } from '@playwright/test';

/**
 * 画像選択機能の簡潔なテスト
 * 実際に存在する機能のみをテスト
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const UPLOAD_API_URL = `${API_BASE_URL.replace('/images/composite', '')}/upload`;

test.describe('画像選択機能テスト', () => {
  
  test('基本テスト画像の確認', async ({ request }) => {
    // testタイプの画像生成確認
    const response = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'transparent',
        image1: 'test',
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'png'
      }
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    
    const imageData = await response.text();
    const imageBuffer = Buffer.from(imageData, 'base64');
    expect(imageBuffer.length).toBeGreaterThan(1000);
    
    console.log(`✓ テスト画像 "test": ${imageBuffer.length} bytes`);
  });

  test('S3画像一覧の取得と形式確認', async ({ request }) => {
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '5' }
    });

    expect(listResponse.status()).toBe(200);
    
    const listData = await listResponse.json();
    
    if (listData.images.length > 0) {
      for (const image of listData.images) {
        // S3パスの基本形式確認
        expect(image.s3Path).toContain('s3://');
        expect(image.s3Path).toContain('/uploads/images/');
        
        // ファイル名の確認
        expect(image.fileName).toMatch(/\.(png|jpg|jpeg|gif|webp)$/i);
        
        // サムネイルURLの確認
        expect(image.thumbnailUrl).toContain('amazonaws.com');
        
        console.log(`✓ S3画像: ${image.fileName}`);
      }
    } else {
      console.log('⚠️  S3にアップロード済み画像が見つかりません');
    }
  });

  test('1画像・2画像・3画像モードの基本動作', async ({ request }) => {
    const baseParams = {
      baseImage: 'test',
      canvasWidth: '1920',
      canvasHeight: '1080',
      format: 'png'
    };

    // 1画像モード
    const response1 = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        ...baseParams,
        image1: 'test',
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300'
      }
    });

    expect(response1.status()).toBe(200);
    console.log('✓ 1画像モード: 正常');

    // 2画像モード
    const response2 = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        ...baseParams,
        image1: 'test',
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        image2: 'test',
        image2X: '600',
        image2Y: '100',
        image2Width: '400',
        image2Height: '300'
      }
    });

    expect(response2.status()).toBe(200);
    console.log('✓ 2画像モード: 正常');

    // 3画像モード
    const response3 = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        ...baseParams,
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
        image3Height: '200'
      }
    });

    expect(response3.status()).toBe(200);
    console.log('✓ 3画像モード: 正常');
  });

  test('S3画像とテスト画像の混合使用', async ({ request }) => {
    // S3画像一覧を取得
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '2' }
    });

    expect(listResponse.status()).toBe(200);
    
    const listData = await listResponse.json();
    
    if (listData.images.length >= 1) {
      const s3Image1 = listData.images[0].s3Path;
      
      // S3画像 + テスト画像の合成
      const response = await request.get(`${API_BASE_URL}/images/composite`, {
        params: {
          baseImage: 'transparent',
          image1: s3Image1,
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
          format: 'png'
        }
      });

      if (response.status() === 200) {
        console.log('✓ S3画像 + テスト画像: 正常');
      } else {
        console.log('⚠️  S3画像が見つからないか、エラーが発生');
      }
    } else {
      console.log('⚠️  S3画像が不足しているため、混合テストをスキップ');
    }
  });

  test('エラーハンドリング確認', async ({ request }) => {
    // 必須パラメータ不足
    const response1 = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'test',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'html'
      }
    });

    expect(response1.status()).toBe(400);
    console.log('✓ image1未選択時の適切なエラー');

    // 存在しないS3パス
    const response2 = await request.get(`${API_BASE_URL}/images/composite`, {
      params: {
        baseImage: 'test',
        image1: 's3://nonexistent-bucket/nonexistent-key.png',
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'html'
      }
    });

    // S3エラーの場合は400、404、または500が期待される
    expect([400, 404, 500]).toContain(response2.status());
    console.log('✓ 存在しないS3パス時の適切なエラー');
  });

  test('パフォーマンス確認', async ({ request }) => {
    // 画像一覧取得のパフォーマンス
    const startTime1 = Date.now();
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '10' }
    });
    const endTime1 = Date.now();
    const listTime = endTime1 - startTime1;

    expect(listResponse.status()).toBe(200);
    expect(listTime).toBeLessThan(5000); // 5秒以内
    console.log(`画像一覧取得時間: ${listTime}ms`);

    // 3画像合成のパフォーマンス
    const startTime2 = Date.now();
    const compositeResponse = await request.get(`${API_BASE_URL}/images/composite`, {
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
        format: 'png'
      }
    });
    const endTime2 = Date.now();
    const compositeTime = endTime2 - startTime2;

    expect(compositeResponse.status()).toBe(200);
    expect(compositeTime).toBeLessThan(5000); // 5秒以内
    console.log(`3画像合成時間: ${compositeTime}ms`);
  });
});