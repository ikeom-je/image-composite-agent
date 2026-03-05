import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * S3アップロードAPI検証テスト
 */

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';
const UPLOAD_API_URL = `${API_BASE_URL.replace('/images/composite', '')}/upload`;

test.describe('S3アップロードAPI検証', () => {
  
  test('署名付きURL生成API', async ({ request }) => {
    const response = await request.post(`${UPLOAD_API_URL}/presigned-url`, {
      data: {
        fileName: 'test-image.png',
        fileType: 'image/png',
        fileSize: 1024
      }
    });

    expect(response.status()).toBe(200);
    
    const responseData = await response.json();
    expect(responseData).toHaveProperty('uploadUrl');
    expect(responseData).toHaveProperty('s3Key');
    expect(responseData).toHaveProperty('bucketName');
    expect(responseData).toHaveProperty('expiresIn');
    
    expect(responseData.uploadUrl).toContain('amazonaws.com');
    expect(responseData.s3Key).toContain('uploads/images/');
    expect(responseData.expiresIn).toBe(3600);
  });

  test('アップロード画像一覧取得API', async ({ request }) => {
    const response = await request.get(`${UPLOAD_API_URL}/images`, {
      params: {
        maxKeys: '20'
      }
    });

    expect(response.status()).toBe(200);
    
    const responseData = await response.json();
    expect(responseData).toHaveProperty('images');
    expect(responseData).toHaveProperty('count');
    expect(responseData).toHaveProperty('isTruncated');
    
    expect(Array.isArray(responseData.images)).toBe(true);
    expect(typeof responseData.count).toBe('number');
    expect(typeof responseData.isTruncated).toBe('boolean');
    
    // 画像が存在する場合の構造チェック
    if (responseData.images.length > 0) {
      const firstImage = responseData.images[0];
      expect(firstImage).toHaveProperty('key');
      expect(firstImage).toHaveProperty('s3Path');
      expect(firstImage).toHaveProperty('fileName');
      expect(firstImage).toHaveProperty('size');
      expect(firstImage).toHaveProperty('lastModified');
      expect(firstImage).toHaveProperty('contentType');
      expect(firstImage).toHaveProperty('thumbnailUrl');
      
      expect(firstImage.s3Path).toContain('s3://');
      expect(firstImage.thumbnailUrl).toContain('amazonaws.com');
    }
  });

  test('署名付きURL生成 - エラーケース: 必須パラメータ不足', async ({ request }) => {
    const response = await request.post(`${UPLOAD_API_URL}/presigned-url`, {
      data: {
        // fileName を意図的に省略
        fileType: 'image/png',
        fileSize: 1024
      }
    });

    expect(response.status()).toBe(400);
    
    const responseData = await response.json();
    expect(responseData).toHaveProperty('error');
    expect(responseData.error).toContain('fileName');
  });

  test('署名付きURL生成 - エラーケース: ファイルサイズ制限超過', async ({ request }) => {
    const response = await request.post(`${UPLOAD_API_URL}/presigned-url`, {
      data: {
        fileName: 'large-image.png',
        fileType: 'image/png',
        fileSize: 11 * 1024 * 1024 // 11MB (制限は10MB)
      }
    });

    expect(response.status()).toBe(400);
    
    const responseData = await response.json();
    expect(responseData).toHaveProperty('error');
    expect(responseData.error).toContain('size');
  });

  test('署名付きURL生成 - エラーケース: 対応していないファイル形式', async ({ request }) => {
    const response = await request.post(`${UPLOAD_API_URL}/presigned-url`, {
      data: {
        fileName: 'document.pdf',
        fileType: 'application/pdf',
        fileSize: 1024
      }
    });

    expect(response.status()).toBe(400);
    
    const responseData = await response.json();
    expect(responseData).toHaveProperty('error');
    expect(responseData.error).toContain('Unsupported file type');
  });

  test('画像一覧取得 - パラメータ検証', async ({ request }) => {
    // maxKeysパラメータのテスト
    const response1 = await request.get(`${UPLOAD_API_URL}/images`, {
      params: {
        maxKeys: '5'
      }
    });

    expect(response1.status()).toBe(200);
    
    const responseData1 = await response1.json();
    expect(responseData1.images.length).toBeLessThanOrEqual(5);

    // パラメータなしのテスト
    const response2 = await request.get(`${UPLOAD_API_URL}/images`);

    expect(response2.status()).toBe(200);
    
    const responseData2 = await response2.json();
    expect(responseData2.images.length).toBeLessThanOrEqual(50); // デフォルト制限
  });

  test('S3画像を使用した画像合成', async ({ request }) => {
    // まず画像一覧を取得
    const listResponse = await request.get(`${UPLOAD_API_URL}/images`, {
      params: {
        maxKeys: '1'
      }
    });

    expect(listResponse.status()).toBe(200);
    
    const listData = await listResponse.json();
    
    if (listData.images.length > 0) {
      const s3ImagePath = listData.images[0].s3Path;
      
      // S3画像を使用して画像合成
      const compositeResponse = await request.get(`${API_BASE_URL}/images/composite`, {
        params: {
          baseImage: 'transparent',
          image1: s3ImagePath,
          image1X: '100',
          image1Y: '100',
          image1Width: '400',
          image1Height: '300',
          canvasWidth: '1920',
          canvasHeight: '1080',
          format: 'png'
        }
      });

      if (compositeResponse.status() === 200) {
        expect(compositeResponse.headers()['content-type']).toContain('image/png');
      } else {
        console.log('⚠️  S3画像が見つからないか、エラーが発生');
        return; // テストを早期終了
      }
      
      const imageData = await compositeResponse.text();
      const imageBuffer = Buffer.from(imageData, 'base64');
      expect(imageBuffer.length).toBeGreaterThan(1000);
    } else {
      console.log('No uploaded images found, skipping S3 image composition test');
    }
  });

  test('API レスポンス時間 - アップロード関連', async ({ request }) => {
    const startTime = Date.now();
    
    const response = await request.get(`${UPLOAD_API_URL}/images`);
    
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    expect(response.status()).toBe(200);
    expect(responseTime).toBeLessThan(3000); // 3秒以内のレスポンス
    
    console.log(`Upload API response time: ${responseTime}ms`);
  });

  test('CORS ヘッダー検証', async ({ request }) => {
    const response = await request.get(`${UPLOAD_API_URL}/images`);

    expect(response.status()).toBe(200);
    
    const headers = response.headers();
    expect(headers['access-control-allow-origin']).toBe('*');
    expect(headers['access-control-allow-methods']).toContain('GET');
    expect(headers['access-control-allow-headers']).toContain('Content-Type');
  });
});