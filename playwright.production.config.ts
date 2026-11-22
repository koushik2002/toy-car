import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const chromePath =
  process.env.TINY_KARS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
// Runs the real React app, Fastify API and a seeded in-memory database on ports of its own, so
// other local copies (3001/5173) keep running.
const apiPort = 3201;
const webPort = 5373;
export const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: './tests/production',
  globalSetup: './tests/production/global-setup.ts',
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL,
    launchOptions: { executablePath: existsSync(chromePath) ? chromePath : undefined },
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
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
    command: `${JSON.stringify(process.execPath)} --import tsx scripts/dev-local.ts`,
    env: { LOCAL_API_PORT: String(apiPort), LOCAL_WEB_PORT: String(webPort) },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
