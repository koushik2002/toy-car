import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { ServerConfig } from '../config.js';
import { capturedPaymentMatches, RazorpayClient, verifyWebhookSignature } from './razorpay.js';
import { confirmPaidOrder, type PayableOrder } from './payment-confirmation.js';

interface CapturedEvent {
  event?: unknown;
  payload?: { payment?: { entity?: { id?: unknown; order_id?: unknown } } };
}

const paymentIdPattern = /^pay_[A-Za-z0-9]+$/;
const orderIdPattern = /^order_[A-Za-z0-9]+$/;

export async function registerRazorpayWebhook(
  app: FastifyInstance,
  pool: Pool,
  config: ServerConfig,
  transport: typeof fetch = fetch,
) {
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'buffer' },
      (_request, body, done) => {
        done(null, body);
      },
    );
    scope.post('/api/webhooks/razorpay', { bodyLimit: 262144 }, async (request, reply) => {
      if (!config.razorpayKeyId || !config.razorpayKeySecret || !config.razorpayWebhookSecret)
        return reply.code(503).send({ error: 'Payment webhook is not configured.' });

      const signature = request.headers['x-razorpay-signature'];
      const raw = request.body;
      if (
        !Buffer.isBuffer(raw) ||
        typeof signature !== 'string' ||
        !verifyWebhookSignature(raw, signature, config.razorpayWebhookSecret)
      )
        return reply.code(401).send({ error: 'Invalid webhook signature.' });

      let event: CapturedEvent;
      try {
        event = JSON.parse(raw.toString('utf8')) as CapturedEvent;
      } catch {
        return reply.code(400).send({ error: 'Invalid webhook payload.' });
      }
      if (event.event !== 'payment.captured') return reply.code(200).send({ accepted: true });

      const paymentId = event.payload?.payment?.entity?.id;
      const providerOrderId = event.payload?.payment?.entity?.order_id;
      if (
        typeof paymentId !== 'string' ||
        !paymentIdPattern.test(paymentId) ||
        typeof providerOrderId !== 'string' ||
        !orderIdPattern.test(providerOrderId)
      )
        return reply.code(400).send({ error: 'Invalid payment reference.' });

      const bodyHash = createHash('sha256').update(raw).digest('hex');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const existing = await client.query(
          'SELECT 1 FROM commerce_payment_events WHERE body_sha256=$1',
          [bodyHash],
        );
        if (existing.rowCount) {
          await client.query('COMMIT');
          return reply.code(200).send({ accepted: true, duplicate: true });
        }
        const orderResult = await client.query<
          PayableOrder & {
            total_paise: number;
          }
        >(
          `SELECT id,status,total_paise,customer_id,subtotal_paise,voucher_discount_paise,
             wallet_applied_paise,loyalty_applied_paise,whatsapp_opt_in,gateway_payment_id FROM commerce_orders
           WHERE gateway_order_id=$1 AND channel='online' FOR UPDATE`,
          [providerOrderId],
        );
        if (!orderResult.rowCount) {
          await client.query('ROLLBACK');
          return reply.code(503).send({ error: 'Order is not available for reconciliation.' });
        }
        const order = orderResult.rows[0];
        // The signed event is only a notification. Fetch the captured payment from Razorpay
        // before changing the local order or making it eligible for fulfilment.
        const payment = await new RazorpayClient(
          { keyId: config.razorpayKeyId, keySecret: config.razorpayKeySecret },
          transport,
        ).fetchPayment(paymentId);
        const matches =
          payment.id === paymentId &&
          capturedPaymentMatches(payment, {
            id: providerOrderId,
            amount: order.total_paise,
            currency: 'INR',
            status: 'created',
          });
        let outcome: 'paid' | 'duplicate' | 'requires_review';
        let reason = '';
        if (!matches) {
          outcome = 'requires_review';
          reason = 'Provider payment does not match captured order amount, currency, or reference.';
        } else if (order.status === 'pending_payment' && !order.gateway_payment_id) {
          await confirmPaidOrder(
            client,
            order,
            paymentId,
            `razorpay:${paymentId}`,
            'Razorpay captured payment',
          );
          outcome = 'paid';
        } else if (order.gateway_payment_id === paymentId) {
          outcome = 'duplicate';
        } else {
          outcome = 'requires_review';
          reason = `Order is already ${order.status}; payment needs manual review.`;
        }
        await client.query(
          `INSERT INTO commerce_payment_events
           (body_sha256,provider_payment_id,provider_order_id,order_id,outcome,reason)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (body_sha256) DO NOTHING`,
          [bodyHash, paymentId, providerOrderId, order.id, outcome, reason],
        );
        await client.query('COMMIT');
        return reply.code(200).send({ accepted: true });
      } catch (error) {
        await client.query('ROLLBACK');
        request.log.error({ err: error }, 'Razorpay webhook reconciliation failed');
        return reply
          .code(503)
          .send({ error: 'Payment reconciliation is temporarily unavailable.' });
      } finally {
        client.release();
      }
    });
  });
}
