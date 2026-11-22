// End-to-end journeys against the real app, API and seeded database started by the config.
// The database lives for the whole run and is shared by the desktop and mobile projects, so
// tests create uniquely named data and one-way order changes run on desktop only.
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  authFile,
  expectNoHorizontalScroll,
  findOrderId,
  findProduct,
  openMenuIfMobile,
  unique,
} from './helpers';

const desktopOnly = 'Moves a shared seeded order one way; covered once on desktop.';
const browserProblems = new WeakMap<Page, string[]>();

// The API rate-limits per shopper address and trusts the dev proxy's forwarded address. Each test
// acts as its own shopper so a full run is not throttled as if it were one very busy person.
test.beforeEach(async ({ context, page }) => {
  const octet = () => Math.floor(Math.random() * 250) + 1;
  await context.setExtraHTTPHeaders({ 'X-Forwarded-For': `10.${octet()}.${octet()}.${octet()}` });
  const problems: string[] = [];
  browserProblems.set(page, problems);
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console: ${message.text()}`);
  });
});

test.afterEach(async ({ page }) => {
  expect(browserProblems.get(page) || [], 'browser console/page errors').toEqual([]);
});

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => ['critical', 'serious'].includes(violation.impact || ''))
    .map((violation) => `${violation.id}: ${violation.nodes.map((n) => n.target).join(' | ')}`);
}

test.describe('guest', () => {
  test('sees the hero, must sign in to browse, and returns to the shop after signing in', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /SMALL CARS\.\s*BIG OBSESSION\./ }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Sign in to your garage/ })).toBeVisible();
    await expect(page.getByText('Sign in to see the full collection.').first()).toBeVisible();

    await page.goto('/shop');
    await expect(page).toHaveURL(/\/account\/login\?next=%2Fshop/);
    await page.getByLabel('Email address').fill('collector@tinykars.local');
    await page.getByLabel('Password').fill('TinyKarsLocal!2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/shop$/);
    await expect(page.getByRole('heading', { name: 'THE COLLECTION.' })).toBeVisible();
  });

  test('registration and password reset explain themselves', async ({ page }) => {
    await page.goto('/account/register');
    await page.getByLabel('Your name').fill('New Collector');
    await page.getByLabel('Email address').fill(`new-${unique()}@example.com`);
    // Hint text is part of each label's name, so password fields are found by field name.
    await page.locator('input[name="password"]').fill('a long password 123');
    await page.locator('input[name="confirm"]').fill('a different password 456');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toContainText('The two passwords do not match.');
    await page.locator('input[name="confirm"]').fill('a long password 123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('status')).toContainText(/verification link/i);

    await page.goto('/account/forgot');
    await page.getByLabel('Email address').fill('nobody@example.com');
    await page.getByRole('button', { name: 'Email me a reset link' }).click();
    await expect(page.getByRole('status')).toContainText(/link/i);
  });

  test('home page has no serious accessibility problems and the skip link works', async ({
    page,
  }) => {
    await page.goto('/');
    expect(await seriousViolations(page)).toEqual([]);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
  });
});

test.describe('shopper', () => {
  test.use({ storageState: authFile('collector') });

  test('filters the collection by brand and scale and clears the filters', async ({ page }) => {
    await page.goto('/shop');
    const count = page.locator('.shop-toolbar [role="status"]');
    await expect(count).toContainText('61');
    const mobile = await page.getByRole('button', { name: /^Filters/ }).isVisible();
    if (mobile) await page.getByRole('button', { name: /^Filters/ }).click();
    const filters = mobile ? page.getByRole('dialog') : page.getByLabel('Product filters');
    await filters.getByRole('checkbox', { name: /Hot Wheels/ }).click();
    await expect(page).toHaveURL(/brand=Hot\+Wheels/);
    await filters.getByRole('button', { name: '1:64', exact: true }).click();
    await expect(page).toHaveURL(/scale=1%3A64/);
    if (mobile) {
      await expect(filters.getByRole('button', { name: /Show \d+ collectibles/ })).toBeVisible();
      await filters.getByRole('button', { name: /Show \d+ collectibles/ }).click();
    }
    await expect(page.getByRole('heading', { name: 'HOT WHEELS.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove filter Hot Wheels' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove filter 1:64' })).toBeVisible();
    for (const card of await page.locator('.shop-grid .product-meta').all())
      await expect(card).toContainText('Hot Wheels');

    await page.getByLabel('Sort products').selectOption('price-asc');
    await expect(page).toHaveURL(/sort=price-asc/);
    await page.getByRole('button', { name: 'Clear all' }).click();
    await expect(page.getByRole('heading', { name: 'THE COLLECTION.' })).toBeVisible();
    await expect(count).toContainText('61');
  });

  test('inspects a product, checks delivery and adds it to the garage', async ({ page }) => {
    const product = await findProduct(page, 'Blue Sports Car');
    await page.goto(`/product/${product.id}`);
    await expect(page.getByRole('heading', { name: 'Blue Sports Car', level: 1 })).toBeVisible();
    const views = page.getByRole('group', { name: /Product views/ }).getByRole('button');
    await expect(views).toHaveCount(5);
    await views.nth(2).click();
    await expect(views.nth(2)).toHaveAttribute('aria-pressed', 'true');

    await page.getByRole('button', { name: /^Zoom / }).click();
    const zoom = page.getByRole('dialog', { name: 'Blue Sports Car' });
    await expect(zoom).toBeVisible();
    await zoom.getByRole('button', { name: 'Next view' }).click();
    await zoom.getByRole('button', { name: 'Close dialog' }).click();
    await expect(zoom).toBeHidden();

    await page.getByLabel('Delivery PIN code').fill('560001');
    await page.getByRole('button', { name: /^Check/ }).click();
    await expect(page.getByText('Delivery to 560001: ₹79.')).toBeVisible();

    await expect(page.getByRole('button', { name: 'Open cart, 0 items' })).toBeVisible();
    await page.getByRole('button', { name: /Add to your garage/ }).click();
    await expect(page.getByRole('button', { name: 'Open cart, 1 items' })).toBeVisible();
    await page.getByRole('button', { name: 'Open cart, 1 items' }).click();
    const drawer = page.getByRole('dialog', { name: 'Your garage (1)' });
    await expect(drawer.getByText(/₹200 away from free delivery/)).toBeVisible();
    await drawer.getByRole('button', { name: 'Close dialog' }).click();

    await page.goto('/cart');
    await expect(page.getByRole('link', { name: 'Blue Sports Car' }).first()).toBeVisible();
    await expect(page.getByText(/away from free delivery/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole('link', { name: 'Blue Sports Car' }).first()).toBeVisible();
    await page.getByLabel('Cart voucher code').fill('TINY10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page.getByRole('status')).toContainText('saves ₹129.90');
    await expect(page.locator('.summary-card')).toContainText('₹1,248.10');
  });

  test('shows database-backed product variations and switches SKU', async ({ page }) => {
    const product = await findProduct(page, 'Nissan Skyline GT-R (R34)');
    await page.goto(`/product/${product.id}`);
    const variations = page.getByRole('list', { name: /Variations of Nissan Skyline/ });
    await expect(variations.getByRole('listitem')).toHaveCount(3);
    const currentSku = await page.locator('.detail-tags span').last().textContent();
    await variations.locator('a:not(.active)').first().click();
    await expect(page.locator('.detail-tags span').last()).not.toHaveText(currentSku || '');
  });

  test('checkout shows the saved address and a live server quote with TINY10', async ({ page }) => {
    const product = await findProduct(page, 'Blue Sports Car');
    await page.goto(`/product/${product.id}`);
    await page.getByRole('button', { name: 'Buy now' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('heading', { name: 'BRING THEM HOME.' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Bengaluru · 560001/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByLabel('PIN code')).toHaveValue('560001');
    const summary = page.locator('.totals');
    await expect(summary).toContainText('₹79');
    await expect(summary).toContainText('₹1,378');

    await page.getByLabel('Voucher code').fill('TINY10');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(summary).toContainText('Voucher TINY10');
    await expect(summary).toContainText('−₹129.90');
    await expect(summary).toContainText('₹1,248.10');
    await expect(page.getByText(/safe test-payment adapter/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Place test order/ })).toBeEnabled();
  });

  test('places a server-priced test order and opens its confirmation', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', desktopOnly);
    const product = await findProduct(page, 'Blue Sports Car');
    await page.goto(`/product/${product.id}`);
    await page.getByRole('button', { name: 'Buy now' }).click();
    await expect(page).toHaveURL(/\/checkout$/);
    await expect(page.getByRole('button', { name: /Place test order/ })).toBeEnabled();
    await page.getByRole('button', { name: /Place test order/ }).click();
    await expect(page).toHaveURL(/\/account\/orders\/.+payment=confirmed/);
    await expect(page.getByText('PAYMENT CONFIRMED', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^TK-\d{4}-\d+$/ })).toBeVisible();
  });

  test('saves a model to the wishlist and removes it', async ({ page }, testInfo) => {
    // Each project uses its own model so the shared account's wishlist never overlaps.
    const product = await findProduct(
      page,
      testInfo.project.name === 'mobile' ? 'Porsche 911 GT3 RS' : 'Blue Sports Car',
    );
    await page.goto(`/product/${product.id}`);
    await page.getByRole('button', { name: 'Save to wishlist' }).click();
    await expect(page.getByRole('button', { name: 'Remove from wishlist' })).toBeVisible();
    await page.goto('/wishlist');
    await expect(page.getByRole('heading', { name: 'YOUR GRAIL LIST.' })).toBeVisible();
    const heart = page.getByRole('button', { name: `Remove ${product.name} from wishlist` });
    await expect(heart).toBeVisible();
    await heart.click();
    await expect(heart).toBeHidden();
  });

  test('storefront pages have no serious accessibility problems', async ({ page }) => {
    const product = await findProduct(page, 'Blue Sports Car');
    for (const path of ['/shop', `/product/${product.id}`, '/cart', '/account']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      expect(await seriousViolations(page), path).toEqual([]);
    }
  });
});

test.describe('customer account', () => {
  test.use({ storageState: authFile('collector') });

  test('lists past orders and shows courier tracking on a shipped order', async ({ page }) => {
    await page.goto('/account');
    await expect(page.getByRole('heading', { name: 'HEY, LOCAL.' })).toBeVisible();
    for (const [number, status] of [
      ['TK-2026-1001', /Delivered|Return/],
      ['TK-2026-1002', /Shipped|Delivered/],
      ['TK-2026-1003', /Being packed|Shipped|Out for delivery/i],
      ['TK-2026-1004', /Payment confirmed|Cancel/i],
    ] as const) {
      const card = page.locator('.order-card', { hasText: number });
      await expect(card).toBeVisible();
      await expect(card.locator('.badge').first()).toHaveText(status);
    }
    const id = await findOrderId(page, 'TK-2026-1002');
    await page.goto(`/account/orders/${id}`);
    await expect(page.getByRole('heading', { name: 'TK-2026-1002' })).toBeVisible();
    await expect(page.getByText(/Blue Dart · Tracking BD\d+/)).toBeVisible();
  });

  test('adds and deletes a delivery address', async ({ page }) => {
    const city = `Testpur ${unique()}`;
    await page.goto('/account/addresses');
    await page.getByRole('button', { name: 'Add address' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add a delivery address' });
    await dialog.getByLabel('Full name').fill('Asha Rao');
    await dialog.getByLabel('Mobile number').fill('9876543210');
    await dialog.getByLabel('House number and street').fill('7 Lake View Road');
    await dialog.getByLabel('City').fill(city);
    await dialog.getByLabel('State').fill('Karnataka');
    await dialog.getByLabel('PIN code').fill('560034');
    await dialog.getByRole('button', { name: 'Save address' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('button', { name: `Delete the ${city} address` }).click();
    const confirm = page.getByRole('dialog', { name: 'Delete this address?' });
    await confirm
      .getByRole('button', { name: /Delete/ })
      .last()
      .click();
    await expect(page.getByRole('button', { name: `Delete the ${city} address` })).toBeHidden();
  });

  test('edits the profile and validates the change-password form', async ({ page }) => {
    await page.goto('/account/profile');
    const name = page.getByLabel('Name', { exact: true });
    await expect(name).toHaveValue('Local Collector');
    await name.fill(`Local Collector ${unique()}`);
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await page.reload();
    await expect(name).toHaveValue(/Local Collector [A-Z0-9]{6}/);
    await name.fill('Local Collector');
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    await page.goto('/account/security');
    await page.getByLabel('Current password').fill('TinyKarsLocal!2026');
    await page.locator('input[name="newPassword"]').fill('a brand new password 1');
    await page.locator('input[name="confirm"]').fill('something else entirely 2');
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('alert')).toContainText(/match/i);
  });

  test('requests a return on a recently delivered order', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', desktopOnly);
    const id = await findOrderId(page, 'TK-2026-1001');
    await page.goto(`/account/orders/${id}`);
    await page.getByRole('button', { name: 'Request a return' }).click();
    const dialog = page.getByRole('dialog', { name: 'Request a return' });
    await dialog.getByRole('textbox').fill('The card arrived bent at one corner.');
    await dialog.getByRole('button', { name: 'Submit return request' }).click();
    await expect(page.getByText('Return under review')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Request a return' })).toBeHidden();
  });
});

test.describe('control room (super admin)', () => {
  test.use({ storageState: authFile('superadmin') });

  test('dashboard shows figures, charts and latest orders', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: 'THE GARAGE, AT A GLANCE.' })).toBeVisible();
    await expect(page.locator('.kpi')).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'ORDERS, LAST 30 DAYS' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'SALES BY BRAND' })).toBeVisible();
    await expect(page.locator('.recharts-surface').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'TK-2026-1001' })).toBeVisible();
    expect(await seriousViolations(page)).toEqual([]);
  });

  test('finds a car and opens the full edit form with five photo slots', async ({ page }) => {
    await page.goto('/admin/products');
    await page.getByLabel('Search products').fill('Blue Sports');
    const edit = page.getByRole('button', { name: 'Edit Blue Sports Car' });
    await expect(edit).toBeVisible();
    await edit.click();
    const dialog = page.getByRole('dialog');
    for (const label of [
      'Model name',
      'Brand',
      'Series',
      'Year of manufacture',
      'Scale',
      'Condition',
      'Selling price (₹)',
      'MRP (₹)',
      'Low-stock alert at',
      'Description',
    ])
      await expect(
        dialog.getByLabel(new RegExp(`^${label.replace(/[()₹]/g, '\\$&')}`)).first(),
      ).toBeVisible();
    await expect(dialog.locator('input[type="file"]')).toHaveCount(5);
  });

  test('downloads the CSV template and imports a new draft model', async ({ page }) => {
    await page.goto('/admin/products');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download template/ }).click();
    expect((await download).suggestedFilename()).toMatch(/\.csv$/);

    const suffix = unique();
    const series = `E2E ${suffix}`;
    const name = `E2E Roadster ${suffix}`;
    await page.getByRole('button', { name: /Import CSV/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Import products from CSV' });
    await dialog.locator('input[type="file"]').setInputFiles({
      name: 'catalogue.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(
        `name,brand,series,price,mrp,stock\n${name},Tiny Kars,${series},499,599,4\n`,
      ),
    });
    await expect(dialog.getByText(name)).toBeVisible();
    await dialog.getByRole('button', { name: /Commit|Import \d+|Add \d+/ }).click();
    await expect(dialog).toBeHidden();
    await page.getByLabel('Search products').fill(name);
    const row = page.getByRole('row', { name: new RegExp(name) });
    await expect(row).toBeVisible();
    await expect(row).toContainText('Draft');
  });

  test('adjusts stock and sees it in the movement log', async ({ page }) => {
    const note = `E2E delivery ${unique()}`;
    await page.goto('/admin/inventory');
    await page.getByLabel('Search inventory').fill('Blue Sports');
    const adjust = page.getByRole('button', { name: /^Adjust .* stock$/ }).first();
    await adjust.click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Quantity change').fill('2');
    await dialog.getByLabel('Additional note').fill(note);
    await dialog.getByRole('button', { name: 'Save adjustment' }).click();
    await expect(dialog).toBeHidden();
    await page.getByRole('tab', { name: 'Movement log' }).click();
    await page.getByLabel('Search inventory').fill(note);
    await expect(page.getByText(note)).toBeVisible();
  });

  test('reviews collectors, offers, Tally, labels and team codes', async ({ page }) => {
    await page.goto('/admin/customers');
    await page.getByLabel('Search customers').fill('collector@tinykars.local');
    const collector = page.getByRole('row', { name: /Local Collector/ });
    await expect(collector).toBeVisible();
    await collector.getByRole('button', { name: /View collector/ }).click();
    const customer = page.getByRole('dialog');
    await expect(customer).toContainText('TK-2026-1001');
    await customer.getByRole('button', { name: 'Close dialog' }).click();

    await page.goto('/admin/offers');
    await expect(page.getByText('TINY10')).toBeVisible();

    await page.goto('/admin/tally');
    await expect(page.getByRole('heading', { name: /NOT CONNECTED YET/ })).toBeVisible();

    await page.goto('/admin/labels');
    await page.getByLabel('Search products for labels').fill('Blue Sports');
    await page.getByRole('button', { name: /^Add$/ }).first().click();
    const label = page.getByLabel('Label preview').getByRole('img').first();
    await expect(label).toBeVisible();
    await expect
      .poll(() => label.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);

    await page.goto('/admin/team');
    await expect(page.getByRole('heading', { name: /SERIES CODE PREFIXES/ })).toBeVisible();
    await expect(page.getByText(/^\d{6}$/).first()).toBeVisible();

    await page.goto('/admin/audit');
    await expect(page.getByRole('heading', { name: /EVERY ADMIN ACTION/ })).toBeVisible();
    await expect(page.getByRole('table')).toBeVisible();
  });

  test('ships a packed order with courier and tracking', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', desktopOnly);
    const id = await findOrderId(page, 'TK-2026-1003', true);
    await page.goto(`/admin/orders/${id}`);
    await expect(page.getByRole('heading', { name: 'TK-2026-1003' })).toBeVisible();
    const ship = page.getByRole('button', { name: /Mark shipped/ });
    await ship.click();
    // Courier and tracking are required, so the browser blocks the empty form.
    await expect(page.getByLabel('Courier')).toHaveJSProperty('validity.valid', false);
    await page.getByLabel('Courier').fill('Blue Dart');
    await page.getByLabel('Tracking number').fill(`BD${unique()}`);
    await ship.click();
    await expect(page.locator('.badge').filter({ hasText: 'Shipped' }).first()).toBeVisible();
    await page.getByRole('button', { name: /Mark out for delivery/ }).click();
    await expect(
      page
        .locator('.badge')
        .filter({ hasText: /Out For Delivery/i })
        .first(),
    ).toBeVisible();
    await expect(page.getByLabel('Received by')).toBeVisible();
  });
});

test.describe('delivery staff', () => {
  test.use({ storageState: authFile('staff') });

  test('sees only orders and confirms a delivery', async ({ page }, testInfo) => {
    await page.goto('/admin/products');
    await expect(page).toHaveURL(/\/admin\/orders$/);
    const nav = page.getByRole('navigation', { name: 'Control room navigation' });
    await expect(nav.getByRole('link')).toHaveCount(1);
    await expect(nav.getByRole('link', { name: /Orders & delivery/ })).toBeVisible();

    test.skip(testInfo.project.name === 'mobile', desktopOnly);
    const id = await findOrderId(page, 'TK-2026-1002', true);
    await page.goto(`/admin/orders/${id}`);
    await expect(page.getByRole('button', { name: /Mark shipped|Start packing/ })).toHaveCount(0);
    await page.getByRole('button', { name: /Mark out for delivery/ }).click();
    await page.getByLabel('Received by').fill('Asha Rao');
    await page.getByRole('button', { name: /Confirm delivered/ }).click();
    await expect(page.getByText('Received by Asha Rao').first()).toBeVisible();
  });
});

test.describe('seller billing desk', () => {
  test.use({ storageState: authFile('seller') });

  test('issues a UPI counter bill without discount powers', async ({ page }, testInfo) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/billing$/);
    await expect(page.getByRole('heading', { name: 'BILLS, MADE SIMPLE.' })).toBeVisible();
    const nav = page.getByRole('navigation', { name: 'Control room navigation' });
    await expect(nav.getByRole('link')).toHaveCount(1);
    await expect(page.getByLabel(/discount/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Add custom item/ })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /INVOICE A PAID ONLINE ORDER/ })).toHaveCount(0);
    await page.screenshot({
      path: `artifacts/final-qa/seller-billing-${testInfo.project.name}.png`,
      fullPage: true,
    });

    await page.getByLabel('Customer name').fill(`Walk-in ${unique()}`);
    const picker = page.getByLabel('Catalogue model 1');
    await picker.click();
    await picker.fill('482916-P000001');
    await expect(page.getByRole('option', { name: /Blue Sports Car/ })).toBeVisible();
    await picker.press('Enter');
    await expect(page.getByText(/₹1,299 each/)).toBeVisible();
    await page.getByLabel('Payment received by').selectOption('upi');
    await page.getByRole('button', { name: /Generate bill/ }).click();
    await expect(page).toHaveURL(/\/admin\/billing\/invoices\//);
    await expect(page.getByRole('heading', { name: /^TK-\d{4}-\d{6}$/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Print \/ Save PDF/ })).toBeVisible();
    await page.screenshot({
      path: `artifacts/final-qa/offline-invoice-${testInfo.project.name}.png`,
      fullPage: true,
    });
    const download = page.waitForEvent('download');
    await page.getByRole('link', { name: /Download invoice/ }).click();
    expect((await download).suggestedFilename()).toMatch(/^TK-\d{4}-\d{6}\.html$/);
    await expect(page.getByText('UPI')).toBeVisible();
  });
});

test.describe('phone layout', () => {
  test.use({ storageState: authFile('collector') });

  test('menu opens and no screen scrolls sideways', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Phone-width checks.');
    await page.goto('/');
    await openMenuIfMobile(page);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Close navigation' })).toBeVisible();
    const product = await findProduct(page, 'Blue Sports Car');
    for (const path of ['/', '/shop', `/product/${product.id}`, '/account', '/cart']) {
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      await expectNoHorizontalScroll(page);
    }
  });
});

test.describe('phone layout for the billing desk', () => {
  test.use({ storageState: authFile('seller') });

  test('billing fits a phone screen', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Phone-width checks.');
    await page.goto('/admin/billing');
    await expect(page.getByRole('heading', { name: 'BILLS, MADE SIMPLE.' })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });
});
