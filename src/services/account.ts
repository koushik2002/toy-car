import { transact, uid } from './storage';
import { validPhone, validPin } from './orders';
import type { Address, State } from '../types';
function switchWishlist(d: State, id: string | null) {
  d.wishlistByUser ??= {};
  d.wishlistByUser[d.userId ?? 'guest'] = [...d.wishlist];
  d.wishlist = (d.wishlistByUser[id ?? 'guest'] ?? []).filter((id) =>
    d.products.some((p) => p.id === id),
  );
}
export function login(id: string) {
  transact((d) => {
    const u = d.users.find((u) => u.id === id);
    if (!u) throw Error('Choose a demo user.');
    switchWishlist(d, id);
    d.userId = id;
    d.role = u.role;
  });
}
export function loginPhone(phone: string, otp: string) {
  if (!validPhone(phone)) throw Error('Enter a 10-digit Indian mobile number.');
  if (otp !== '123456') throw Error('Use the displayed Demo OTP: 123456.');
  let id = '';
  transact((d) => {
    let u = d.users.find((u) => u.phone === phone);
    if (!u) {
      u = {
        id: uid('user'),
        name: 'New Collector',
        phone,
        email: '',
        role: 'customer',
        addresses: [],
      };
      d.users.push(u);
    }
    id = u.id;
    switchWishlist(d, id);
    d.userId = id;
    d.role = u.role;
  });
  return id;
}
export function logout() {
  transact((d) => {
    switchWishlist(d, null);
    d.userId = null;
    d.role = 'customer';
  });
}
export function saveAddress(address: Address) {
  if (
    !address.name.trim() ||
    !address.line.trim() ||
    !address.city.trim() ||
    !address.state.trim() ||
    !validPhone(address.phone) ||
    !validPin(address.pin)
  )
    throw Error('Complete a valid address and phone number.');
  transact((d) => {
    const u = d.users.find((u) => u.id === d.userId);
    if (!u) throw Error('Please sign in first.');
    const i = u.addresses.findIndex((a) => a.id === address.id);
    if (i >= 0) u.addresses[i] = address;
    else u.addresses.push({ ...address, id: address.id || uid('address') });
  });
}
export function saveProfile(name: string, email: string) {
  if (!name.trim()) throw Error('Enter your name.');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Error('Enter a valid email address.');
  transact((d) => {
    const u = d.users.find((u) => u.id === d.userId);
    if (u) {
      u.name = name;
      u.email = email;
    }
  });
}
