import { defineConfig } from '@playwright/test';

/**
 * API専用のPlaywright設定
 * webServerを使用せず、APIテストのみに特化
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'html' : 'list',
  reportSlowTests: null,
  quiet: !process.env.DEBUG,
  timeout: 30000, // 30秒のタイムアウト
  use: {
    baseURL: process.env.API_URL || 'https://uc2mbbjs64.execute-api.ap-northeast-1.amazonaws.com/prod',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'api-tests',
      testMatch: /.*\.api\.spec\.ts/,
      use: {
        baseURL: process.env.API_URL || 'https://uc2mbbjs64.execute-api.ap-northeast-1.amazonaws.com/prod',
        // timeout: 30000, // プロジェクトレベルで設定
      },
    },
  ],
  outputDir: 'test-results',
  // webServerは使用しない（APIテストのため）
});