import { defineConfig } from '@playwright/test';

const APP_URL = process.env.APP_URL || 'https://galeria-holding-sage.vercel.app';
const AUTH_STATE = 'tests/.auth-state.json';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  globalSetup: './tests/globalSetup.js',
  timeout: 30000,
  workers: 1,
  use: {
    baseURL: APP_URL,
    headless: true,
    viewport: { width: 1440, height: 900 },
    storageState: AUTH_STATE,
  },
});
