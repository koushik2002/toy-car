import { beforeEach, expect, it } from 'vitest';
import { resetDemo, getState } from '../../src/services/storage';
import {
  billTotals,
  generateBill,
  generateOrderBill,
  saveCommerceSettings,
} from '../../src/services/billing';
import { addToCart, cartTotals } from '../../src/services/cart';
import { placeOrder, markCollected } from '../../src/services/orders';
import { normalizeWhatsAppNumber, whatsappOrderLink } from '../../src/services/whatsapp';
beforeEach(resetDemo);
const input = () => ({
  customerName: 'Vishwas',
  customerPhone: '9876500001',
  customerAddress: 'Bengaluru',
  items: [{ name: 'Mini car', sku: 'TK-0001', price: 249.5, quantity: 2 }],
  discount: 49,
  shipping: 79,
  note: 'Thank you',
});
it('creates unique saved bills with no GST and without changing stock', () => {
  const before = getState().products[0].stock;
  const first = generateBill(input()),
    second = generateBill(input());
  expect(first.total).toBe(529);
  expect(first.gst).toBe(0);
  expect(first.gstin).toBe('');
  expect(second.id).not.toBe(first.id);
  expect(getState().bills).toHaveLength(2);
  expect(getState().products[0].stock).toBe(before);
});
it('rounds decimal amounts and rejects malformed bills without saving partial data', () => {
  expect(
    billTotals([{ name: 'Model', sku: '', price: 123.45, quantity: 2 }], 10.1, 20.5, 18),
  ).toEqual({ subtotal: 246.9, discount: 10.1, shipping: 20.5, gst: 42.62, total: 299.92 });
  for (const quantity of [0, -1, 1.5, NaN])
    expect(() =>
      generateBill({ ...input(), items: [{ ...input().items[0], quantity }] }),
    ).toThrow();
  expect(() => generateBill({ ...input(), discount: 1000 })).toThrow();
  expect(() => generateBill({ ...input(), shipping: NaN })).toThrow();
  expect(getState().bills).toEqual([]);
});
it('keeps saved bill amounts unchanged after future GST settings change', () => {
  const first = generateBill(input());
  saveCommerceSettings({
    ...getState().commerce,
    gstEnabled: true,
    gstRate: 18,
    gstin: '29ABCDE1234F1Z5',
  });
  const taxed = generateBill(input());
  expect(taxed.gst).toBe(81);
  expect(taxed.total).toBe(610);
  expect(taxed.gstin).toBe('29ABCDE1234F1Z5');
  expect(getState().bills.find((b) => b.id === first.id)!.total).toBe(529);
  expect(() => saveCommerceSettings({ ...getState().commerce, gstin: '' })).toThrow('GSTIN');
});
it('leaves WhatsApp orders unpaid until admin records a received payment', () => {
  addToCart('p001', 3);
  const id = placeOrder(getState().users[0].addresses[0]);
  const order = getState().orders.find((o) => o.id === id)!;
  expect(order.payment).toBe('WhatsApp');
  expect(order.paid).toBe(false);
  expect(order.gst).toBe(0);
  const url = new URL(whatsappOrderLink('+91 88615 02026', order));
  expect(url.pathname).toBe('/918861502026');
  expect(url.searchParams.get('text')).toContain('× 3 — ₹747');
  expect(url.searchParams.get('text')).toContain('Total: ₹629');
  expect(url.searchParams.get('text')).toContain('Name: Vishwas');
  markCollected(id);
  expect(getState().orders.find((o) => o.id === id)!.paid).toBe(true);
});
it('preserves order tax and seller snapshots when generating a bill later', () => {
  saveCommerceSettings({
    ...getState().commerce,
    gstEnabled: true,
    gstRate: 18,
    gstin: '29ABCDE1234F1Z5',
  });
  addToCart('p001', 3);
  expect(cartTotals(getState()).total).toBe(728);
  const id = placeOrder(getState().users[0].addresses[0]);
  const order = getState().orders.find((o) => o.id === id)!;
  saveCommerceSettings({ ...getState().commerce, gstEnabled: false, gstRate: 5, gstin: '' });
  const bill = generateOrderBill(order);
  expect(bill.total).toBe(728);
  expect(bill.gst).toBe(99);
  expect(bill.gstRate).toBe(18);
  expect(bill.gstin).toBe('29ABCDE1234F1Z5');
  expect(generateOrderBill(order).id).toBe(bill.id);
  expect(getState().bills).toHaveLength(1);
});
it('rejects incomplete WhatsApp numbers instead of sending orders to a placeholder', () => {
  expect(() => normalizeWhatsAppNumber('+91')).toThrow();
  expect(() => normalizeWhatsAppNumber('918861')).toThrow();
  expect(normalizeWhatsAppNumber('+91 88615-02026')).toBe('918861502026');
});
