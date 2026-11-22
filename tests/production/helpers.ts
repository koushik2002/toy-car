import { expect, type Page } from '@playwright/test';

export type Account = 'collector' | 'seller' | 'superadmin' | 'admin' | 'staff';
export const authFile = (account: Account) => `test-results/.auth/${account}.json`;

/** Short random suffix so data created by one run or project never collides with another. */
export const unique = () => Math.random().toString(36).slice(2, 8).toUpperCase();

type Product = { id: string; name: string; pricePaise: number; available: number };

/** Looks a published product up through the API using the page's signed-in cookies. */
export async function findProduct(page: Page, name: string): Promise<Product> {
  const response = await page.request.get(`/api/products?q=${encodeURIComponent(name)}&limit=5`);
  expect(response.ok()).toBeTruthy();
  const items = (await response.json()).items as Product[];
  const product = items.find((item) => item.name === name);
  if (!product) throw new Error(`Seeded product ${name} not found`);
  return product;
}

/** Maps a seeded order number (TK-2026-1001…) to its id for the signed-in customer or team member. */
export async function findOrderId(page: Page, orderNumber: string, team = false) {
  const response = await page.request.get(
    team ? `/api/admin/orders?q=${orderNumber}` : '/api/orders',
  );
  expect(response.ok()).toBeTruthy();
  const items = (await response.json()).items as { id: string; orderNumber: string }[];
  const order = items.find((item) => item.orderNumber === orderNumber);
  if (!order) throw new Error(`Seeded order ${orderNumber} not found`);
  return order.id;
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow, 'page is wider than the screen').toBeLessThanOrEqual(1);
}

/** On phones the main navigation sits behind the menu button. */
export async function openMenuIfMobile(page: Page) {
  const menu = page.getByRole('button', { name: 'Open navigation' });
  if (await menu.isVisible()) await menu.click();
}
