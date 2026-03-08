import { defineConfig, devices } from '@playwright/test';

/**
 * チャットエージェントE2Eテスト用Playwright設定
 * デプロイ済みCloudFront環境に対してテスト実行
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /chat-agent\.spec\.ts/,
  fullyParallel: false,
  retries: 1,
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  use: {
    baseURL: process.env.FRONTEND_URL || 'https://d1apj9glns7l6g.cloudfront.net',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: 'test-results',
});
