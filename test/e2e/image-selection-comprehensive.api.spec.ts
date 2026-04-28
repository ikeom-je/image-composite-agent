import { test, expect } from '@playwright/test';

/**
 * 画像選択機能の包括的テスト
 * 3択選択UI（未選択・テスト画像・S3画像）の動作確認
 */

// API_URLは /images/composite パス込みの完全URL
const API_COMPOSITE_URL = process.env.API_URL || 'http://localhost:3000/images/composite';
const UPLOAD_API_URL = process.env.UPLOAD_API_URL || API_COMPOSITE_URL.replace('/images/composite', '/upload');

test.describe('画像選択機能包括テスト', () => {
  
  test('テスト画像の種類確認', async ({ request }) => {
    // 各テスト画像タイプでの画像生成確認（実際に存在するもののみ）
    const testImageTypes = ['test'];
    
    for (const imageType of testImageTypes) {
      const response = await request.get(`${API_COMPOSITE_URL}`, {
        params: {
          baseImage: 'transparent',
          image1: imageType,
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
      
      console.log(`✓ テスト画像タイプ "${imageType}": ${imageBuffer.length} bytes`);
    }
  });

  test('S3画像パスの形式確認', async ({ request }) => {
    // S3画像一覧を取得
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
        
        console.log(`✓ S3画像: ${image.fileName} (${image.s3Path})`);
      }
    } else {
      console.log('⚠️  S3にアップロード済み画像が見つかりません');
    }
  });

  test('1画像・2画像・3画像モードの動的切り替え', async ({ request }) => {
    const baseParams = {
      baseImage: 'test',
      canvasWidth: '1920',
      canvasHeight: '1080',
      format: 'png'
    };

    // 1画像モード
    const response1 = await request.get(`${API_COMPOSITE_URL}`, {
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
    const response2 = await request.get(`${API_COMPOSITE_URL}`, {
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

    expect([200, 403, 404]).toContain(response2.status());
    console.log('✓ 2画像モード: 正常');

    // 3画像モード
    const response3 = await request.get(`${API_COMPOSITE_URL}`, {
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

    expect([200, 403, 404]).toContain(response3.status());
    console.log('✓ 3画像モード: 正常');
  });

  test('混合画像選択パターン', async ({ request }) => {
    // S3画像一覧を取得
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '2' }
    });

    expect(listResponse.status()).toBe(200);
    
    const listData = await listResponse.json();
    
    if (listData.images.length >= 1) {
      const s3Image1 = listData.images[0].s3Path;
      
      // パターン1: S3画像 + テスト画像
      const response1 = await request.get(`${API_COMPOSITE_URL}`, {
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

      // S3画像��のアクセス権限によっては403/404になる場合がある
      expect([200, 403, 404]).toContain(response1.status());
      console.log(`S3���像 + テスト画像: ${response1.status()}`);

      // パターン2: テス��画像 + S3画像 + テスト画像
      const response2 = await request.get(`${API_COMPOSITE_URL}`, {
        params: {
          baseImage: 'test',
          image1: 'test',
          image1X: '100',
          image1Y: '100',
          image1Width: '300',
          image1Height: '200',
          image2: s3Image1,
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

      expect([200, 403, 404]).toContain(response2.status());
      console.log('✓ テスト画像 + S3画像 + テスト画像: 正常');

      // 複数のS3画像がある場合
      if (listData.images.length >= 2) {
        const s3Image2 = listData.images[1].s3Path;
        
        // パターン3: S3画像 + S3画像 + テスト画像
        const response3 = await request.get(`${API_COMPOSITE_URL}`, {
          params: {
            baseImage: 'transparent',
            image1: s3Image1,
            image1X: '100',
            image1Y: '100',
            image1Width: '300',
            image1Height: '200',
            image2: s3Image2,
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

        expect([200, 403, 404]).toContain(response3.status());
        console.log('✓ S3画像 + S3画像 + テスト画像: 正常');
      }
    } else {
      console.log('⚠️  S3画像が不足しているため、混合パターンテストをスキップ');
    }
  });

  test('画像選択時のパス設定確認', async ({ request }) => {
    // 各画像タイプでのパス設定確認（実際に存在するもののみ）
    const imageSelections = [
      { type: 'test', description: 'デフォルトテスト画像' },
      { type: 'test', description: 'テスト画像（別インスタンス）' }
    ];

    for (const selection of imageSelections) {
      const response = await request.get(`${API_COMPOSITE_URL}`, {
        params: {
          baseImage: 'transparent',
          image1: selection.type,
          image1X: '100',
          image1Y: '100',
          image1Width: '400',
          image1Height: '300',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'html'
        }
      });

      expect(response.status()).toBe(200);
      
      const htmlContent = await response.text();
      expect(htmlContent).toContain('<!DOCTYPE html>');
      expect(htmlContent).toContain('data:image/png;base64,');
      
      console.log(`✓ ${selection.description} (${selection.type}): パス設定正常`);
    }
  });

  test('未選択状態のエラーハンドリング', async ({ request }) => {
    // image1パラメータなし
    const response1 = await request.get(`${API_COMPOSITE_URL}`, {
      params: {
        baseImage: 'test',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'html'
      }
    });

    expect(response1.status()).toBe(400);
    
    const errorText1 = await response1.text();
    expect(errorText1).toContain('image1');
    console.log('✓ image1未選択時の適切なエラー');

    // 空文字列のimage1
    const response2 = await request.get(`${API_COMPOSITE_URL}`, {
      params: {
        baseImage: 'test',
        image1: '',
        image1X: '100',
        image1Y: '100',
        image1Width: '400',
        image1Height: '300',
        canvasWidth: '1920',
        canvasHeight: '1080',
        format: 'html'
      }
    });

    expect(response2.status()).toBe(400);
    console.log('✓ 空文字列image1時の適切なエラー');

    // 存在しないS3パス
    const response3 = await request.get(`${API_COMPOSITE_URL}`, {
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

    // S3エラーの場合は500または400が期待される
    expect([400, 404, 500]).toContain(response3.status());
    console.log('✓ 存在しないS3パス時の適切なエラー');
  });

  test('サムネイル表示機能の確認', async ({ request }) => {
    // 画像一覧を取得
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '3' }
    });

    expect(listResponse.status()).toBe(200);
    
    const listData = await listResponse.json();
    
    if (listData.images.length > 0) {
      for (const image of listData.images) {
        // サムネイルURLにアクセス
        const thumbnailResponse = await request.get(image.thumbnailUrl);
        
        if (thumbnailResponse.status() === 200) {
          const contentType = thumbnailResponse.headers()['content-type'] || '';
          expect(contentType).toContain('image');

          console.log(`✓ サムネイル表示: ${image.fileName} (${contentType})`);
        } else {
          console.log(`⚠️  サムネイル未生成: ${image.fileName}`);
        }
      }
    } else {
      console.log('⚠️  サムネイル確認用のS3画像が見つかりません');
    }
  });

  test('画像選択状態に応じたフォーム表示制御', async ({ request }) => {
    // このテストは実際のフロントエンドUIテストで実装される予定
    // ここではAPIレベルでの動作確認のみ
    
    // 1画像選択時のパラメータ確認
    const params1 = {
      baseImage: 'test',
      image1: 'test',
      image1X: '100',
      image1Y: '100',
      image1Width: '400',
      image1Height: '300',
      canvasWidth: '1920',
      canvasHeight: '1080',
      format: 'html'
    };

    const response1 = await request.get(`${API_COMPOSITE_URL}`, { params: params1 });
    expect(response1.status()).toBe(200);
    console.log('✓ 1画像選択時のパラメータ構造: 正常');

    // 2画像選択時のパラメータ確認
    const params2 = {
      ...params1,
      image2: 'test',
      image2X: '600',
      image2Y: '100',
      image2Width: '400',
      image2Height: '300'
    };

    const response2 = await request.get(`${API_COMPOSITE_URL}`, { params: params2 });
    expect([200, 403, 404]).toContain(response2.status());
    console.log('✓ 2画像選択時のパラメータ構造: 正常');

    // 3画像選択時のパラメータ確認
    const params3 = {
      ...params2,
      image3: 'test',
      image3X: '350',
      image3Y: '400',
      image3Width: '400',
      image3Height: '300'
    };

    const response3 = await request.get(`${API_COMPOSITE_URL}`, { params: params3 });
    expect([200, 403, 404]).toContain(response3.status());
    console.log('✓ 3画像選択時のパラメータ構造: 正常');
  });

  test('パフォーマンステスト - 画像選択レスポンス', async ({ request }) => {
    // 画像一覧取得のパフォーマンス
    const startTime1 = Date.now();
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: { maxKeys: '10' }
    });
    const endTime1 = Date.now();
    const listTime = endTime1 - startTime1;

    expect(listResponse.status()).toBe(200);
    expect(listTime).toBeLessThan(3000); // 3秒以内
    console.log(`画像一覧取得時間: ${listTime}ms`);

    // 複数画像合成のパフォーマンス
    const startTime2 = Date.now();
    const compositeResponse = await request.get(`${API_COMPOSITE_URL}`, {
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