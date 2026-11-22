import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { ServerConfig } from '../config.js';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';
import { confirmPaidOrder, type PayableOrder } from './payment-confirmation.js';

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

async function releaseReservation(
  client: PoolClient,
  orderId: string,
  customerId: string,
  outcome: 'failed' | 'cancelled',
) {
  const source = `test-payment:${orderId}:${outcome}`;
  const items = await client.query<{ product_id: string; quantity: number }>(
    'SELECT product_id,quantity FROM commerce_order_items WHERE order_id=$1 ORDER BY product_id',
    [orderId],
  );
  for (const item of items.rows) {
    const product = await client.query<{ available: number }>(
      `UPDATE catalogue_products SET available=available+$2,updated_at=now()
        WHERE id=$1 RETURNING available`,
      [item.product_id, item.quantity],
    );
    await client.query(
      `INSERT INTO inventory_movements
        (id,product_id,delta,after_available,reason,source_key,actor_id)
       VALUES($1,$2,$3,$4,$5,$6,$7)`,
      [
        randomUUID(),
        item.product_id,
        item.quantity,
        product.rows[0].available,
        outcome === 'failed'
          ? 'Released after failed test payment'
          : 'Released after cancelled test payment',
        `${source}:${item.product_id}`,
        customerId,
      ],
    );
  }
  await client.query(
    `UPDATE inventory_units SET state='available',sale_reference=NULL
      WHERE sale_reference=$1 AND state='reserved'`,
    [orderId],
  );
  await client.query('DELETE FROM commerce_voucher_redemptions WHERE order_id=$1', [orderId]);
  await client.query(
    `INSERT INTO commerce_wallet_entries
      (id,customer_id,order_id,amount_paise,kind,reason,source_key)
     SELECT $2,customer_id,order_id,-amount_paise,'reversal',$3,$4
       FROM commerce_wallet_entries WHERE order_id=$1 AND kind='checkout'
     ON CONFLICT(source_key) DO NOTHING`,
    [orderId, randomUUID(), `Released after ${outcome} test payment`, `${source}:wallet`],
  );
  await client.query(
    `INSERT INTO commerce_loyalty_entries
      (id,customer_id,order_id,points,kind,reason,source_key)
     SELECT $2,customer_id,order_id,-points,'reversal',$3,$4
       FROM commerce_loyalty_entries WHERE order_id=$1 AND kind='redeem'
     ON CONFLICT(source_key) DO NOTHING`,
    [orderId, randomUUID(), `Released after ${outcome} test payment`, `${source}:loyalty`],
  );
  await client.query(
    `UPDATE commerce_orders SET status='cancelled',payment_expires_at=NULL,updated_at=now()
      WHERE id=$1`,
    [orderId],
  );
  await client.query(
    `UPDATE commerce_payments SET status=$2 WHERE order_id=$1 AND provider='test' AND status='pending'`,
    [orderId, outcome],
  );
  await client.query(
    `INSERT INTO commerce_order_events(id,order_id,status,note,actor_id,source_key)
     VALUES($1,$2,'cancelled',$3,$4,$5)`,
    [
      randomUUID(),
      orderId,
      outcome === 'failed' ? 'Local test payment failed' : 'Local test payment cancelled',
      customerId,
      source,
    ],
  );
}

export async function registerTestPaymentRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
  config: ServerConfig,
) {
  app.post<{ Params: { id: string; action: 'success' | 'failure' | 'cancel' } }>(
    '/api/test-payments/:id/:action',
    {
      schema: {
        tags: ['Local test payment'],
        params: {
          type: 'object',
          required: ['id', 'action'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            action: { type: 'string', enum: ['success', 'failure', 'cancel'] },
          },
        },
      },
    },
    async (request, reply) => {
      if (!config.paymentTestMode)
        return fail(reply, 404, 'TEST_PAYMENT_DISABLED', 'Local test payments are disabled.');
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await client.query<PayableOrder>(
          `SELECT id,status,customer_id,total_paise,subtotal_paise,voucher_discount_paise,
             wallet_applied_paise,loyalty_applied_paise,whatsapp_opt_in,gateway_payment_id
             FROM commerce_orders WHERE id=$1 AND customer_id=$2 AND channel='online' FOR UPDATE`,
          [request.params.id, session.user.id],
        );
        if (!result.rowCount) {
          await client.query('ROLLBACK');
          return fail(reply, 404, 'ORDER_NOT_FOUND', 'Order not found.');
        }
        const order = result.rows[0];
        const desired = request.params.action === 'success' ? 'paid' : 'cancelled';
        if (order.status === desired) {
          if (desired === 'cancelled') {
            const payment = await client.query<{ status: string }>(
              "SELECT status FROM commerce_payments WHERE order_id=$1 AND provider='test' ORDER BY created_at DESC LIMIT 1",
              [order.id],
            );
            const expected = request.params.action === 'failure' ? 'failed' : 'cancelled';
            if (payment.rows[0]?.status !== expected) {
              await client.query('ROLLBACK');
              return fail(
                reply,
                409,
                'PAYMENT_ALREADY_RESOLVED',
                `Test payment is already ${payment.rows[0]?.status || order.status}.`,
              );
            }
          }
          await client.query('COMMIT');
          return { status: desired, duplicate: true };
        }
        if (order.status !== 'pending_payment') {
          await client.query('ROLLBACK');
          return fail(reply, 409, 'PAYMENT_ALREADY_RESOLVED', `Order is already ${order.status}.`);
        }
        if (request.params.action === 'success') {
          const paymentId = `test_pay_${order.id.replaceAll('-', '')}`;
          await confirmPaidOrder(
            client,
            order,
            paymentId,
            `test-payment:${paymentId}`,
            'Payment confirmed by the local test provider',
          );
        } else
          await releaseReservation(
            client,
            order.id,
            session.user.id,
            request.params.action === 'failure' ? 'failed' : 'cancelled',
          );
        await client.query('COMMIT');
        return { status: desired, duplicate: false };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );
}
