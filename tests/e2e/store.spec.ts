import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: /SMALL CARS/ })).toBeVisible();
});
test('storefront is responsive with local artwork and working filter/search/product flows', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await expect(page.locator('.hero-image')).toBeVisible();
  await page.screenshot({ path: `test-results/home-${info.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('textbox', { name: 'Search models, brands, or series' }).fill('Nissan');
  await expect(page.locator('.search-suggestions')).toBeVisible();
  await page.getByRole('textbox', { name: 'Search models, brands, or series' }).press('Enter');
  await expect(page).toHaveURL(/q=Nissan/);
  await expect(page.locator('.shop-grid .product-card').first()).toBeVisible();
  if (info.project.name.includes('mobile'))
    await page.getByRole('button', { name: 'Filters', exact: true }).click();
  await page.getByRole('checkbox', { name: 'In stock only' }).click();
  await expect(page.getByRole('checkbox', { name: 'In stock only' })).toBeChecked();
  if (info.project.name.includes('mobile'))
    await page.getByRole('button', { name: /Show \d+ collectibles/ }).click();
  await expect(page).toHaveURL(/stock=1/);
  await page.locator('.shop-grid .product-name').first().click();
  await expect(page.locator('.product-description h1')).toBeVisible();
  await page.getByRole('textbox', { name: 'Delivery PIN code' }).fill('560001');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /business days/ })).toBeVisible();
  await page.getByRole('button', { name: 'Zoom product image' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  expect(errors).toEqual([]);
});
test('bundle checkout, payment failure, persistence, cancellation and customer/admin timeline', async ({
  page,
}, info) => {
  await page.goto('./#/product/p001');
  await expect(page.getByRole('button', { name: 'Add to your garage' })).toBeVisible();
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Increase quantity' }).click();
  await page.getByRole('button', { name: 'Add to your garage' }).click();
  await page.getByRole('button', { name: 'Open cart, 3 items' }).click();
  await expect(page.getByRole('dialog')).toContainText('Any 3 for ₹550');
  await page.getByRole('link', { name: 'View full garage' }).click();
  await page.getByRole('textbox', { name: 'Coupon code' }).fill('TINY10');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.totals')).toContainText('₹574');
  await page.reload();
  await expect(page.locator('.totals')).toContainText('₹574');
  await page.getByRole('link', { name: 'Head to checkout' }).click();
  await page.getByRole('button', { name: 'Continue to demo payment' }).click();
  await page.getByRole('button', { name: 'Simulate failed payment' }).click();
  await expect(page.getByRole('alert')).toContainText('cart and stock are unchanged');
  await page.getByRole('button', { name: 'Simulate successful payment' }).click();
  await expect(page).toHaveURL(/order\/.+confirmed/);
  await expect(page.getByRole('heading', { name: /GOOD TASTE/ })).toBeVisible();
  const customerURL = page.url(),
    id = await page.evaluate(
      () => JSON.parse(localStorage.getItem('tiny-kars-demo-v1')!).orders[0].id,
    );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('tiny-kars-demo-v1')!).products.find(
          (p: { id: string }) => p.id === 'p001',
        ).stock,
    ),
  ).toBe(5);
  await page.goto(`./#/admin/orders/${id}`);
  await page.getByRole('button', { name: 'Advance to Confirmed' }).click();
  await expect(page.getByRole('button', { name: 'Advance to Packed' })).toBeVisible();
  await page.goto(customerURL);
  await expect(page.locator('.order-timeline .current')).toContainText('Confirmed');
  await page.getByRole('button', { name: 'Cancel order', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: `Cancel ${id}` })
    .click();
  await expect(page.locator('.order-detail-heading .badge')).toHaveText('Cancelled');
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('tiny-kars-demo-v1')!).products.find(
          (p: { id: string }) => p.id === 'p001',
        ).stock,
    ),
  ).toBe(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `test-results/order-${info.project.name}.png`, fullPage: true });
});
test('admin inventory rejects negative stock and Tally recovers from offline jobs', async ({
  page,
}, info) => {
  await page.goto('./#/admin/inventory');
  await page.getByRole('textbox', { name: 'Search inventory' }).fill('TK-0001');
  await page.getByRole('button', { name: 'Adjust TK-0001 stock' }).click();
  await page.getByRole('spinbutton', { name: 'Quantity change' }).fill('-100');
  await page.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(page.locator('.toast.error')).toContainText('cannot go below zero');
  await page.getByRole('spinbutton', { name: 'Quantity change' }).fill('2');
  await page.getByRole('button', { name: 'Save adjustment' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: /Movement log/ }).click();
  await expect(page.locator('table')).toContainText('8');
  await expect(page.locator('table')).toContainText('10');
  await page.goto('./#/admin/tally');
  await page.getByRole('switch', { name: 'Automatic retry' }).uncheck();
  await page.getByRole('switch', { name: 'Simulate Tally offline' }).check();
  await page.getByRole('button', { name: 'Pull stock from Tally' }).click();
  await expect(page.locator('table')).toContainText('Manual pull — offline');
  await expect(page.locator('table')).toContainText('Simulated bridge is offline.', {
    timeout: 10000,
  });
  await page.getByRole('switch', { name: 'Simulate Tally offline' }).uncheck();
  await page.getByRole('slider', { name: 'Sync failure rate' }).fill('0');
  await page.getByRole('button', { name: 'Retry all failed' }).click();
  await expect(page.locator('.sync-kpis')).toContainText('failed');
  await expect(page.locator('table .status-failed')).toHaveCount(0, { timeout: 10000 });
  await page.getByRole('button', { name: /Reconciliation/ }).click();
  await page.getByRole('button', { name: 'Accept website' }).first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: `test-results/tally-${info.project.name}.png`, fullPage: true });
});
test('all admin pages, demo features and role toggle render without errors', async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  for (const path of [
    'admin',
    'admin/products',
    'admin/orders',
    'admin/customers',
    'admin/offers',
    'admin/tally',
    'account/addresses',
    'account/profile',
    'wishlist',
    'features',
  ]) {
    await page.goto(`./#/${path}`);
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.waitForTimeout(150);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      path,
    ).toBe(true);
  }
  await page.getByRole('button', { name: 'Demo', exact: true }).click();
  await page.getByRole('button', { name: 'New order arrives' }).click();
  await expect(page.locator('.toast')).toContainText('New order arrived');
  await page.getByRole('button', { name: 'Start guided tour' }).click();
  await expect(page.getByRole('region', { name: 'Guided tour' })).toBeVisible();
  await page.getByRole('button', { name: 'Next step' }).click();
  await expect(page).toHaveURL(/offer=bundle/);
  await page.getByRole('button', { name: 'End guided tour' }).click();
  await page.goto('./#/admin');
  await page.screenshot({ path: `test-results/admin-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
