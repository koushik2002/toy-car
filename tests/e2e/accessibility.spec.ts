import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('keyboard and WCAG checks across storefront and admin', async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  for (const path of [
    '',
    'shop',
    'product/p001',
    'account',
    'admin',
    'admin/tally',
    'admin/billing',
  ]) {
    await page.goto(`./#/${path}`);
    await expect(page.locator('main h1').first()).toBeVisible();
    await page.waitForTimeout(500);
    const scan = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        targets: v.nodes.map((n) => n.target),
      })),
      path,
    ).toEqual([]);
  }
  await page.goto('./');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.getByRole('heading', { name: /SMALL CARS/ })).toBeVisible();
});
