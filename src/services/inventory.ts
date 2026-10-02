import { transact, uid } from './storage';
import { queueSync } from './tallySync';
import type { State, Product } from '../types';
export function moveStock(
  d: State,
  id: string,
  delta: number,
  reason: string,
  who = 'Tiny Kars Admin',
  sync = true,
) {
  const p = d.products.find((p) => p.id === id);
  if (!p) throw Error('This model is no longer available.');
  if (!Number.isInteger(delta) || p.stock + delta < 0)
    throw Error('Stock must be a whole number and cannot go below zero.');
  const before = p.stock;
  p.stock += delta;
  d.movements.unshift({
    id: uid('move'),
    productId: id,
    sku: p.sku,
    before,
    after: p.stock,
    reason,
    who,
    at: new Date().toISOString(),
  });
  if (sync) queueSync(d, 'Stock Adjustment', p.sku, id, p.stock);
}
export function adjustStock(id: string, delta: number, reason: string) {
  transact((d) => moveStock(d, id, delta, reason));
}
export function reconcile(id: string, source: 'website' | 'tally') {
  transact((d) => {
    const p = d.products.find((p) => p.id === id);
    if (!p) return;
    if (source === 'tally') {
      moveStock(d, id, (d.tally.stock[id] ?? p.stock) - p.stock, 'Reconciliation: accepted Tally');
    } else {
      moveStock(d, id, 0, 'Reconciliation: accepted website');
      d.tally.stock[id] = p.stock;
    }
  });
}
export function saveProduct(product: Product) {
  if (
    !product.name.trim() ||
    !product.sku.trim() ||
    !product.brand.trim() ||
    !Number.isFinite(product.price) ||
    product.price < 0 ||
    !Number.isFinite(product.mrp) ||
    product.mrp < product.price ||
    !Number.isInteger(product.stock) ||
    product.stock < 0 ||
    !Number.isInteger(product.threshold) ||
    product.threshold < 0
  )
    throw Error(
      'Enter a name, unique SKU, valid price/MRP, stock, and threshold. MRP must be at least the price.',
    );
  transact((d) => {
    if (d.products.some((p) => p.sku === product.sku && p.id !== product.id))
      throw Error('That SKU already exists.');
    const old = d.products.find((p) => p.id === product.id);
    if (old) {
      const previous = old.stock;
      Object.assign(old, { ...product, stock: previous });
      if (previous !== product.stock)
        moveStock(d, product.id, product.stock - previous, 'Product edit');
    } else {
      d.products.unshift({ ...product, stock: 0 });
      moveStock(d, product.id, product.stock, 'New product received');
      d.tally.mapping[product.id] = `${product.brand} ${product.name}`;
    }
  });
}
export function deleteProduct(id: string) {
  transact((d) => {
    if (d.cart.some((c) => c.productId === id))
      throw Error('Remove this model from the cart before deleting.');
    const p = d.products.find((p) => p.id === id);
    if (p) {
      queueSync(d, 'Stock Adjustment', `${p.sku} archived`, id, 0);
      d.products = d.products.filter((p) => p.id !== id);
      d.wishlist = d.wishlist.filter((x) => x !== id);
      delete d.tally.stock[id];
      delete d.tally.mapping[id];
    }
  });
}
