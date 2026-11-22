import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';

type Rate = { prefix: string; amountPaise: number; name?: string };
type PolicyBody = {
  mode: 'flat' | 'postcode';
  basePaise: number;
  freeAbovePaise?: number | null;
  postcodeRates?: Rate[];
};
type PolicyRow = {
  id: string;
  mode: 'flat' | 'postcode';
  base_paise: number;
  free_above_paise: number | null;
  postcode_rates: Rate[];
  active: boolean;
  created_at: Date;
  activated_at: Date | null;
};
const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;
const rateSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['prefix', 'amountPaise'],
  properties: {
    prefix: { type: 'string', pattern: '^[1-9][0-9]{0,5}$' },
    amountPaise: { type: 'integer', minimum: 0, maximum: 2147483647 },
    name: { type: 'string', minLength: 1, maxLength: 100 },
  },
} as const;
function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}
function expose(row: PolicyRow) {
  return {
    id: row.id,
    mode: row.mode,
    basePaise: row.base_paise,
    freeAbovePaise: row.free_above_paise,
    postcodeRates: row.postcode_rates,
    active: row.active,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
  };
}
export function shippingCharge(
  policy: Pick<PolicyRow, 'mode' | 'base_paise' | 'free_above_paise' | 'postcode_rates'>,
  subtotalPaise: number,
  postalCode?: string,
) {
  if (policy.free_above_paise !== null && subtotalPaise >= policy.free_above_paise)
    return { amountPaise: 0, freeShippingApplied: true, zone: 'Free shipping threshold' };
  if (policy.mode === 'flat')
    return { amountPaise: policy.base_paise, freeShippingApplied: false, zone: 'Flat rate' };
  if (!postalCode || !/^[1-9][0-9]{5}$/.test(postalCode))
    throw new Error('Enter a six-digit delivery PIN code to see shipping.');
  const match = [...policy.postcode_rates]
    .filter((rate) => postalCode.startsWith(rate.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return {
    amountPaise: match?.amountPaise ?? policy.base_paise,
    freeShippingApplied: false,
    zone: match?.name || (match ? `PIN ${match.prefix}…` : 'Default zone'),
  };
}

export async function registerShippingRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
) {
  app.get(
    '/api/admin/shipping-policies',
    { schema: { tags: ['Admin shipping'] } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['super_admin']))) return reply;
      const rows = await pool.query<PolicyRow>(`SELECT * FROM commerce_shipping_policies
        ORDER BY created_at DESC,id DESC LIMIT 100`);
      return reply.header('Cache-Control', 'no-store').send({ items: rows.rows.map(expose) });
    },
  );
  app.post<{ Body: PolicyBody }>(
    '/api/admin/shipping-policies',
    {
      schema: {
        tags: ['Admin shipping'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['mode', 'basePaise'],
          properties: {
            mode: { type: 'string', enum: ['flat', 'postcode'] },
            basePaise: { type: 'integer', minimum: 0, maximum: 2147483647 },
            freeAbovePaise: {
              anyOf: [{ type: 'integer', minimum: 0, maximum: 2147483647 }, { type: 'null' }],
            },
            postcodeRates: { type: 'array', maxItems: 100, items: rateSchema },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const b = request.body;
      const rates = b.postcodeRates || [];
      if (b.mode === 'flat' && rates.length)
        return fail(reply, 400, 'INVALID_POLICY', 'Flat shipping cannot have PIN-code rates.');
      if (b.mode === 'postcode' && !rates.length)
        return fail(reply, 400, 'INVALID_POLICY', 'Add at least one PIN-code rate.');
      if (new Set(rates.map((rate) => rate.prefix)).size !== rates.length)
        return fail(reply, 400, 'INVALID_POLICY', 'Each PIN-code prefix can appear only once.');
      const id = randomUUID();
      const client = await pool.connect();
      let row: PolicyRow;
      try {
        await client.query('BEGIN');
        const result = await client.query<PolicyRow>(
          `INSERT INTO commerce_shipping_policies
      (id,mode,base_paise,free_above_paise,postcode_rates,created_by)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
          [
            id,
            b.mode,
            b.basePaise,
            b.freeAbovePaise ?? null,
            JSON.stringify(rates),
            session.user.id,
          ],
        );
        row = result.rows[0];
        await client.query(
          `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
      VALUES($1,$2,'shipping_policy.created',$3,$4)`,
          [randomUUID(), session.user.id, id, request.id],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return reply.code(201).send({ policy: expose(row) });
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/admin/shipping-policies/:id/activate',
    {
      schema: { tags: ['Admin shipping'], params: idParams },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const client = await pool.connect();
      let row: PolicyRow | undefined;
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(98511433)');
        const found = await client.query<PolicyRow>(
          'SELECT * FROM commerce_shipping_policies WHERE id=$1',
          [request.params.id],
        );
        if (found.rowCount) {
          await client.query(
            'UPDATE commerce_shipping_policies SET active=false WHERE active=true',
          );
          const updated = await client.query<PolicyRow>(
            `UPDATE commerce_shipping_policies
          SET active=true,activated_at=now() WHERE id=$1 RETURNING *`,
            [request.params.id],
          );
          row = updated.rows[0];
          await client.query(
            `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
          VALUES($1,$2,'shipping_policy.activated',$3,$4)`,
            [randomUUID(), session.user.id, request.params.id, request.id],
          );
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return row
        ? { policy: expose(row) }
        : fail(reply, 404, 'POLICY_NOT_FOUND', 'Shipping policy not found.');
    },
  );
  app.post<{ Body: { items: { productId: string; quantity: number }[]; postalCode?: string } }>(
    '/api/shipping/quote',
    {
      schema: {
        tags: ['Shipping'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['items'],
          properties: {
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
            postalCode: { type: 'string', pattern: '^[1-9][0-9]{5}$' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const policy = await pool.query<PolicyRow>(
        'SELECT * FROM commerce_shipping_policies WHERE active=true',
      );
      if (!policy.rowCount)
        return fail(
          reply,
          503,
          'SHIPPING_NOT_CONFIGURED',
          'Shipping charges are not available yet.',
        );
      const ids = request.body.items.map((item) => item.productId);
      if (new Set(ids).size !== ids.length)
        return fail(reply, 400, 'DUPLICATE_PRODUCT', 'List each product once.');
      const rows = await pool.query<{ id: string; price_paise: number; available: number }>(
        `SELECT id,price_paise,available FROM catalogue_products WHERE id=ANY($1::uuid[])
          AND published_at IS NOT NULL`,
        [ids],
      );
      if (rows.rows.length !== ids.length)
        return fail(reply, 409, 'PRODUCT_UNAVAILABLE', 'A product is no longer available.');
      const byId = new Map(rows.rows.map((row) => [row.id, row]));
      let subtotalPaise = 0;
      for (const item of request.body.items) {
        const product = byId.get(item.productId)!;
        if (product.available < item.quantity)
          return fail(reply, 409, 'INSUFFICIENT_STOCK', 'A product does not have enough stock.');
        subtotalPaise += product.price_paise * item.quantity;
      }
      try {
        const charge = shippingCharge(policy.rows[0], subtotalPaise, request.body.postalCode);
        return reply.header('Cache-Control', 'no-store').send({
          shippingPaise: charge.amountPaise,
          freeShippingApplied: charge.freeShippingApplied,
          subtotalPaise,
          policyId: policy.rows[0].id,
          zone: charge.zone,
          quoteOnly: true,
        });
      } catch (error) {
        return fail(reply, 400, 'PIN_CODE_REQUIRED', (error as Error).message);
      }
    },
  );
}
