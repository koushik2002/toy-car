import type { Bill, BillLine, CommerceSettings, Order } from '../types';
import { getState, transact } from './storage';
import { normalizeWhatsAppNumber } from './whatsapp';

export const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function billTotals(items: BillLine[], discount: number, shipping: number, rate = 0) {
  if (!items.length) throw Error('Add at least one item to the bill.');
  for (const item of items) {
    if (
      !item.name.trim() ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      !Number.isFinite(item.price) ||
      item.price < 0
    )
      throw Error('Each item needs a name, a positive whole quantity and a valid price.');
  }
  const subtotal = roundMoney(
    items.reduce((sum, item) => sum + roundMoney(item.price * item.quantity), 0),
  );
  if (
    ![subtotal, discount, shipping, rate].every(Number.isFinite) ||
    discount < 0 ||
    discount > subtotal ||
    shipping < 0 ||
    rate < 0 ||
    rate > 100
  )
    throw Error('Check the discount, shipping and GST rate. Discount cannot exceed the subtotal.');
  discount = roundMoney(discount);
  shipping = roundMoney(shipping);
  const gst = roundMoney(((subtotal - discount) * rate) / 100);
  return {
    subtotal,
    discount,
    shipping,
    gst,
    total: roundMoney(subtotal - discount + shipping + gst),
  };
}
export function saveCommerceSettings(settings: CommerceSettings) {
  const whatsappNumber = normalizeWhatsAppNumber(settings.whatsappNumber);
  if (!settings.sellerName.trim()) throw Error('Enter the business name.');
  if (!Number.isFinite(settings.gstRate) || settings.gstRate < 0 || settings.gstRate > 100)
    throw Error('GST rate must be between 0 and 100.');
  const gstin = settings.gstin.trim().toUpperCase();
  if (settings.gstEnabled && !/^[0-9A-Z]{15}$/.test(gstin))
    throw Error('Add a 15-character GSTIN before enabling GST.');
  transact((d) => {
    d.commerce = { ...settings, whatsappNumber, sellerName: settings.sellerName.trim(), gstin };
  });
}
export interface BillInput {
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  items: BillLine[];
  discount: number;
  shipping: number;
  note: string;
}
export function generateBill(input: BillInput) {
  if (!input.customerName.trim()) throw Error('Enter the customer name.');
  if (input.customerPhone && !/^[6-9]\d{9}$/.test(input.customerPhone))
    throw Error('Enter a valid ten-digit customer phone number.');
  const settings = getState().commerce;
  const gstRate = settings.gstEnabled ? settings.gstRate : 0;
  const totals = billTotals(input.items, input.discount, input.shipping, gstRate);
  return storeBill({
    ...input,
    ...totals,
    customerName: input.customerName.trim(),
    sellerName: settings.sellerName,
    sellerAddress: settings.sellerAddress,
    gstEnabled: settings.gstEnabled,
    gstRate,
    gstin: settings.gstEnabled ? settings.gstin : '',
  });
}
function storeBill(input: Omit<Bill, 'id' | 'at'>) {
  let bill!: Bill;
  transact((d) => {
    const prefix = `TK-BILL-${new Date().getFullYear()}-`;
    let number = 1;
    while (d.bills.some((b) => b.id === `${prefix}${String(number).padStart(4, '0')}`)) number++;
    bill = {
      ...structuredClone(input),
      id: `${prefix}${String(number).padStart(4, '0')}`,
      at: new Date().toISOString(),
    };
    d.bills.unshift(bill);
  });
  return bill;
}
export function generateOrderBill(order: Order) {
  const existing = getState().bills.find((b) => b.orderId === order.id);
  if (existing) return existing;
  const settings = getState().commerce;
  return storeBill({
    orderId: order.id,
    customerName: order.address.name,
    customerPhone: order.address.phone,
    customerAddress: `${order.address.line}, ${order.address.city}, ${order.address.state} ${order.address.pin}`,
    items: order.items.map((i) => ({
      name: i.name,
      sku: i.sku,
      quantity: i.quantity,
      price: i.price,
    })),
    subtotal: order.subtotal,
    discount: order.discount,
    shipping: order.shipping,
    gst: order.gst,
    total: order.total,
    sellerName: order.billing?.sellerName ?? settings.sellerName,
    sellerAddress: order.billing?.sellerAddress ?? settings.sellerAddress,
    gstEnabled: order.gst > 0,
    gstRate: order.gstRate ?? 0,
    gstin: order.gst > 0 ? (order.billing?.gstin ?? settings.gstin) : '',
    note: 'Payment is arranged directly with Tiny Kars. Please retain your order reference.',
  });
}
