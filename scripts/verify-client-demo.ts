import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { chromium, request as playwrightRequest } from 'playwright';

const baseUrl = 'http://127.0.0.1:5173';
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(chromePath) ? { executablePath: chromePath } : {}),
});

try {
  await mkdir('artifacts/client-demo', { recursive: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const browserProblems: string[] = [];
  page.on('pageerror', (error) => browserProblems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') browserProblems.push(`console: ${message.text()}`);
  });

  await page.goto(`${baseUrl}/account/login?next=%2Fshop`);
  await page.getByLabel('Email address').fill('collector@tinykars.local');
  await page.getByLabel('Password').fill('TinyKarsLocal!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/shop');

  const before = (await (await page.request.get(`${baseUrl}/api/finance`)).json()) as {
    loyaltyPoints: number;
    walletPaise: number;
  };
  const listed = (await (await page.request.get(`${baseUrl}/api/orders`)).json()) as {
    items: { id: string; orderNumber: string }[];
  };
  let demoOrder = listed.items.find((item) => !/-100[1-4]$/.test(item.orderNumber));
  let created = false;
  if (!demoOrder) {
    const catalogue = (await (
      await page.request.get(`${baseUrl}/api/products?q=Blue%20Sports%20Car&limit=1`)
    ).json()) as { items: { id: string }[] };
    const productId = catalogue.items[0]?.id;
    if (!productId) throw new Error('Blue Sports Car is missing from the client-demo database.');

    await page.goto(`${baseUrl}/product/${productId}`);
    await page.getByRole('button', { name: 'Buy now' }).click();
    await page.waitForURL('**/checkout');
    await page.getByLabel('Voucher code').fill('TINY10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await page.getByLabel('Use store credit (₹)').fill('100');
    await page.getByLabel('Redeem loyalty points').fill('50');
    const totals = page.locator('.totals');
    await totals.getByText('Voucher TINY10').waitFor();
    await totals.getByText('Store credit').waitFor();
    await totals.getByText('Loyalty points').waitFor();
    await page.screenshot({ path: 'artifacts/client-demo/customer-checkout.png', fullPage: true });

    await page.getByRole('button', { name: /Place test order/ }).click();
    await page.waitForURL(/\/account\/orders\/.+payment=confirmed/);
    const id = new URL(page.url()).pathname.split('/').pop();
    const orderNumber = await page.getByRole('heading', { name: /^TK-\d{4}-\d+$/ }).innerText();
    if (!id) throw new Error('The confirmed order URL did not contain an order ID.');
    demoOrder = { id, orderNumber };
    created = true;
  }

  const orderResponse = await page.request.get(`${baseUrl}/api/orders/${demoOrder.id}`);
  const orderDetail = (await orderResponse.json()) as { order: { invoice: unknown | null } };
  if (!orderDetail.order.invoice) {
    const admin = await playwrightRequest.newContext({ baseURL: baseUrl });
    try {
      const login = await admin.post('/api/auth/login', {
        headers: { Origin: baseUrl },
        data: { email: 'superadmin@tinykars.local', password: 'TinyKarsLocal!2026' },
      });
      if (!login.ok()) throw new Error(`Local admin sign-in failed: ${await login.text()}`);
      const { csrfToken } = (await login.json()) as { csrfToken: string };
      const issued = await admin.post('/api/billing/invoices', {
        headers: { Origin: baseUrl, 'X-CSRF-Token': csrfToken },
        data: { channel: 'online', orderId: demoOrder.id, idempotencyKey: randomUUID() },
      });
      if (!issued.ok()) throw new Error(`Local invoice issue failed: ${await issued.text()}`);
    } finally {
      await admin.dispose();
    }
  }

  await page.goto(`${baseUrl}/account/orders/${demoOrder.id}/invoice`);
  await page.getByRole('button', { name: 'Print / Save PDF' }).waitFor();
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download invoice' }).click();
  const invoiceFile = (await download).suggestedFilename();
  await page.screenshot({ path: 'artifacts/client-demo/customer-invoice.png', fullPage: true });

  const after = (await (await page.request.get(`${baseUrl}/api/finance`)).json()) as {
    loyaltyPoints: number;
    walletPaise: number;
  };
  if (created && after.walletPaise !== before.walletPaise - 10000)
    throw new Error('Store-credit balance did not decrease by the applied ₹100.');
  if (created && after.loyaltyPoints <= before.loyaltyPoints - 50)
    throw new Error('The paid order did not award loyalty points after redemption.');
  if (browserProblems.length) throw new Error(browserProblems.join('\n'));

  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      orderNumber: demoOrder.orderNumber,
      before,
      after,
      voucher: 'TINY10',
      paymentMode: 'test',
      invoiceFile,
      browserProblems,
    })}\n`,
  );
} finally {
  await browser.close();
}
