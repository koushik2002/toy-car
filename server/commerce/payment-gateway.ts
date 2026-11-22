import type { ServerConfig } from '../config.js';
import { RazorpayClient } from './razorpay.js';

export type GatewayOrder = { id: string; provider: 'test' | 'razorpay' };

export interface PaymentGateway {
  readonly provider: GatewayOrder['provider'];
  createOrder(amountPaise: number, receipt: string, localOrderId: string): Promise<GatewayOrder>;
}

export class LocalTestPaymentGateway implements PaymentGateway {
  readonly provider = 'test' as const;
  async createOrder(_amountPaise: number, _receipt: string, localOrderId: string) {
    return { id: `test_order_${localOrderId.replaceAll('-', '')}`, provider: this.provider };
  }
}

export class RazorpayPaymentGateway implements PaymentGateway {
  readonly provider = 'razorpay' as const;
  private readonly client: RazorpayClient;
  constructor(config: { keyId: string; keySecret: string }, transport: typeof fetch = fetch) {
    this.client = new RazorpayClient(config, transport);
  }
  async createOrder(amountPaise: number, receipt: string) {
    const order = await this.client.createOrder(amountPaise, receipt);
    return { id: order.id, provider: this.provider };
  }
}

export function configuredPaymentGateway(config: ServerConfig, transport: typeof fetch = fetch) {
  if (config.paymentTestMode) return new LocalTestPaymentGateway();
  if (config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret)
    return new RazorpayPaymentGateway(
      { keyId: config.razorpayKeyId, keySecret: config.razorpayKeySecret },
      transport,
    );
  return null;
}
