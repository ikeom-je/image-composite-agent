import { defineConfig, devices } from '@playwright/test';
import path from 'path';

/**
 * 画像合成REST API用のPlaywright設定
 * @see https://playwright.dev/docs/test-configuration
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
  use: {
    baseURL: process.env.API_URL || 'https://api.example.com/prod',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'api-tests',
      testMatch: /.*\.api\.spec\.ts/,
      use: {
        baseURL: process.env.API_URL || 'http://localhost:3000',
        // timeout: 30000, // API テストは30秒のタイムアウト（プロジェクトレベルで設定）
      },
    },
    {
      name: 'frontend-tests',
      testMatch: /.*frontend\.spec\.ts/,
      use: {
        baseURL: 'http://localhost:5173',
      },
    },
    {
      name: 'upload-tests',
      testMatch: /upload-functionality\.spec\.ts/,
      use: {
        baseURL: process.env.FRONTEND_URL || 'https://frontend.example.com',
      },
    },
    {
      name: 'selection-tests',
      testMatch: /image-selection\.spec\.ts/,
      use: {
        baseURL: process.env.FRONTEND_URL || 'https://frontend.example.com',
      },
    },
    {
      name: 'integration-tests',
      testMatch: /integration-workflow\.spec\.ts/,
      use: {
        baseURL: process.env.FRONTEND_URL || 'https://frontend.example.com',
      },
    },
    {
      name: 'chat-agent-tests',
      testMatch: /chat-agent\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.FRONTEND_URL || 'https://frontend.example.com',
      },
    },
  ],
  outputDir: 'test-results',
  webServer: process.env.FRONTEND_URL ? undefined : process.env.LOCAL_TEST ? {
    command: 'cd ../lambda/python && python -m http.server 8000',
    url: 'http://localhost:8000',
    reuseExistingServer: !process.env.CI,
  } : {
    command: 'cd ../frontend && npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});