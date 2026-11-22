import { randomBytes, randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';

type VoucherRow = {
  id: string;
  code: string;
  kind: 'fixed' | 'percent';
  value: number;
  max_discount_paise: number | null;
  minimum_subtotal_paise: number;
  use_scope: string;
  starts_at: Date;
  expires_at: Date;
  active: boolean;
  created_at: Date;
};
function expose(row: VoucherRow) {
  return {
    id: row.id,
    code: row.code,
    kind: row.kind,
    value: row.value,
    maxDiscountPaise: row.max_discount_paise,
    minimumSubtotalPaise: row.minimum_subtotal_paise,
    useScope: row.use_scope,
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    active: row.active,
    createdAt: row.created_at,
  };
}
function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}
const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

export async function registerVoucherRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
) {
  app.get(
    '/api/admin/vouchers',
    { schema: { tags: ['Admin vouchers'] } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['super_admin']))) return reply;
      const rows = await pool.query<VoucherRow>(
        'SELECT * FROM commerce_vouchers ORDER BY created_at DESC,id DESC LIMIT 100',
      );
      return reply.header('Cache-Control', 'no-store').send({ items: rows.rows.map(expose) });
    },
  );
  app.post<{
    Body: {
      code?: string;
      kind: 'fixed' | 'percent';
      value: number;
      maxDiscountPaise?: number | null;
      minimumSubtotalPaise?: number;
      useScope: 'global_once' | 'once_per_customer';
      startsAt?: string;
      expiresAt: string;
    };
  }>(
    '/api/admin/vouchers',
    {
      schema: {
        tags: ['Admin vouchers'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'value', 'useScope', 'expiresAt'],
          properties: {
            code: { type: 'string', pattern: '^[A-Za-z0-9-]{4,32}$' },
            kind: { type: 'string', enum: ['fixed', 'percent'] },
            value: { type: 'integer', minimum: 1, maximum: 2147483647 },
            maxDiscountPaise: {
              anyOf: [{ type: 'integer', minimum: 1, maximum: 2147483647 }, { type: 'null' }],
            },
            minimumSubtotalPaise: { type: 'integer', minimum: 0, maximum: 2147483647 },
            useScope: { type: 'string', enum: ['global_once', 'once_per_customer'] },
            startsAt: { type: 'string', format: 'date-time' },
            expiresAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const b = request.body;
      const starts = b.startsAt ? new Date(b.startsAt) : new Date();
      const expires = new Date(b.expiresAt);
      if (expires <= starts)
        return fail(reply, 400, 'INVALID_DATES', 'Expiry must be after the start date.');
      if (b.kind === 'percent' && b.value > 10000)
        return fail(reply, 400, 'INVALID_DISCOUNT', 'Percentage cannot exceed 100%.');
      if (b.kind === 'fixed' && b.maxDiscountPaise)
        return fail(
          reply,
          400,
          'INVALID_DISCOUNT',
          'Maximum discount is for percentage codes only.',
        );
      const code = b.code?.toUpperCase() || `TK-${randomBytes(6).toString('hex').toUpperCase()}`;
      const id = randomUUID();
      const client = await pool.connect();
      let row: VoucherRow;
      try {
        await client.query('BEGIN');
        const inserted = await client.query<VoucherRow>(
          `INSERT INTO commerce_vouchers
        (id,code,kind,value,max_discount_paise,minimum_subtotal_paise,use_scope,starts_at,expires_at,created_by)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
          [
            id,
            code,
            b.kind,
            b.value,
            b.maxDiscountPaise ?? null,
            b.minimumSubtotalPaise ?? 0,
            b.useScope,
            starts,
            expires,
            session.user.id,
          ],
        );
        row = inserted.rows[0];
        await client.query(
          `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
        VALUES($1,$2,'voucher.created',$3,$4)`,
          [randomUUID(), session.user.id, id, request.id],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505')
          return fail(reply, 409, 'CODE_EXISTS', 'This voucher code is already in use.');
        throw error;
      } finally {
        client.release();
      }
      return reply.code(201).send({ voucher: expose(row) });
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/admin/vouchers/:id/disable',
    {
      schema: {
        tags: ['Admin vouchers'],
        params: idParams,
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const client = await pool.connect();
      let row: VoucherRow | undefined;
      try {
        await client.query('BEGIN');
        const result = await client.query<VoucherRow>(
          `UPDATE commerce_vouchers SET active=false
        WHERE id=$1 RETURNING *`,
          [request.params.id],
        );
        row = result.rows[0];
        if (row)
          await client.query(
            `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
        VALUES($1,$2,'voucher.disabled',$3,$4)`,
            [randomUUID(), session.user.id, request.params.id, request.id],
          );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return row
        ? { voucher: expose(row) }
        : fail(reply, 404, 'VOUCHER_NOT_FOUND', 'Voucher not found.');
    },
  );
  app.post<{ Body: { code: string; items: { productId: string; quantity: number }[] } }>(
    '/api/vouchers/preview',
    {
      schema: {
        tags: ['Vouchers'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['code', 'items'],
          properties: {
            code: { type: 'string', pattern: '^[A-Za-z0-9-]{4,32}$' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['productId', 'quantity'],
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  quantity: { type: 'integer', minimum: 1, maximum: 100 },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const ids = request.body.items.map((item) => item.productId);
      if (new Set(ids).size !== ids.length)
        return fail(reply, 400, 'DUPLICATE_PRODUCT', 'List each product once.');
      const voucher = await pool.query<VoucherRow>(
        `SELECT * FROM commerce_vouchers
      WHERE code=$1 AND active=true AND starts_at<=now() AND expires_at>now()`,
        [request.body.code.toUpperCase()],
      );
      if (!voucher.rowCount)
        return fail(reply, 404, 'VOUCHER_UNAVAILABLE', 'This code is not available.');
      const v = voucher.rows[0];
      const redeemed = await pool.query<{ any_use: boolean; customer_use: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM commerce_voucher_redemptions WHERE voucher_id=$1) AS any_use,
          EXISTS(SELECT 1 FROM commerce_voucher_redemptions
            WHERE voucher_id=$1 AND customer_id=$2) AS customer_use`,
        [v.id, session.user.id],
      );
      if (
        (v.use_scope === 'global_once' && redeemed.rows[0].any_use) ||
        redeemed.rows[0].customer_use
      )
        return fail(reply, 409, 'VOUCHER_USED', 'This code has already been used.');
      const products = await pool.query<{ id: string; price_paise: number; available: number }>(
        `SELECT id,price_paise,available FROM catalogue_products WHERE id=ANY($1::uuid[])
        AND published_at IS NOT NULL`,
        [ids],
      );
      if (products.rows.length !== ids.length)
        return fail(reply, 409, 'PRODUCT_UNAVAILABLE', 'A product is no longer available.');
      const byId = new Map(products.rows.map((row) => [row.id, row]));
      let subtotalPaise = 0;
      for (const item of request.body.items) {
        const p = byId.get(item.productId)!;
        if (p.available < item.quantity)
          return fail(reply, 409, 'INSUFFICIENT_STOCK', 'A product does not have enough stock.');
        subtotalPaise += p.price_paise * item.quantity;
      }
      if (subtotalPaise < v.minimum_subtotal_paise)
        return fail(reply, 409, 'MINIMUM_NOT_MET', 'This order does not reach the code minimum.');
      const raw = v.kind === 'fixed' ? v.value : Math.floor((subtotalPaise * v.value) / 10000);
      const discountPaise = Math.min(subtotalPaise, raw, v.max_discount_paise ?? 2147483647);
      return reply.header('Cache-Control', 'no-store').send({
        code: v.code,
        discountPaise,
        subtotalPaise,
        quoteOnly: true,
        useScope: v.use_scope,
      });
    },
  );
}
