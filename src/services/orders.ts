import { getState, transact, uid } from './storage';
import { cartTotals } from './cart';
import { moveStock } from './inventory';
import { queueSync } from './tallySync';
import { stages } from '../data/seed';
import type { Address, Order, OrderStatus } from '../types';
export const validPin = (pin: string) => /^[1-9]\d{5}$/.test(pin);
export const validPhone = (phone: string) => /^[6-9]\d{9}$/.test(phone);
export function delivery(pin: string) {
  if (!validPin(pin)) throw Error('Enter a valid six-digit Indian PIN code.');
  return pin.endsWith('000')
    ? { available: false, message: 'This PIN code is outside the demo delivery area.' }
    : {
        available: true,
        message: `Delivery in ${['56', '40', '50', '60', '11'].some((p) => pin.startsWith(p)) ? '2–4' : '4–7'} business days · Confirm delivery on WhatsApp`,
      };
}
export function placeOrder(address: Address, payment: Order['payment'] = 'WhatsApp') {
  if (
    !address.name.trim() ||
    !address.line.trim() ||
    !address.city.trim() ||
    !address.state.trim() ||
    !validPhone(address.phone) ||
    !delivery(address.pin).available
  )
    throw Error('Complete a valid Indian delivery address.');
  const id = uid(`TK-${new Date().getFullYear()}`).toUpperCase();
  transact((d) => {
    if (!d.userId) throw Error('Sign in to place your demo order.');
    const t = cartTotals(d);
    if (!t.count) throw Error('Your garage is empty.');
    for (const l of t.lines) {
      if (l.quantity > l.product.stock)
        throw Error(`${l.product.name} has only ${l.product.stock} available.`);
    }
    const at = new Date().toISOString();
    const order: Order = {
      id,
      userId: d.userId,
      items: t.lines.map((l) => ({
        productId: l.product.id,
        name: l.product.name,
        sku: l.product.sku,
        price: l.product.price,
        quantity: l.quantity,
        image: l.product.image,
      })),
      subtotal: t.subtotal,
      discount: t.discount,
      shipping: t.shipping,
      total: t.total,
      gst: t.gst,
      gstRate: d.commerce.gstEnabled ? d.commerce.gstRate : 0,
      billing: {
        sellerName: d.commerce.sellerName,
        sellerAddress: d.commerce.sellerAddress,
        gstin: d.commerce.gstEnabled ? d.commerce.gstin : '',
      },
      status: 'Placed',
      at,
      address: { ...address },
      payment,
      paid: false,
      timeline: [{ status: 'Placed', at }],
    };
    t.lines.forEach((l) => {
      moveStock(d, l.product.id, -l.quantity, `Online order ${id}`, 'Customer checkout', false);
      l.product.sold += l.quantity;
      queueSync(d, 'Stock Adjustment', l.product.sku, l.product.id, l.product.stock);
    });
    d.orders.unshift(order);
    queueSync(d, 'Sales Voucher', id);
    d.cart = [];
    d.coupon = '';
  });
  return id;
}
function restore(d: ReturnType<typeof getState>, o: Order, reason: string) {
  if (o.stockRestored) return;
  o.items.forEach((i) => {
    if (d.products.some((p) => p.id === i.productId)) moveStock(d, i.productId, i.quantity, reason);
  });
  o.stockRestored = true;
}
export function cancelOrder(id: string) {
  transact((d) => {
    const o = d.orders.find((o) => o.id === id);
    if (!o || o.userId !== d.userId) throw Error('Order not found.');
    if (!['Placed', 'Confirmed'].includes(o.status))
      throw Error('Only orders before packing can be cancelled.');
    restore(d, o, `Cancelled ${id}`);
    o.status = 'Cancelled';
    o.timeline.push({ status: 'Cancelled', at: new Date().toISOString() });
    queueSync(d, 'Sales Voucher', `Cancellation ${id}`);
  });
}
export function canReturn(o: Order) {
  return (
    o.status === 'Delivered' &&
    !!o.deliveredAt &&
    Date.now() - new Date(o.deliveredAt).getTime() <= 7 * 86400000
  );
}
export function requestReturn(id: string, reason: string, photo?: string) {
  if (!reason.trim()) throw Error('Tell us why you want to return this model.');
  transact((d) => {
    const o = d.orders.find((o) => o.id === id);
    if (!o || o.userId !== d.userId || !canReturn(o))
      throw Error('Returns are available within seven days of delivery.');
    o.status = 'Return requested';
    o.returnReason = reason;
    o.returnPhoto = photo;
    o.timeline.push({ status: 'Return requested', at: new Date().toISOString(), note: reason });
  });
}
export function advanceOrder(id: string, courier?: string, tracking?: string) {
  transact((d) => {
    const o = d.orders.find((o) => o.id === id);
    if (!o) throw Error('Order not found.');
    const idx = stages.indexOf(o.status);
    if (idx < 0 || idx === stages.length - 1) throw Error('This order cannot advance.');
    const next = stages[idx + 1];
    if (next === 'Shipped' && (!courier?.trim() || !tracking?.trim()))
      throw Error('Add a courier and tracking ID before shipping.');
    o.status = next;
    o.timeline.push({ status: next, at: new Date().toISOString() });
    if (next === 'Shipped') {
      o.courier = courier;
      o.tracking = tracking;
    }
    if (next === 'Delivered') o.deliveredAt = new Date().toISOString();
  });
}
export function refundOrder(id: string) {
  transact((d) => {
    const o = d.orders.find((o) => o.id === id);
    if (!o || !['Cancelled', 'Return requested'].includes(o.status))
      throw Error('Refund a cancelled order or a requested return.');
    restore(d, o, `Refund ${id}`);
    o.status = 'Refunded';
    o.paid = false;
    o.timeline.push({
      status: 'Refunded',
      at: new Date().toISOString(),
      note: 'Demo refund processed',
    });
    queueSync(d, 'Sales Voucher', `Refund ${id}`);
  });
}
export function markCollected(id: string) {
  transact((d) => {
    const o = d.orders.find((o) => o.id === id);
    if (o && !['Cancelled', 'Refunded'].includes(o.status)) o.paid = true;
  });
}
export function reorder(id: string) {
  transact((d) => {
    const o = d.orders.find((o) => o.id === id);
    if (!o) throw Error('Order not found.');
    const next = structuredClone(d.cart);
    for (const i of o.items) {
      const p = d.products.find((p) => p.id === i.productId);
      if (!p || p.stock === 0) throw Error(`${i.name} is currently sold out.`);
      const existing = next.find((c) => c.productId === i.productId);
      const count = (existing?.quantity ?? 0) + i.quantity;
      if (count > p.stock) throw Error(`Only ${p.stock} ${i.name} available.`);
      if (existing) existing.quantity = count;
      else next.push({ productId: i.productId, quantity: i.quantity });
    }
    d.cart = next;
  });
}
