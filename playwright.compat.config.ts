import { defineConfig, devices } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({
  ...base,
  testMatch: 'store.spec.ts',
  use: { ...base.use, launchOptions: {} },
  projects: [
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1440, height: 1000 },
        launchOptions: {},
      },
    },
    {
      name: 'webkit-mobile',
      use: { ...devices['iPhone SE'], viewport: { width: 360, height: 800 }, launchOptions: {} },
    },
  ],
});
