import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests',
  timeout: 15000,
  expect: { timeout: 4000 },
  use: { baseURL: 'http://127.0.0.1:4173/mailrules/', browserName: 'chromium' },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1360, height: 1000 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'npm run dev -- --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/mailrules/',
    reuseExistingServer: !process.env.CI,
  },
});
