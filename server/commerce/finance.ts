import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { ServerConfig } from '../config.js';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';
import { RazorpayClient } from './razorpay.js';

type LoyaltyPolicy = {
  id: string;
  earn_points_per_100_rupees: number;
  redeem_paise_per_point: number;
  minimum_redeem_points: number;
  maximum_redeem_points: number | null;
  active: boolean;
  created_at: Date;
  activated_at: Date | null;
};

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

function exposePolicy(row: LoyaltyPolicy) {
  return {
    id: row.id,
    earnPointsPer100Rupees: row.earn_points_per_100_rupees,
    redeemPaisePerPoint: row.redeem_paise_per_point,
    minimumRedeemPoints: row.minimum_redeem_points,
    maximumRedeemPoints: row.maximum_redeem_points,
    active: row.active,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
  };
}

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

export async function registerFinanceRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
  config: ServerConfig,
  transport: typeof fetch = fetch,
) {
  app.get<{ Querystring: { q?: string } }>(
    '/api/admin/finance-customers',
    {
      schema: {
        tags: ['Admin finance'],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: { q: { type: 'string', maxLength: 200 } },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['super_admin']))) return reply;
      const query = request.query.q?.trim() || '';
      const result = await pool.query<{
        id: string;
        name: string;
        email: string;
      }>(
        `SELECT id,name,email FROM identity_users
          WHERE role='customer' AND disabled_at IS NULL
            AND ($1='' OR name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
          ORDER BY name,email LIMIT 50`,
        [query],
      );
      return { items: result.rows };
    },
  );

  app.get('/api/finance', { schema: { tags: ['Customer finance'] } }, async (request, reply) => {
    const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
    if (!session) return reply;
    const loyalty = await pool.query<{ balance: number }>(
      'SELECT COALESCE(SUM(points),0)::integer AS balance FROM commerce_loyalty_entries WHERE customer_id=$1',
      [session.user.id],
    );
    const wallet = await pool.query<{ balance: number }>(
      'SELECT COALESCE(SUM(amount_paise),0)::integer AS balance FROM commerce_wallet_entries WHERE customer_id=$1',
      [session.user.id],
    );
    const policy = await pool.query<LoyaltyPolicy>(
      'SELECT * FROM commerce_loyalty_policies WHERE active=true',
    );
    const refunds = await pool.query(
      `SELECT id,order_id,amount_paise,method,status,reason,created_at,completed_at
         FROM commerce_refunds WHERE customer_id=$1 ORDER BY created_at DESC,id DESC LIMIT 100`,
      [session.user.id],
    );
    return reply.header('Cache-Control', 'no-store').send({
      loyaltyPoints: loyalty.rows[0].balance,
      walletPaise: wallet.rows[0].balance,
      loyaltyPolicy: policy.rowCount ? exposePolicy(policy.rows[0]) : null,
      refunds: refunds.rows.map((row) => ({
        id: row.id,
        orderId: row.order_id,
        amountPaise: row.amount_paise,
        method: row.method,
        status: row.status,
        reason: row.reason,
        createdAt: row.created_at,
        completedAt: row.completed_at,
      })),
    });
  });

  app.get(
    '/api/admin/loyalty-policies',
    { schema: { tags: ['Admin loyalty'] } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['super_admin']))) return reply;
      const result = await pool.query<LoyaltyPolicy>(
        'SELECT * FROM commerce_loyalty_policies ORDER BY created_at DESC,id DESC LIMIT 100',
      );
      return { items: result.rows.map(exposePolicy) };
    },
  );

  app.post<{
    Body: {
      earnPointsPer100Rupees: number;
      redeemPaisePerPoint: number;
      minimumRedeemPoints?: number;
      maximumRedeemPoints?: number | null;
    };
  }>(
    '/api/admin/loyalty-policies',
    {
      schema: {
        tags: ['Admin loyalty'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['earnPointsPer100Rupees', 'redeemPaisePerPoint'],
          properties: {
            earnPointsPer100Rupees: { type: 'integer', minimum: 0, maximum: 100000 },
            redeemPaisePerPoint: { type: 'integer', minimum: 1, maximum: 100000 },
            minimumRedeemPoints: { type: 'integer', minimum: 0, maximum: 2147483647 },
            maximumRedeemPoints: {
              anyOf: [{ type: 'integer', minimum: 1, maximum: 2147483647 }, { type: 'null' }],
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const b = request.body;
      if (
        b.maximumRedeemPoints !== null &&
        b.maximumRedeemPoints !== undefined &&
        b.maximumRedeemPoints < (b.minimumRedeemPoints || 0)
      )
        return fail(reply, 400, 'INVALID_POLICY', 'Maximum points must meet the minimum.');
      const result = await pool.query<LoyaltyPolicy>(
        `INSERT INTO commerce_loyalty_policies
          (id,earn_points_per_100_rupees,redeem_paise_per_point,minimum_redeem_points,
           maximum_redeem_points,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          randomUUID(),
          b.earnPointsPer100Rupees,
          b.redeemPaisePerPoint,
          b.minimumRedeemPoints || 0,
          b.maximumRedeemPoints ?? null,
          session.user.id,
        ],
      );
      return reply.code(201).send({ policy: exposePolicy(result.rows[0]) });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/loyalty-policies/:id/activate',
    { schema: { tags: ['Admin loyalty'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(98511434)');
        const found = await client.query<LoyaltyPolicy>(
          'SELECT * FROM commerce_loyalty_policies WHERE id=$1',
          [request.params.id],
        );
        if (!found.rowCount) {
          await client.query('ROLLBACK');
          return fail(reply, 404, 'POLICY_NOT_FOUND', 'Loyalty policy not found.');
        }
        await client.query('UPDATE commerce_loyalty_policies SET active=false WHERE active=true');
        const result = await client.query<LoyaltyPolicy>(
          'UPDATE commerce_loyalty_policies SET active=true,activated_at=now() WHERE id=$1 RETURNING *',
          [request.params.id],
        );
        await client.query('COMMIT');
        return { policy: exposePolicy(result.rows[0]) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.post<{
    Body: {
      customerId: string;
      points: number;
      reason: string;
      idempotencyKey: string;
    };
  }>(
    '/api/admin/loyalty-adjustments',
    {
      schema: {
        tags: ['Admin loyalty'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['customerId', 'points', 'reason', 'idempotencyKey'],
          properties: {
            customerId: { type: 'string', format: 'uuid' },
            points: {
              type: 'integer',
              minimum: -2147483648,
              maximum: 2147483647,
              not: { const: 0 },
            },
            reason: { type: 'string', minLength: 3, maxLength: 500 },
            idempotencyKey: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const b = request.body;
      try {
        const result = await pool.query(
          `INSERT INTO commerce_loyalty_entries
            (id,customer_id,points,kind,reason,source_key,created_by)
           VALUES($1,$2,$3,'adjustment',$4,$5,$6) RETURNING id,created_at`,
          [
            randomUUID(),
            b.customerId,
            b.points,
            b.reason.trim(),
            `adjustment:${b.idempotencyKey}`,
            session.user.id,
          ],
        );
        return reply.code(201).send({ entry: result.rows[0] });
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          return fail(reply, 409, 'IDEMPOTENCY_CONFLICT', 'This adjustment was already submitted.');
        throw error;
      }
    },
  );

  app.post<{
    Body: {
      customerId: string;
      amountPaise: number;
      reason: string;
      idempotencyKey: string;
    };
  }>(
    '/api/admin/wallet-adjustments',
    {
      schema: {
        tags: ['Admin wallet'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['customerId', 'amountPaise', 'reason', 'idempotencyKey'],
          properties: {
            customerId: { type: 'string', format: 'uuid' },
            amountPaise: {
              type: 'integer',
              minimum: -2147483648,
              maximum: 2147483647,
              not: { const: 0 },
            },
            reason: { type: 'string', minLength: 3, maxLength: 500 },
            idempotencyKey: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const b = request.body;
      if (b.amountPaise < 0) {
        const balance = await pool.query<{ balance: number }>(
          'SELECT COALESCE(SUM(amount_paise),0)::integer AS balance FROM commerce_wallet_entries WHERE customer_id=$1',
          [b.customerId],
        );
        if (balance.rows[0].balance + b.amountPaise < 0)
          return fail(reply, 409, 'INSUFFICIENT_CREDIT', 'The wallet cannot become negative.');
      }
      try {
        const result = await pool.query(
          `INSERT INTO commerce_wallet_entries
            (id,customer_id,amount_paise,kind,reason,source_key,created_by)
           VALUES($1,$2,$3,'adjustment',$4,$5,$6) RETURNING id,created_at`,
          [
            randomUUID(),
            b.customerId,
            b.amountPaise,
            b.reason.trim(),
            `adjustment:${b.idempotencyKey}`,
            session.user.id,
          ],
        );
        return reply.code(201).send({ entry: result.rows[0] });
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          return fail(reply, 409, 'IDEMPOTENCY_CONFLICT', 'This adjustment was already submitted.');
        throw error;
      }
    },
  );

  app.get('/api/admin/refunds', { schema: { tags: ['Admin refunds'] } }, async (request, reply) => {
    if (!(await requireIdentityRole(pool, request, reply, auth, ['admin', 'super_admin'])))
      return reply;
    const result = await pool.query(
      `SELECT r.*,u.email FROM commerce_refunds r JOIN identity_users u ON u.id=r.customer_id
       ORDER BY r.created_at DESC,r.id DESC LIMIT 200`,
    );
    return { items: result.rows };
  });

  app.post<{
    Body: {
      orderId: string;
      amountPaise: number;
      method: 'store_credit' | 'source';
      reason: string;
      idempotencyKey: string;
    };
  }>(
    '/api/admin/refunds',
    {
      schema: {
        tags: ['Admin refunds'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['orderId', 'amountPaise', 'method', 'reason', 'idempotencyKey'],
          properties: {
            orderId: { type: 'string', format: 'uuid' },
            amountPaise: { type: 'integer', minimum: 1, maximum: 2147483647 },
            method: { type: 'string', enum: ['store_credit', 'source'] },
            reason: { type: 'string', minLength: 3, maxLength: 500 },
            idempotencyKey: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      const b = request.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const order = await client.query<{
          customer_id: string;
          total_paise: number;
          gateway_payment_id: string | null;
          status: string;
        }>(
          `SELECT customer_id,total_paise,gateway_payment_id,status FROM commerce_orders
            WHERE id=$1 AND channel='online' FOR UPDATE`,
          [b.orderId],
        );
        if (!order.rowCount || !order.rows[0].customer_id)
          throw Object.assign(new Error('Order not found.'), {
            httpStatus: 404,
            publicCode: 'ORDER_NOT_FOUND',
          });
        if (
          !['paid', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'refunded'].includes(
            order.rows[0].status,
          )
        )
          throw Object.assign(new Error('Only paid orders can be refunded.'), {
            httpStatus: 409,
            publicCode: 'ORDER_NOT_PAID',
          });
        const prior = await client.query<{ total: number }>(
          `SELECT COALESCE(SUM(amount_paise),0)::integer AS total FROM commerce_refunds
            WHERE order_id=$1 AND status IN ('processing','succeeded')`,
          [b.orderId],
        );
        if (prior.rows[0].total + b.amountPaise > order.rows[0].total_paise)
          throw Object.assign(new Error('Refund exceeds the remaining paid amount.'), {
            httpStatus: 409,
            publicCode: 'REFUND_TOO_LARGE',
          });
        const refundId = randomUUID();
        let providerRefundId: string | null = null;
        let status: 'processing' | 'succeeded' | 'failed' = 'succeeded';
        if (b.method === 'source') {
          if (
            !order.rows[0].gateway_payment_id ||
            !config.razorpayKeyId ||
            !config.razorpayKeySecret
          )
            throw Object.assign(new Error('Source refunds are not configured.'), {
              httpStatus: 503,
              publicCode: 'REFUNDS_NOT_CONFIGURED',
            });
          const provider = await new RazorpayClient(
            { keyId: config.razorpayKeyId, keySecret: config.razorpayKeySecret },
            transport,
          ).createRefund(
            order.rows[0].gateway_payment_id,
            b.amountPaise,
            `tk_${refundId.replaceAll('-', '')}`,
          );
          providerRefundId = provider.id;
          status =
            provider.status === 'processed'
              ? 'succeeded'
              : provider.status === 'failed'
                ? 'failed'
                : 'processing';
        }
        await client.query(
          `INSERT INTO commerce_refunds
            (id,order_id,customer_id,amount_paise,method,status,reason,provider_refund_id,
             idempotency_key,created_by,completed_at)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CASE WHEN $6='succeeded' THEN now() END)`,
          [
            refundId,
            b.orderId,
            order.rows[0].customer_id,
            b.amountPaise,
            b.method,
            status,
            b.reason.trim(),
            providerRefundId,
            b.idempotencyKey,
            session.user.id,
          ],
        );
        if (b.method === 'store_credit')
          await client.query(
            `INSERT INTO commerce_wallet_entries
              (id,customer_id,order_id,amount_paise,kind,reason,source_key,created_by)
             VALUES($1,$2,$3,$4,'refund',$5,$6,$7)`,
            [
              randomUUID(),
              order.rows[0].customer_id,
              b.orderId,
              b.amountPaise,
              b.reason.trim(),
              `refund:${refundId}`,
              session.user.id,
            ],
          );
        if (
          status === 'succeeded' &&
          prior.rows[0].total + b.amountPaise === order.rows[0].total_paise
        ) {
          await client.query(
            "UPDATE commerce_orders SET status='refunded',updated_at=now() WHERE id=$1",
            [b.orderId],
          );
          await client.query(
            `INSERT INTO commerce_order_events(id,order_id,status,note,actor_id,source_key)
             VALUES($1,$2,'refunded',$3,$4,$5)`,
            [randomUUID(), b.orderId, b.reason.trim(), session.user.id, `refund:${refundId}`],
          );
          await client.query(
            `INSERT INTO commerce_loyalty_entries
              (id,customer_id,order_id,points,kind,reason,source_key,created_by)
             SELECT $2,$3,$1,-SUM(points)::integer,'reversal','Reversed after full refund',$4,$5
               FROM commerce_loyalty_entries
              WHERE order_id=$1 AND kind='earn' HAVING SUM(points)>0
             ON CONFLICT (source_key) DO NOTHING`,
            [
              b.orderId,
              randomUUID(),
              order.rows[0].customer_id,
              `refund:${refundId}:loyalty`,
              session.user.id,
            ],
          );
          await client.query(
            `INSERT INTO commerce_loyalty_entries
              (id,customer_id,order_id,points,kind,reason,source_key,created_by)
             SELECT $2,$3,$1,-SUM(points)::integer,'reversal','Restored after full refund',$4,$5
               FROM commerce_loyalty_entries
              WHERE order_id=$1 AND kind='redeem' HAVING SUM(points)<0
             ON CONFLICT (source_key) DO NOTHING`,
            [
              b.orderId,
              randomUUID(),
              order.rows[0].customer_id,
              `refund:${refundId}:redeem`,
              session.user.id,
            ],
          );
          await client.query(
            `INSERT INTO commerce_wallet_entries
              (id,customer_id,order_id,amount_paise,kind,reason,source_key,created_by)
             SELECT $2,$3,$1,-SUM(amount_paise)::integer,'reversal','Restored after full refund',$4,$5
               FROM commerce_wallet_entries
              WHERE order_id=$1 AND kind='checkout' HAVING SUM(amount_paise)<0
             ON CONFLICT (source_key) DO NOTHING`,
            [
              b.orderId,
              randomUUID(),
              order.rows[0].customer_id,
              `refund:${refundId}:wallet`,
              session.user.id,
            ],
          );
        }
        await client.query('COMMIT');
        return reply
          .code(201)
          .send({ refund: { id: refundId, status, method: b.method, providerRefundId } });
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505')
          return fail(reply, 409, 'IDEMPOTENCY_CONFLICT', 'This refund was already submitted.');
        const known = error as Error & { httpStatus?: number; publicCode?: string };
        if (known.httpStatus)
          return fail(reply, known.httpStatus, known.publicCode || 'REFUND_FAILED', known.message);
        request.log.error({ err: error }, 'Refund creation failed');
        return fail(
          reply,
          503,
          'REFUND_UNAVAILABLE',
          'Refund processing is temporarily unavailable.',
        );
      } finally {
        client.release();
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/refunds/:id/refresh',
    { schema: { tags: ['Admin refunds'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      if (!config.razorpayKeyId || !config.razorpayKeySecret)
        return fail(reply, 503, 'REFUNDS_NOT_CONFIGURED', 'Source refunds are not configured.');
      const current = await pool.query<{
        id: string;
        order_id: string;
        customer_id: string;
        amount_paise: number;
        method: string;
        status: string;
        provider_refund_id: string | null;
        gateway_payment_id: string | null;
      }>(
        `SELECT r.id,r.order_id,r.customer_id,r.amount_paise,r.method,r.status,
          r.provider_refund_id,o.gateway_payment_id
         FROM commerce_refunds r JOIN commerce_orders o ON o.id=r.order_id WHERE r.id=$1`,
        [request.params.id],
      );
      if (!current.rowCount) return fail(reply, 404, 'REFUND_NOT_FOUND', 'Refund not found.');
      const row = current.rows[0];
      if (row.method !== 'source' || !row.provider_refund_id || !row.gateway_payment_id)
        return fail(reply, 409, 'REFUND_NOT_REFRESHABLE', 'This is not a source refund.');
      if (row.status === 'succeeded' || row.status === 'failed') return { refund: row };
      let provider;
      try {
        provider = await new RazorpayClient(
          { keyId: config.razorpayKeyId, keySecret: config.razorpayKeySecret },
          transport,
        ).fetchRefund(row.provider_refund_id);
      } catch (error) {
        request.log.error({ err: error }, 'Refund reconciliation failed');
        return fail(
          reply,
          503,
          'REFUND_RECONCILIATION_UNAVAILABLE',
          'Refund status is temporarily unavailable.',
        );
      }
      if (provider.payment_id !== row.gateway_payment_id || provider.amount !== row.amount_paise)
        return fail(
          reply,
          409,
          'REFUND_MISMATCH',
          'Provider refund details require manual review.',
        );
      const next =
        provider.status === 'processed'
          ? 'succeeded'
          : provider.status === 'failed'
            ? 'failed'
            : 'processing';
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const locked = await client.query<{ status: string }>(
          'SELECT status FROM commerce_refunds WHERE id=$1 FOR UPDATE',
          [row.id],
        );
        if (locked.rows[0].status === 'processing')
          await client.query(
            `UPDATE commerce_refunds SET status=$2,
              completed_at=CASE WHEN $2 IN ('succeeded','failed') THEN now() END WHERE id=$1`,
            [row.id, next],
          );
        if (next === 'succeeded') {
          const totals = await client.query<{ refunded: number; total_paise: number }>(
            `SELECT COALESCE(SUM(r.amount_paise) FILTER (WHERE r.status='succeeded'),0)::integer AS refunded,
              o.total_paise FROM commerce_orders o LEFT JOIN commerce_refunds r ON r.order_id=o.id
             WHERE o.id=$1 GROUP BY o.total_paise`,
            [row.order_id],
          );
          if (totals.rows[0].refunded === totals.rows[0].total_paise) {
            await client.query(
              "UPDATE commerce_orders SET status='refunded',updated_at=now() WHERE id=$1",
              [row.order_id],
            );
            await client.query(
              `INSERT INTO commerce_order_events(id,order_id,status,note,actor_id,source_key)
               VALUES($1,$2,'refunded','Source refund confirmed',$3,$4)
               ON CONFLICT (source_key) DO NOTHING`,
              [randomUUID(), row.order_id, session.user.id, `refund:${row.id}`],
            );
            await client.query(
              `INSERT INTO commerce_loyalty_entries
                (id,customer_id,order_id,points,kind,reason,source_key,created_by)
               SELECT $2,$3,$1,-SUM(points)::integer,'reversal','Reversed after full refund',$4,$5
                 FROM commerce_loyalty_entries
                WHERE order_id=$1 AND kind='earn' HAVING SUM(points)>0
               ON CONFLICT (source_key) DO NOTHING`,
              [
                row.order_id,
                randomUUID(),
                row.customer_id,
                `refund:${row.id}:loyalty`,
                session.user.id,
              ],
            );
            await client.query(
              `INSERT INTO commerce_loyalty_entries
                (id,customer_id,order_id,points,kind,reason,source_key,created_by)
               SELECT $2,$3,$1,-SUM(points)::integer,'reversal','Restored after full refund',$4,$5
                 FROM commerce_loyalty_entries
                WHERE order_id=$1 AND kind='redeem' HAVING SUM(points)<0
               ON CONFLICT (source_key) DO NOTHING`,
              [
                row.order_id,
                randomUUID(),
                row.customer_id,
                `refund:${row.id}:redeem`,
                session.user.id,
              ],
            );
            await client.query(
              `INSERT INTO commerce_wallet_entries
                (id,customer_id,order_id,amount_paise,kind,reason,source_key,created_by)
               SELECT $2,$3,$1,-SUM(amount_paise)::integer,'reversal','Restored after full refund',$4,$5
                 FROM commerce_wallet_entries
                WHERE order_id=$1 AND kind='checkout' HAVING SUM(amount_paise)<0
               ON CONFLICT (source_key) DO NOTHING`,
              [
                row.order_id,
                randomUUID(),
                row.customer_id,
                `refund:${row.id}:wallet`,
                session.user.id,
              ],
            );
          }
        }
        await client.query('COMMIT');
        return { refund: { id: row.id, status: next, providerRefundId: row.provider_refund_id } };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );
}
