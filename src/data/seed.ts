import products from './products.json';
import users from './users.json';
import orders from './orders.json';
import settings from './settings.json';
import type { State, Order, OrderStatus } from '../types';
export const stages: OrderStatus[] = [
  'Placed',
  'Confirmed',
  'Packed',
  'Shipped',
  'Out for delivery',
  'Delivered',
];
export const defaultCommerce = {
  whatsappNumber: '918861502026',
  sellerName: 'Tiny Kars',
  sellerAddress: '',
  gstEnabled: false,
  gstRate: 18,
  gstin: '',
};
export function seed(): State {
  const now = Date.now();
  const seededOrders = orders.map(({ daysAgo, ...o }) => {
    const at = new Date(now - daysAgo * 86400000 - 3600000).toISOString();
    const index = stages.indexOf(o.status as OrderStatus);
    const timeline = stages
      .slice(0, index >= 0 ? index + 1 : o.status === 'Cancelled' ? 2 : 6)
      .map((status, j) => ({
        status,
        at: new Date(new Date(at).getTime() + j * 600000).toISOString(),
      }));
    if (index < 0)
      timeline.push({
        status: o.status as OrderStatus,
        at: new Date(new Date(at).getTime() + 3600000).toISOString(),
      });
    return {
      ...o,
      at,
      timeline,
      deliveredAt: ['Delivered', 'Return requested', 'Refunded'].includes(o.status)
        ? new Date(new Date(at).getTime() + 3000000).toISOString()
        : undefined,
    } as Order;
  });
  const movements = Array.from({ length: 25 }, (_, i) => ({
    id: `m-seed-${i}`,
    productId: products[i].id,
    sku: products[i].sku,
    before: products[i].stock + 2,
    after: products[i].stock,
    reason: i % 3 === 0 ? 'Sold offline' : 'Received / seed history',
    who: 'Tiny Kars Admin',
    at: new Date(now - i * 14400000).toISOString(),
  }));
  const jobs = seededOrders.map((o, i) => ({
    id: `sync-seed-${i}`,
    type: (i % 3 === 0 ? 'Stock Adjustment' : 'Sales Voucher') as
      'Stock Adjustment' | 'Sales Voucher',
    reference: o.id,
    status: (i % 7 === 0 ? 'failed' : i % 8 === 0 ? 'pending' : 'success') as
      'failed' | 'pending' | 'success',
    attempts: i % 7 === 0 ? 1 : 1,
    error: i % 7 === 0 ? 'Demo bridge timed out. Retry to reconnect.' : undefined,
    at: o.at,
    nextAt: now + (i % 7 === 0 ? 15000 : 2000),
  }));
  return {
    version: 2,
    commerce: { ...defaultCommerce },
    bills: [],
    products: structuredClone(products) as State['products'],
    users: structuredClone(users) as State['users'],
    cart: [],
    wishlist: [],
    notifications: [],
    orders: seededOrders,
    movements,
    jobs,
    ...structuredClone(settings),
    userId: 'u1',
    role: 'customer',
    coupon: '',
    tally: {
      offline: false,
      failureRate: 15,
      autoRetry: true,
      stock: Object.fromEntries(
        products.map((p, i) => [p.id, Math.max(0, p.stock + (i % 13 === 0 ? 2 : 0))]),
      ),
      mapping: Object.fromEntries(products.map((p) => [p.id, `${p.brand} ${p.name} ${p.scale}`])),
      lastSync: new Date(now - 3600000).toISOString(),
      company: 'Tiny Kars Collectibles (Demo)',
    },
  };
}
