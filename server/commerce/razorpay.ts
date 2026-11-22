import { createHmac, timingSafeEqual } from 'node:crypto';

export interface RazorpayCredentials {
  keyId: string;
  keySecret: string;
  webhookSecret: string;
}
export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}
export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
  captured: boolean;
}
export interface RazorpayRefund {
  id: string;
  payment_id: string;
  amount: number;
  status: 'pending' | 'processed' | 'failed';
}

function safeEqualHex(received: string, expected: string) {
  if (!/^[a-f0-9]{64}$/i.test(received)) return false;
  return timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expected, 'hex'));
}
export function verifyCheckoutSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
) {
  const expected = createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  return safeEqualHex(signature, expected);
}
export function verifyWebhookSignature(
  rawBody: Buffer | string,
  signature: string,
  webhookSecret: string,
) {
  const expected = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(signature, expected);
}
export function capturedPaymentMatches(payment: RazorpayPayment, order: RazorpayOrder) {
  return (
    payment.status === 'captured' &&
    payment.captured === true &&
    payment.order_id === order.id &&
    payment.amount === order.amount &&
    payment.currency === 'INR' &&
    order.currency === 'INR'
  );
}

export class RazorpayClient {
  constructor(
    private credentials: Pick<RazorpayCredentials, 'keyId' | 'keySecret'>,
    private transport: typeof fetch = fetch,
  ) {}
  private async call<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.transport(`https://api.razorpay.com/v1${path}`, {
      ...init,
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.credentials.keyId}:${this.credentials.keySecret}`).toString('base64')}`,
        'Content-Type': 'application/json',
        ...init.headers,
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Razorpay API returned HTTP ${response.status}.`);
    return response.json() as Promise<T>;
  }
  async createOrder(amount: number, receipt: string): Promise<RazorpayOrder> {
    if (
      !Number.isSafeInteger(amount) ||
      amount < 100 ||
      amount > 2147483647 ||
      !/^[A-Za-z0-9_-]{1,40}$/.test(receipt)
    )
      throw new Error('Invalid payment amount or receipt.');
    const result = await this.call<RazorpayOrder>('/orders', {
      method: 'POST',
      body: JSON.stringify({ amount, currency: 'INR', receipt }),
    });
    if (!result.id || result.amount !== amount || result.currency !== 'INR')
      throw new Error('Razorpay returned an unexpected order.');
    return result;
  }
  async fetchPayment(id: string): Promise<RazorpayPayment> {
    if (!/^pay_[A-Za-z0-9]+$/.test(id)) throw new Error('Invalid payment identifier.');
    return this.call<RazorpayPayment>(`/payments/${id}`, { method: 'GET' });
  }
  async createRefund(paymentId: string, amount: number, receipt: string): Promise<RazorpayRefund> {
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) throw new Error('Invalid payment identifier.');
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 2147483647)
      throw new Error('Invalid refund amount.');
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(receipt)) throw new Error('Invalid refund receipt.');
    const result = await this.call<RazorpayRefund>(`/payments/${paymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, speed: 'normal', receipt }),
    });
    if (
      !/^rfnd_[A-Za-z0-9]+$/.test(result.id) ||
      result.payment_id !== paymentId ||
      result.amount !== amount ||
      !['pending', 'processed', 'failed'].includes(result.status)
    )
      throw new Error('Razorpay returned an unexpected refund.');
    return result;
  }
  async fetchRefund(id: string): Promise<RazorpayRefund> {
    if (!/^rfnd_[A-Za-z0-9]+$/.test(id)) throw new Error('Invalid refund identifier.');
    const result = await this.call<RazorpayRefund>(`/refunds/${id}`, { method: 'GET' });
    if (
      result.id !== id ||
      !/^pay_[A-Za-z0-9]+$/.test(result.payment_id) ||
      !Number.isSafeInteger(result.amount) ||
      result.amount < 1 ||
      !['pending', 'processed', 'failed'].includes(result.status)
    )
      throw new Error('Razorpay returned an unexpected refund.');
    return result;
  }
}
