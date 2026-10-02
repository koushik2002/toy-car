import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
const chromePath =
  process.env.TINY_KARS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: 'http://127.0.0.1:4173/toy-car/',
    launchOptions: { executablePath: existsSync(chromePath) ? chromePath : undefined },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone SE'],
        defaultBrowserType: 'chromium',
        viewport: { width: 360, height: 800 },
      },
    },
  ],
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173/toy-car/',
    reuseExistingServer: true,
  },
});
