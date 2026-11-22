import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium, type Locator, type Page } from 'playwright';

const baseUrl = 'http://127.0.0.1:5173';
const outputDir = 'artifacts/billing-demo';
const webmPath = `${outputDir}/tiny-kars-billing-demo.webm`;
const mp4Path = `${outputDir}/tiny-kars-billing-demo.mp4`;
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
await mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
});

async function pause(page: Page, milliseconds = 1200) {
  await page.waitForTimeout(milliseconds);
}

async function focus(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element) => {
    element.animate(
      [
        { outline: '0 solid rgba(255,215,64,0)' },
        { outline: '5px solid rgba(255,215,64,.9)' },
        { outline: '0 solid rgba(255,215,64,0)' },
      ],
      { duration: 900, easing: 'ease-out' },
    );
  });
  await pause(page, 650);
}

async function caption(page: Page, text: string, milliseconds = 2200) {
  await page.evaluate((message) => {
    document.querySelector('#billing-demo-caption')?.remove();
    const element = document.createElement('div');
    element.id = 'billing-demo-caption';
    element.textContent = message;
    Object.assign(element.style, {
      position: 'fixed',
      zIndex: '2147483647',
      left: '50%',
      top: '24px',
      transform: 'translateX(-50%)',
      maxWidth: '760px',
      padding: '13px 22px',
      border: '2px solid #ffdc49',
      borderRadius: '999px',
      background: 'rgba(7,11,16,.95)',
      color: '#fff',
      font: '700 18px Arial, sans-serif',
      letterSpacing: '.04em',
      textAlign: 'center',
      boxShadow: '0 10px 35px rgba(0,0,0,.45)',
    });
    document.body.append(element);
  }, text);
  await pause(page, milliseconds);
  await page.evaluate(() => document.querySelector('#billing-demo-caption')?.remove());
}

async function login(page: Page, email: string, destination: RegExp) {
  await page.goto(`${baseUrl}/account/login`, { waitUntil: 'networkidle' });
  await pause(page, 900);
  const emailField = page.getByLabel('Email address');
  await focus(page, emailField);
  await emailField.pressSequentially(email, { delay: 30 });
  const password = page.getByLabel('Password');
  await focus(page, password);
  await password.pressSequentially('TinyKarsLocal!2026', { delay: 25 });
  const signIn = page.getByRole('button', { name: 'Sign in' });
  await focus(page, signIn);
  await signIn.click();
  await page.waitForURL(destination);
}

async function convertToMp4() {
  const ffmpeg = existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
  const child = spawn(
    ffmpeg,
    [
      '-y',
      '-i',
      webmPath,
      '-an',
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      mp4Path,
    ],
    { stdio: 'ignore' },
  );
  const code = await new Promise<number>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (value) => resolve(value ?? 1));
  });
  if (code !== 0) throw new Error(`FFmpeg conversion failed with exit code ${code}.`);
}

