import type { Order } from '../types';
import { money } from './format';

export function normalizeWhatsAppNumber(value: string) {
  const digits = value.replace(/[\s()+-]/g, '');
  if (!/^[1-9]\d{7,14}$/.test(digits))
    throw Error('Enter a full WhatsApp number with country code.');
  if (digits.startsWith('91') && !/^91[6-9]\d{9}$/.test(digits))
    throw Error('Enter +91 followed by a valid ten-digit mobile number.');
  return digits;
}
export function orderMessage(order: Order) {
  return [
    `Hello Tiny Kars! I would like to order these collectibles.`,
    `Order reference: ${order.id}`,
    '',
    ...order.items.map(
      (i) => `${i.name} (${i.sku}) × ${i.quantity} — ${money(i.price * i.quantity)}`,
    ),
    '',
    `Subtotal: ${money(order.subtotal)}`,
    `Discount: ${money(order.discount)}`,
    `Shipping: ${order.shipping ? money(order.shipping) : 'FREE'}`,
    `GST: ${order.gst ? money(order.gst) : 'Not charged'}`,
    `Total: ${money(order.total)}`,
    '',
    `Name: ${order.address.name}`,
    `Phone: ${order.address.phone}`,
    `Delivery: ${order.address.line}, ${order.address.city}, ${order.address.state} ${order.address.pin}`,
    '',
    'Please confirm availability, delivery and payment instructions. Payment is pending.',
  ].join('\n');
}
export function whatsappOrderLink(number: string, order: Order) {
  return `https://wa.me/${normalizeWhatsAppNumber(number)}?text=${encodeURIComponent(orderMessage(order))}`;
}
