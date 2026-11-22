import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto('http://127.0.0.1:5173/account/login?next=%2Fshop');
  await page.getByLabel('Email address').fill('collector@tinykars.local');
  await page.getByLabel('Password').fill('TinyKarsLocal!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/shop');
  await page.getByRole('heading', { name: 'THE COLLECTION.' }).waitFor();
  await page.getByRole('link', { name: 'Blue Sports Car', exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/production-customer-live.png', fullPage: true });

  process.stdout.write(
    `${JSON.stringify({
      url: page.url(),
      heading: await page.locator('h1').innerText(),
      product: await page.getByRole('link', { name: 'Blue Sports Car', exact: true }).innerText(),
      pageErrors,
    })}\n`,
  );
} finally {
  await browser.close();
}
