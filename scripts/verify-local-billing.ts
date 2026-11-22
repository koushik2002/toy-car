import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:5173/account/login');
  await page.getByLabel('Email address').fill('seller@tinykars.local');
  await page.getByLabel('Password').fill('TinyKarsLocal!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/billing');
  await page.goto('http://127.0.0.1:5173/billing');
  await page.getByRole('heading', { name: 'BILLS, MADE SIMPLE.' }).waitFor();
  await page.getByLabel('Customer name').fill('Production Walkthrough');
  const picker = page.getByLabel('Catalogue model 1');
  await picker.fill('482916-P000001');
  await page.getByRole('option', { name: /Blue Sports Car/ }).waitFor();
  await picker.press('Enter');
  await page.getByLabel('Payment received by').selectOption('upi');
  await page.getByRole('button', { name: 'Generate bill' }).click();
  await page.waitForURL('**/admin/billing/invoices/**');
  const invoice = await page.getByRole('heading', { name: /^TK-\d{4}-\d{6}$/ }).innerText();
  await page.screenshot({ path: 'test-results/production-billing-live.png', fullPage: true });
  process.stdout.write(
    `${JSON.stringify({
      url: page.url(),
      heading: await page.locator('h1').innerText(),
      invoice,
      pageErrors,
    })}\n`,
  );
} finally {
  await browser.close();
}
