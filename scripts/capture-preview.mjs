import { chromium } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
const path =
  process.env.TINY_KARS_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({ executablePath: existsSync(path) ? path : undefined });
await mkdir('reports', { recursive: true });
for (const [name, width, height] of [
  ['desktop', 1440, 1000],
  ['mobile', 360, 800],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:4173/toy-car/');
  await page.locator('.hero h1').waitFor();
  await page.evaluate(async () => {
    await document.fonts.ready;
    for (let y = 0; y < document.documentElement.scrollHeight; y += 500) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 70));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: `reports/${name}-preview.png`, fullPage: true });
  await page.close();
}
await browser.close();
