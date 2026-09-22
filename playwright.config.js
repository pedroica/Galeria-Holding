import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.playwright.mjs',
  timeout: 30000,
  use: {
    baseURL: 'http://localhost:3333',
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  webServer: {
    url: 'http://localhost:3333',
    reuseExistingServer: true,
    timeout: 10000,
  },
});
