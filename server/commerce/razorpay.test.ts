import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  capturedPaymentMatches,
  RazorpayClient,
  verifyCheckoutSignature,
  verifyWebhookSignature,
} from './razorpay.js';

describe('Razorpay payment boundary', () => {
  it('verifies checkout with the server order id and rejects tampering', () => {
    const signature = createHmac('sha256', 'private-key').update('order_123|pay_456').digest('hex');
    expect(verifyCheckoutSignature('order_123', 'pay_456', signature, 'private-key')).toBe(true);
    expect(verifyCheckoutSignature('order_999', 'pay_456', signature, 'private-key')).toBe(false);
    expect(verifyCheckoutSignature('order_123', 'pay_456', 'bad', 'private-key')).toBe(false);
  });
  it('verifies the exact raw webhook body and requires captured amount and order match', () => {
    const body = Buffer.from('{"event":"payment.captured"}');
    const signature = createHmac('sha256', 'webhook-secret').update(body).digest('hex');
    expect(verifyWebhookSignature(body, signature, 'webhook-secret')).toBe(true);
    expect(
      verifyWebhookSignature(
        Buffer.from('{ "event":"payment.captured"}'),
        signature,
        'webhook-secret',
      ),
    ).toBe(false);
    const order = { id: 'order_123', amount: 12345, currency: 'INR', status: 'created' };
    const payment = {
      id: 'pay_456',
      order_id: 'order_123',
      amount: 12345,
      currency: 'INR',
      status: 'captured',
      captured: true,
    };
    expect(capturedPaymentMatches(payment, order)).toBe(true);
    expect(capturedPaymentMatches({ ...payment, amount: 12344 }, order)).toBe(false);
    expect(
      capturedPaymentMatches({ ...payment, status: 'authorized', captured: false }, order),
    ).toBe(false);
  });
  it('creates only server-priced INR orders and fetches payments with credentials held server side', async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'order_123',
            amount: 12345,
            currency: 'INR',
            status: 'created',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'pay_456',
            order_id: 'order_123',
            amount: 12345,
            currency: 'INR',
            status: 'captured',
            captured: true,
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'rfnd_789',
            payment_id: 'pay_456',
            amount: 5000,
            status: 'processed',
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 'rfnd_789',
            payment_id: 'pay_456',
            amount: 5000,
            status: 'processed',
          }),
          { status: 200 },
        ),
      );
    const client = new RazorpayClient({ keyId: 'test-key', keySecret: 'private-key' }, transport);
    expect((await client.createOrder(12345, 'TK_123')).id).toBe('order_123');
    expect((await client.fetchPayment('pay_456')).captured).toBe(true);
    expect((await client.createRefund('pay_456', 5000, 'TK_REFUND_1')).status).toBe('processed');
    expect((await client.fetchRefund('rfnd_789')).payment_id).toBe('pay_456');
    expect(transport.mock.calls[0][0]).toBe('https://api.razorpay.com/v1/orders');
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).toEqual({
      amount: 12345,
      currency: 'INR',
      receipt: 'TK_123',
    });
    await expect(client.createOrder(0, 'TK_0')).rejects.toThrow();
    expect(transport.mock.calls[2][0]).toBe('https://api.razorpay.com/v1/payments/pay_456/refund');
    expect(JSON.parse(String(transport.mock.calls[2][1]?.body))).toEqual({
      amount: 5000,
      speed: 'normal',
      receipt: 'TK_REFUND_1',
    });
    expect(transport.mock.calls[3][0]).toBe('https://api.razorpay.com/v1/refunds/rfnd_789');
    expect(transport).toHaveBeenCalledTimes(4);
  });
});
