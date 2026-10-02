import { getState, transact } from './storage';
import type { State, CartItem } from '../types';
export function cartTotals(state: State, cart: CartItem[] = state.cart) {
  const lines = cart
    .map((c) => ({
      product: state.products.find((p) => p.id === c.productId)!,
      quantity: c.quantity,
    }))
    .filter((c) => c.product);
  const subtotal = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
  let bundle = 0,
    free = 0;
  for (const offer of state.offers.filter((o) => o.enabled)) {
    const prices = lines
      .filter((l) => l.product.offer === offer.id)
      .flatMap((l) => Array(l.quantity).fill(l.product.price) as number[])
      .sort((a, b) => b - a);
    const rule = offer.rule ?? offer.id;
    for (let i = 0; i + 2 < prices.length; i += 3) {
      if (rule === 'bundle') bundle += Math.max(0, prices[i] + prices[i + 1] + prices[i + 2] - 550);
      if (rule === 'b2g1') free += prices[i + 2];
    }
  }
  const coupon = state.coupons.find(
    (c) => c.code === state.coupon && c.enabled && subtotal >= c.min,
  );
  const couponDiscount = coupon
    ? Math.round(((subtotal - bundle - free) * coupon.percent) / 100)
    : 0;
  const discount = bundle + free + couponDiscount;
  const shipping = subtotal === 0 || subtotal - discount >= 1499 ? 0 : 79;
  const gst = state.commerce.gstEnabled
    ? Math.round((subtotal - discount) * state.commerce.gstRate) / 100
    : 0;
  const total = Math.round((subtotal - discount + shipping + gst) * 100) / 100;
  return {
    lines,
    subtotal,
    bundle,
    free,
    couponDiscount,
    discount,
    shipping,
    total,
    gst,
    count: lines.reduce((n, l) => n + l.quantity, 0),
  };
}
export function addToCart(id: string, quantity = 1) {
  transact((d) => {
    const p = d.products.find((p) => p.id === id);
    if (!p || p.stock === 0) throw Error('This model is sold out.');
    if (!Number.isInteger(quantity) || quantity <= 0) throw Error('Choose a valid quantity.');
    const item = d.cart.find((c) => c.productId === id);
    if ((item?.quantity ?? 0) + quantity > p.stock)
      throw Error(`Only ${p.stock} available for this model.`);
    if (item) item.quantity += quantity;
    else d.cart.push({ productId: id, quantity });
  });
}
export function setQuantity(id: string, quantity: number) {
  transact((d) => {
    if (quantity === 0) {
      d.cart = d.cart.filter((c) => c.productId !== id);
      return;
    }
    const p = d.products.find((p) => p.id === id);
    if (!p || !Number.isInteger(quantity) || quantity < 0 || quantity > p.stock)
      throw Error(`Available stock: ${p?.stock ?? 0}.`);
    const c = d.cart.find((c) => c.productId === id);
    if (c) c.quantity = quantity;
  });
}
export function toggleWishlist(id: string) {
  transact((d) => {
    d.wishlist = d.wishlist.includes(id) ? d.wishlist.filter((p) => p !== id) : [...d.wishlist, id];
    d.wishlistByUser ??= {};
    d.wishlistByUser[d.userId ?? 'guest'] = [...d.wishlist];
  });
}
export function applyCoupon(code: string) {
  const coupon = getState().coupons.find((c) => c.code === code.toUpperCase().trim() && c.enabled);
  if (!coupon) throw Error('That coupon is unavailable. Try TINY10.');
  if (cartTotals(getState()).subtotal < coupon.min)
    throw Error(`Minimum spend for ${coupon.code}: ₹${coupon.min}.`);
  transact((d) => {
    d.coupon = coupon.code;
  });
}
