import { transact, uid } from './storage';
import type { Coupon, Offer } from '../types';
export function saveCoupon(coupon: Coupon, oldCode = '') {
  const code = coupon.code.toUpperCase().trim();
  if (
    !/^[A-Z0-9]{3,20}$/.test(code) ||
    !Number.isFinite(coupon.percent) ||
    coupon.percent <= 0 ||
    coupon.percent > 100 ||
    !Number.isFinite(coupon.min) ||
    coupon.min < 0
  )
    throw Error('Use a 3–20 character code, discount 1–100%, and a valid minimum spend.');
  transact((d) => {
    if (d.coupons.some((c) => c.code === code && c.code !== oldCode))
      throw Error('That coupon code exists already.');
    const i = d.coupons.findIndex((c) => c.code === oldCode),
      c = { ...coupon, code };
    if (i >= 0) d.coupons[i] = c;
    else d.coupons.push(c);
    if (d.coupon === oldCode) d.coupon = code;
  });
}
export function saveOffer(offer: Offer) {
  if (
    !offer.name.trim() ||
    !offer.description.trim() ||
    !['bundle', 'b2g1'].includes(offer.rule ?? offer.id)
  )
    throw Error('Enter an offer name, description, and supported pricing rule.');
  transact((d) => {
    const i = d.offers.findIndex((o) => o.id === offer.id);
    if (i >= 0) d.offers[i] = offer;
    else d.offers.push({ ...offer, id: offer.id || uid('offer') });
  });
}
export function enableCoupon(code: string, enabled: boolean) {
  transact((d) => {
    const c = d.coupons.find((c) => c.code === code);
    if (c) c.enabled = enabled;
  });
}
export function enableOffer(id: string, enabled: boolean) {
  transact((d) => {
    const o = d.offers.find((o) => o.id === id);
    if (o) o.enabled = enabled;
  });
}
