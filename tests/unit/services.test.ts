import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDemo, getState, transact } from '../../src/services/storage';
import { addToCart, cartTotals, setQuantity, applyCoupon } from '../../src/services/cart';
import {
  placeOrder,
  cancelOrder,
  advanceOrder,
  requestReturn,
  refundOrder,
  delivery,
} from '../../src/services/orders';
import { adjustStock, reconcile, saveProduct } from '../../src/services/inventory';
import { processJobs, retryAll, setOffline } from '../../src/services/tallySync';
import { parseCSV, exportProducts, importProducts } from '../../src/services/csv';
beforeEach(() => {
  vi.useRealTimers();
  resetDemo();
});
const address = () => getState().users[0].addresses[0];
describe('checkout and inventory transactions', () => {
  it('applies a starter bundle, coupon and Indian totals', () => {
    addToCart('p001', 3);
    const t = cartTotals(getState());
    expect(t.subtotal).toBe(747);
    expect(t.bundle).toBe(197);
    expect(t.total).toBe(629);
    applyCoupon('tiny10');
    expect(cartTotals(getState()).total).toBe(574);
  });
  it('decrements stock, snapshots prices, empties cart and queues sales + stock jobs', () => {
    addToCart('p001', 3);
    const before = getState().products[0].stock,
      id = placeOrder(address(), 'UPI'),
      s = getState(),
      o = s.orders.find((o) => o.id === id)!;
    expect(s.products[0].stock).toBe(before - 3);
    expect(s.cart).toEqual([]);
    expect(o.total).toBe(629);
    expect(s.jobs.some((j) => j.reference === id && j.type === 'Sales Voucher')).toBe(true);
    expect(s.jobs.some((j) => j.productId === 'p001' && j.stock === before - 3)).toBe(true);
    const p = s.products[0];
    saveProduct({ ...p, price: 999, mrp: 1099 });
    expect(getState().orders.find((o) => o.id === id)!.items[0].price).toBe(249);
  });
  it('rolls the entire transaction back if stock becomes insufficient', () => {
    addToCart('p001', 3);
    adjustStock('p001', -6, 'Offline sale');
    const before = getState();
    expect(() => placeOrder(address(), 'UPI')).toThrow('only');
    expect(getState()).toBe(before);
    expect(getState().cart[0].quantity).toBe(3);
  });
  it('rejects invalid quantities and never makes stock negative', () => {
    expect(() => addToCart('p001', -1)).toThrow();
    expect(() => adjustStock('p001', -100, 'Damaged')).toThrow();
    expect(() => adjustStock('p001', 0.5, 'Correction')).toThrow();
    addToCart('p001');
    expect(() => setQuantity('p001', 99)).toThrow();
    expect(getState().products[0].stock).toBe(8);
  });
  it('cancels before packing, restores once, and refund never restores twice', () => {
    addToCart('p001', 2);
    const id = placeOrder(address(), 'COD');
    cancelOrder(id);
    expect(getState().products[0].stock).toBe(8);
    expect(() => cancelOrder(id)).toThrow();
    refundOrder(id);
    expect(getState().products[0].stock).toBe(8);
    expect(getState().orders.find((o) => o.id === id)!.status).toBe('Refunded');
  });
  it('prevents cancellation after packing and requires tracking before shipping', () => {
    addToCart('p001');
    const id = placeOrder(address(), 'UPI');
    advanceOrder(id);
    advanceOrder(id);
    expect(() => cancelOrder(id)).toThrow();
    expect(() => advanceOrder(id)).toThrow('tracking');
    advanceOrder(id, 'Demo Courier', 'DEMO123');
    expect(getState().orders.find((o) => o.id === id)!.tracking).toBe('DEMO123');
  });
  it('allows a delivered return within 7 days and restores returned stock once', () => {
    addToCart('p001');
    const id = placeOrder(address(), 'UPI');
    advanceOrder(id);
    advanceOrder(id);
    advanceOrder(id, 'Demo Courier', 'DEMO123');
    advanceOrder(id);
    advanceOrder(id);
    requestReturn(id, 'Damaged packaging', 'data:image/png;base64,DEMO');
    expect(getState().products[0].stock).toBe(7);
    refundOrder(id);
    expect(getState().products[0].stock).toBe(8);
    expect(() => refundOrder(id)).toThrow();
  });
  it('blocks expired returns and invalid delivery PIN codes', () => {
    const o = getState().orders.find((o) => o.userId === 'u1' && o.status === 'Delivered')!;
    transact((d) => {
      d.orders.find((x) => x.id === o.id)!.deliveredAt = new Date(
        Date.now() - 8 * 86400000,
      ).toISOString();
    });
    expect(() => requestReturn(o.id, 'Old')).toThrow();
    expect(() => delivery('012345')).toThrow();
    expect(delivery('560001').available).toBe(true);
    expect(delivery('560000').available).toBe(false);
  });
  it('applies the lowest eligible item free, and disabled offers stop discounting', () => {
    transact((d) => {
      d.products[0].offer = 'b2g1';
    });
    addToCart('p001', 3);
    expect(cartTotals(getState()).free).toBe(249);
    transact((d) => {
      d.offers.find((o) => o.id === 'b2g1')!.enabled = false;
    });
    expect(cartTotals(getState()).free).toBe(0);
  });
});
describe('Tally recovery and reconciliation', () => {
  it('fails while offline with backoff and recovers when reconnected', () => {
    setOffline(true);
    adjustStock('p001', 1, 'Received');
    processJobs(Date.now() + 2000, () => 0.99);
    const job = getState().jobs.find((j) => j.productId === 'p001')!;
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(1);
    expect(job.error).toContain('offline');
    expect(job.nextAt).toBeGreaterThan(Date.now() + 5000);
    setOffline(false);
    retryAll();
    processJobs(Date.now() + 2000, () => 0.99);
    expect(getState().jobs.find((j) => j.id === job.id)!.status).toBe('success');
    expect(getState().tally.stock.p001).toBe(9);
  });
  it('stops auto retries after five attempts but allows a manual retry', () => {
    transact((d) => {
      d.tally.failureRate = 100;
      d.jobs = [
        {
          id: 'test',
          type: 'Sales Voucher',
          reference: 'test',
          status: 'failed',
          attempts: 5,
          at: new Date().toISOString(),
          nextAt: 0,
        },
      ];
    });
    processJobs(Date.now() + 1000);
    expect(getState().jobs[0].attempts).toBe(5);
    retryAll();
    processJobs(Date.now() + 2000);
    expect(getState().jobs[0].attempts).toBe(6);
  });
  it('records both reconciliation paths and makes website/Tally agree', () => {
    expect(getState().tally.stock.p001).toBe(10);
    reconcile('p001', 'tally');
    expect(getState().products[0].stock).toBe(10);
    expect(getState().movements[0].reason).toContain('accepted Tally');
    transact((d) => {
      d.tally.stock.p001 = 12;
    });
    reconcile('p001', 'website');
    expect(getState().tally.stock.p001).toBe(10);
    expect(getState().movements[0].reason).toContain('accepted website');
  });
});
describe('CSV import boundaries', () => {
  it('parses quoted commas, escaped quotes and newlines', () => {
    expect(parseCSV('a,b\r\n"one,two","a ""quote""\nline"')).toEqual([
      ['a', 'b'],
      ['one,two', 'a "quote"\nline'],
    ]);
  });
  it('round-trips the catalogue without deleting order snapshots', () => {
    const csv = exportProducts(),
      count = importProducts(csv);
    expect(count).toBe(60);
    expect(getState().products).toHaveLength(60);
    expect(getState().orders).toHaveLength(25);
    expect(getState().movements[0].reason).toBe('CSV import');
  });
  it('rejects malformed/negative CSV rows without applying partial changes', () => {
    const csv = exportProducts().replace('"249"', '"-249"'),
      before = getState();
    expect(() => importProducts(csv)).toThrow('invalid price');
    expect(getState()).toBe(before);
    expect(() => parseCSV('"never closed')).toThrow();
  });
});
describe('late sync recovery', () => {
  it('does not overwrite newer successful stock with an older retried snapshot', () => {
    transact((d) => {
      d.jobs = [];
      d.tally.failureRate = 0;
    });
    adjustStock('p001', 1, 'First receipt');
    const oldId = getState().jobs[0].id;
    adjustStock('p001', 2, 'Second receipt');
    processJobs(Date.now() + 2000, () => 0.99);
    expect(getState().tally.stock.p001).toBe(11);
    transact((d) => {
      const j = d.jobs.find((j) => j.id === oldId)!;
      j.status = 'pending';
      j.nextAt = 0;
    });
    processJobs(Date.now() + 3000, () => 0.99);
    expect(getState().tally.stock.p001).toBe(11);
  });
});