const context = await browser.newContext({
  viewport: { width: 1365, height: 768 },
  recordVideo: { dir: `${outputDir}/raw`, size: { width: 1365, height: 768 } },
});
const page = await context.newPage();
const video = page.video();
const problems: string[] = [];
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`);
});

try {
  await login(page, 'seller@tinykars.local', /\/admin\/billing$/);
  await page.getByRole('heading', { name: 'BILLS, MADE SIMPLE.' }).waitFor();
  await caption(page, 'SELLER VIEW — secure billing-only access');

  const sellerNav = page.getByRole('navigation', { name: 'Control room navigation' });
  await focus(page, sellerNav);
  await caption(page, 'Seller permissions: one billing desk, no admin controls');

  const customer = page.getByLabel('Customer name');
  await focus(page, customer);
  await customer.pressSequentially('Walk-in Collector', { delay: 40 });
  const picker = page.getByLabel('Catalogue model 1');
  await focus(page, picker);
  await picker.pressSequentially('482916-P000001', { delay: 55 });
  await page.getByRole('option', { name: /Blue Sports Car/ }).waitFor();
  await caption(page, 'Scan or enter the unique SKU / barcode');
  await picker.press('Enter');
  await page.getByText(/₹1,299 each/).waitFor();

  const method = page.getByLabel('Payment received by');
  await focus(page, method);
  await method.selectOption('upi');
  await caption(page, 'Current database price, shared stock and UPI payment snapshot');
  const generate = page.getByRole('button', { name: 'Generate bill' });
  await focus(page, generate);
  await generate.click();

  await page.waitForURL('**/admin/billing/invoices/**');
  const invoice = page.getByRole('heading', { name: /^TK-\d{4}-\d{6}$/ });
  const invoiceNumber = await invoice.innerText();
  await caption(page, `INVOICE GENERATED — ${invoiceNumber}`);
  await focus(page, page.getByRole('button', { name: /Print \/ Save PDF/ }));
  await focus(page, page.getByRole('link', { name: /Download invoice/ }));
  await caption(page, 'Immutable A4 invoice — print, save as PDF or download');
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }),
  );
  await pause(page, 1800);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await pause(page, 1000);

  await page.getByRole('link', { name: 'Billing desk' }).first().click();
  await page.waitForURL('**/admin/billing');
  const issuedBills = page.getByRole('heading', { name: 'ISSUED BILLS' });
  await issuedBills.scrollIntoViewIfNeeded();
  await caption(page, 'SAVED BILLS — every issued invoice stays in history');
  const latestInvoiceLink = page.getByRole('link', { name: invoiceNumber }).last();
  await focus(page, latestInvoiceLink);
  await latestInvoiceLink.click();
  await page.getByRole('heading', { name: invoiceNumber }).waitFor();
  await caption(page, 'Any authorized saved bill can be reopened and reprinted');

  await context.clearCookies();
  await login(page, 'superadmin@tinykars.local', /\/admin$/);
  await page.getByRole('heading', { name: 'THE GARAGE, AT A GLANCE.' }).waitFor();
  await caption(page, 'ADMIN VIEW — all sales and operations in one control room');
  await focus(page, page.getByText('Counter sales today'));
  await caption(page, 'Dashboard separates online revenue and counter billing');

  await page.getByRole('link', { name: 'Billing desk' }).click();
  await page.getByRole('heading', { name: 'BILLS, MADE SIMPLE.' }).waitFor();
  await page.getByRole('heading', { name: 'ISSUED BILLS' }).scrollIntoViewIfNeeded();
  await caption(page, 'Admin billing history — online and counter invoices together');
  await focus(page, page.getByRole('link', { name: invoiceNumber }).last());

  await page.getByRole('link', { name: 'Inventory' }).click();
  await page.getByRole('heading', { name: 'EVERY MODEL ACCOUNTED FOR.' }).waitFor();
  await page.getByLabel('Search inventory').fill('Blue Sports');
  await pause(page, 900);
  await caption(page, 'Shared inventory updates immediately after the counter sale');

  await page.getByRole('link', { name: 'Tally sync' }).click();
  await page.getByRole('heading', { name: 'THE TALLY CONNECTION.' }).waitFor();
  await caption(page, 'Every invoice is queued safely for the future Tally connector');
  await focus(page, page.getByRole('link', { name: invoiceNumber }).last());

  await page.getByRole('link', { name: 'Audit logs' }).click();
  await page.getByRole('heading', { name: 'EVERY ADMIN ACTION, ACCOUNTED FOR.' }).waitFor();
  await caption(page, 'Audit log — sensitive actions and invoice issuance remain traceable');
  await pause(page, 1500);
  await caption(page, 'Tiny Kars — seller billing and admin reporting demo', 2800);

  if (problems.length) throw new Error(problems.join('\n'));
} finally {
  await page.close();
  await context.close();
}

if (!video) throw new Error('Playwright did not create a billing demo recording.');
await video.saveAs(webmPath);
await browser.close();
await convertToMp4();
process.stdout.write(`${mp4Path}\n`);
