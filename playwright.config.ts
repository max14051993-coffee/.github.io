import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npx http-server -p 4173 -c-1 .',
    url: 'http://127.0.0.1:4173',
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
  },
});
