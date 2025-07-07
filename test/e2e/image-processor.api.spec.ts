import { test, expect } from '@playwright/test';

test.describe('画像合成REST API', () => {
  const apiPath = '/prod/images/composite';

  test('基本的な画像合成 - HTML形式', async ({ request }) => {
    const response = await request.get(`${apiPath}?baseImage=test&image1=test&image2=test`);
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    
    const html = await response.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<img src="data:image/png;base64,');
    expect(html).toContain('画像合成結果');
  });

  test('基本的な画像合成 - PNG形式', async ({ request }) => {
    const response = await request.get(`${apiPath}?baseImage=test&image1=test&image2=test&format=png`);
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('image/png');
    
    const buffer = await response.body();
    expect(buffer.length).toBeGreaterThan(1000); // PNGデータは少なくともある程度のサイズがあるはず
  });

  test('カスタム配置パラメータ', async ({ request }) => {
    const response = await request.get(
      `${apiPath}?baseImage=test&image1=test&image2=test&image1X=100&image1Y=100&image1Width=400&image1Height=300`
    );
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/html');
    
    const html = await response.text();
    expect(html).toContain('image1X=100');
    expect(html).toContain('image1Y=100');
    expect(html).toContain('image1Width=400');
    expect(html).toContain('image1Height=300');
  });

  test('必須パラメータ不足エラー', async ({ request }) => {
    const response = await request.get(`${apiPath}?baseImage=test`);
    
    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toContain('image1 and image2 parameters are required');
  });

  test('不正なパラメータ値', async ({ request }) => {
    const response = await request.get(
      `${apiPath}?baseImage=test&image1=test&image2=test&image1Width=invalid`
    );
    
    // 数値パラメータに不正な値を指定した場合、エラーまたはデフォルト値を使用するはず
    expect(response.status()).toBe(200); // エラーではなくデフォルト値を使用する場合
    
    const html = await response.text();
    expect(html).not.toContain('image1Width=invalid');
  });
});
