import { test, expect } from '@playwright/test';

test.describe('画像合成REST API', () => {
  // API_URLは /images/composite パス込みの完全URL
  const apiUrl = process.env.API_URL || 'http://localhost:3000/images/composite';

  test('基本的な画像合成 - HTML形式', async ({ request }) => {
    const response = await request.get(`${apiUrl}?baseImage=test&image1=test&image2=test&format=html`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<img src="data:image/png;base64,');
    expect(html).toContain('画像合成結果');
  });

  test('基本的な画像合成 - PNG形式', async ({ request }) => {
    const response = await request.get(`${apiUrl}?baseImage=test&image1=test&image2=test&format=png`);

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  });

  test('カスタム配置パラメータ', async ({ request }) => {
    const response = await request.get(
      `${apiUrl}?baseImage=test&image1=test&image2=test&img1_x=100&img1_y=100&img1_width=400&img1_height=300&format=html`
    );

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('画像合成結果');
  });

  test('必須パラメータ不足エラー', async ({ request }) => {
    const response = await request.get(`${apiUrl}?baseImage=test`);

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
  });

  test('不正なパラメータ値', async ({ request }) => {
    const response = await request.get(
      `${apiUrl}?baseImage=test&image1=test&image2=test&img1_width=invalid`
    );

    // 数値パラメータに不正な値を指定した場合、デフォルト値を使用
    expect(response.status()).toBe(200);
  });

  // フロントエンドが実際に使うのはPOSTメソッド（App.vue: axios.post）
  test('POST: 基本的な画像合成 - PNG形式', async ({ request }) => {
    const response = await request.post(apiUrl, {
      data: {
        baseImage: 'test',
        format: 'png',
        image1: 'test',
        image1X: 100,
        image1Y: 100,
        image1Width: 400,
        image1Height: 400,
        image2: 'test',
        image2X: 600,
        image2Y: 100,
        image2Width: 400,
        image2Height: 400,
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'image/png, image/*',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');

    const body = await response.body();
    expect(body.length).toBeGreaterThan(100);
  });

  test('POST: 3画像合成', async ({ request }) => {
    const response = await request.post(apiUrl, {
      data: {
        baseImage: 'test',
        format: 'png',
        image1: 'test',
        image1X: 100,
        image1Y: 100,
        image1Width: 400,
        image1Height: 400,
        image2: 'test',
        image2X: 600,
        image2Y: 100,
        image2Width: 400,
        image2Height: 400,
        image3: 'test',
        image3X: 350,
        image3Y: 400,
        image3Width: 400,
        image3Height: 400,
      },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'image/png, image/*',
      },
    });

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
  });

  test('POST: 必須パラメータ不足エラー', async ({ request }) => {
    // image1 を含めない（必須）
    const response = await request.post(apiUrl, {
      data: {
        baseImage: 'test',
        format: 'png',
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(400);
  });
});
