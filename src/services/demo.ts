import { transact, uid } from './storage';
import { moveStock } from './inventory';
import { queueSync } from './tallySync';
export function simulateOrder() {
  transact((d) => {
    const p = d.products.find((p) => p.stock > 3);
    const u = d.users.find((u) => u.role === 'customer' && u.addresses.length);
    if (!p || !u) throw Error('No stocked model or demo address available.');
    const id = uid('TK-DEMO').toUpperCase(),
      at = new Date().toISOString(),
      shipping = p.price >= 1499 ? 0 : 79;
    moveStock(d, p.id, -1, `New demo order ${id}`, 'Demo event');
    d.orders.unshift({
      id,
      userId: u.id,
      items: [
        { productId: p.id, name: p.name, sku: p.sku, price: p.price, quantity: 1, image: p.image },
      ],
      subtotal: p.price,
      discount: 0,
      shipping,
      total: p.price + shipping,
      gst: Math.round(((p.price * 18) / 118) * 100) / 100,
      status: 'Placed',
      at,
      address: { ...u.addresses[0] },
      payment: 'UPI',
      paid: true,
      timeline: [{ status: 'Placed', at }],
    });
    queueSync(d, 'Sales Voucher', id);
  });
}
export function simulateLowStock() {
  transact((d) => {
    const p = d.products.find((p) => p.stock > 3);
    if (p) moveStock(d, p.id, 2 - p.stock, 'Demo event: stock runs low');
  });
}
export function simulateSyncFailure() {
  transact((d) => {
    const at = new Date().toISOString();
    d.jobs.unshift({
      id: uid('sync'),
      type: 'Sales Voucher',
      reference: 'DEMO-FAILURE',
      status: 'failed',
      attempts: 1,
      error: 'Simulated timeout for the guided demo. Retry to recover.',
      at,
      nextAt: Date.now() + 15000,
    });
  });
}
