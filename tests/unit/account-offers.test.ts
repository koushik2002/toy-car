import { beforeEach, it, expect } from 'vitest';
import { resetDemo, getState, transact } from '../../src/services/storage';
import { login, loginPhone, saveProfile } from '../../src/services/account';
import { toggleWishlist, addToCart, cartTotals } from '../../src/services/cart';
import { saveOffer, saveCoupon } from '../../src/services/offers';
import { pullStock, processJobs, setOffline } from '../../src/services/tallySync';
beforeEach(resetDemo);
it('keeps wishlists specific to each collector', () => {
  toggleWishlist('p001');
  login('u2');
  expect(getState().wishlist).toEqual([]);
  toggleWishlist('p002');
  login('u1');
  expect(getState().wishlist).toEqual(['p001']);
});
it('validates demo OTP and creates a persistent collector profile', () => {
  expect(() => loginPhone('9876512345', '000000')).toThrow('Demo OTP');
  const id = loginPhone('9876512345', '123456');
  saveProfile('Ananya Rao', 'ananya@example.com');
  expect(getState().users.find((u) => u.id === id)!.name).toBe('Ananya Rao');
});
it('creates a usable custom offer rule and validates unique coupons', () => {
  saveOffer({
    id: 'launch',
    name: 'Launch bundle',
    description: 'Three starter models for ₹550',
    enabled: true,
    rule: 'bundle',
  });
  transact((d) => {
    d.products[0].offer = 'launch';
  });
  addToCart('p001', 3);
  expect(cartTotals(getState()).bundle).toBe(197);
  saveCoupon({ code: 'WELCOME', percent: 12, min: 0, enabled: true });
  expect(() => saveCoupon({ code: 'WELCOME', percent: 10, min: 0, enabled: true })).toThrow(
    'exists',
  );
});
it('does not apply a failed stock pull until it succeeds', () => {
  const before = getState().tally.stock.p001;
  setOffline(true);
  pullStock();
  processJobs(Date.now() + 2000, () => 0.99);
  expect(getState().tally.stock.p001).toBe(before);
  setOffline(false);
  processJobs(Date.now() + 20000, () => 0.99);
  expect(getState().tally.stock.p001).toBe(11);
});
