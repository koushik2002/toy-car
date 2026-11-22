import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium, type BrowserContext, type Page } from 'playwright';

const baseUrl = 'http://127.0.0.1:5173';
const output = 'artifacts/mascot-review';
const password = 'TinyKarsLocal!2026';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
});

async function login(page: Page, email: string) {
  await page.goto(`${baseUrl}/account/login`);
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL((url) => url.pathname !== '/account/login');
}

async function verify(page: Page, selector: string, path: string) {
  const mascot = page.locator(selector);
  await mascot.waitFor();
  const loaded = await mascot.evaluate((image: HTMLImageElement) => image.naturalWidth > 0);
  if (!loaded) throw new Error(`${selector} did not load.`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 1) throw new Error(`${path} overflows horizontally by ${overflow}px.`);
  await page.screenshot({ path, fullPage: false });
}

async function capture(name: string, viewport: { width: number; height: number }) {
  const publicContext = await browser.newContext({ viewport });
  const home = await publicContext.newPage();
  await home.goto(baseUrl, { waitUntil: 'networkidle' });
  await verify(home, '.hero-mascot', `${output}/home-${name}.png`);
  await publicContext.close();

  const customerContext: BrowserContext = await browser.newContext({ viewport });
  const account = await customerContext.newPage();
  await login(account, 'collector@tinykars.local');
  await account.goto(`${baseUrl}/account`, { waitUntil: 'networkidle' });
  await verify(account, '.account-mascot', `${output}/account-${name}.png`);
  await customerContext.close();

  const sellerContext: BrowserContext = await browser.newContext({ viewport });
  const billing = await sellerContext.newPage();
  await login(billing, 'seller@tinykars.local');
  await billing.goto(`${baseUrl}/admin/billing`, { waitUntil: 'networkidle' });
  await verify(billing, '.billing-mascot', `${output}/billing-${name}.png`);
  await sellerContext.close();
}

try {
  await capture('desktop', { width: 1440, height: 900 });
  await capture('mobile', { width: 360, height: 800 });
  process.stdout.write(`${output}\n`);
} finally {
  await browser.close();
}
