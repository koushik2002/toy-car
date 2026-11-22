import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';
import { product, productColumns } from '../catalogue/routes.js';
import { CheckoutFailure, priceCheckout } from './checkout.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;
const addressBody = {
  type: 'object',
  additionalProperties: false,
  required: ['recipientName', 'phone', 'line1', 'city', 'state', 'postalCode'],
  properties: {
    recipientName: { type: 'string', minLength: 2, maxLength: 120 },
    phone: { type: 'string', pattern: '^\\+?[1-9][0-9]{7,14}$' },
    line1: { type: 'string', minLength: 3, maxLength: 200 },
    line2: { type: 'string', maxLength: 200 },
    city: { type: 'string', minLength: 2, maxLength: 100 },
    state: { type: 'string', minLength: 2, maxLength: 100 },
    postalCode: { type: 'string', pattern: '^[1-9][0-9]{5}$' },
    isDefault: { type: 'boolean' },
  },
} as const;
type AddressBody = {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  isDefault?: boolean;
};

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

function exposeAddress(row: Record<string, unknown>) {
  return {
    id: row.id,
    recipientName: row.recipient_name,
    phone: row.phone,
    line1: row.line1,
    line2: row.line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    isDefault: row.is_default,
  };
}

export async function registerStorefrontRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
) {
  // Lives under /api/products so it follows the same browsing rule as the catalogue itself.
  app.get(
    '/api/products/overview',
    { schema: { tags: ['Catalogue'] } },
    async (_request, reply) => {
      const counts = await pool.query<{ brand: string; series: string; total: number }>(
        `SELECT brand,series,count(*)::integer AS total FROM catalogue_products
        WHERE published_at IS NOT NULL GROUP BY brand,series ORDER BY brand,series`,
      );
      const scales = await pool.query<{ scale: string; total: number }>(
        `SELECT scale,count(*)::integer AS total FROM catalogue_products
        WHERE published_at IS NOT NULL AND scale<>'' GROUP BY scale ORDER BY scale`,
      );
      const stats = await pool.query<{ rare: number; total: number; min: number; max: number }>(
        `SELECT count(*) FILTER (WHERE rare)::integer AS rare, count(*)::integer AS total,
         COALESCE(min(price_paise),0)::integer AS min, COALESCE(max(price_paise),0)::integer AS max
         FROM catalogue_products WHERE published_at IS NOT NULL`,
      );
      const shipping = await pool.query<{ free_above_paise: number | null; base_paise: number }>(
        'SELECT free_above_paise,base_paise FROM commerce_shipping_policies WHERE active=true',
      );
      const brands = new Map<string, { name: string; total: number; series: string[] }>();
      for (const row of counts.rows) {
        const entry = brands.get(row.brand) || { name: row.brand, total: 0, series: [] };
        entry.total += row.total;
        if (row.series) entry.series.push(row.series);
        brands.set(row.brand, entry);
      }
      return reply.header('Cache-Control', 'private, no-store').send({
        brands: [...brands.values()],
        scales: scales.rows.map((row) => ({ name: row.scale, total: row.total })),
        rareCount: stats.rows[0].rare,
        productCount: stats.rows[0].total,
        priceRangePaise: { min: stats.rows[0].min, max: stats.rows[0].max },
        shipping: shipping.rowCount
          ? {
              freeAbovePaise: shipping.rows[0].free_above_paise,
              basePaise: shipping.rows[0].base_paise,
            }
          : null,
      });
    },
  );

  app.post<{
    Body: {
      items: { productId: string; quantity: number }[];
      postalCode?: string;
      voucherCode?: string;
      walletPaise?: number;
      redeemPoints?: number;
    };
  }>(
    '/api/checkout/quote',
    {
      schema: {
        tags: ['Checkout'],
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
            voucherCode: { type: 'string', pattern: '^[A-Za-z0-9-]{4,32}$' },
            walletPaise: { type: 'integer', minimum: 0, maximum: 2147483647 },
            redeemPoints: { type: 'integer', minimum: 0, maximum: 2147483647 },
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
      const client = await pool.connect();
      let price: Awaited<ReturnType<typeof priceCheckout>> | CheckoutFailure;
      try {
        // Same pricing as a real order; rolled back so a quote never reserves stock or codes.
        await client.query('BEGIN');
        price = await priceCheckout(client, session.user.id, request.body);
      } catch (error) {
        if (!(error instanceof CheckoutFailure)) throw error;
        price = error;
      } finally {
        // The connection is released before replying so the next request can reuse it.
        await client.query('ROLLBACK');
        client.release();
      }
      if (price instanceof CheckoutFailure)
        return fail(reply, price.status, price.code, price.message);
      return reply.header('Cache-Control', 'no-store').send({
        subtotalPaise: price.subtotalPaise,
        shippingPaise: price.shippingPaise,
        freeShippingApplied: price.freeShippingApplied,
        freeAbovePaise: price.freeAbovePaise,
        shippingZone: price.shippingZone,
        voucherDiscountPaise: price.voucherDiscountPaise,
        walletAppliedPaise: price.walletPaise,
        loyaltyAppliedPaise: price.loyaltyAppliedPaise,
        discountPaise: price.discountPaise,
        totalPaise: price.totalPaise,
      });
    },
  );

  app.get('/api/account/addresses', { schema: { tags: ['Account'] } }, async (request, reply) => {
    const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
    if (!session) return reply;
    const rows = await pool.query<Record<string, unknown>>(
      `SELECT * FROM customer_addresses WHERE customer_id=$1
        ORDER BY is_default DESC,created_at,id LIMIT 20`,
      [session.user.id],
    );
    return reply.header('Cache-Control', 'no-store').send({ items: rows.rows.map(exposeAddress) });
  });

  async function saveAddress(customerId: string, body: AddressBody, id?: string) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`address:${customerId}`]);
      const existing = await client.query<{ total: number }>(
        'SELECT count(*)::integer AS total FROM customer_addresses WHERE customer_id=$1',
        [customerId],
      );
      if (!id && existing.rows[0].total >= 20) {
        await client.query('ROLLBACK');
        return 'limit' as const;
      }
      const makeDefault = body.isDefault === true || existing.rows[0].total === 0;
      if (makeDefault)
        await client.query(
          'UPDATE customer_addresses SET is_default=false WHERE customer_id=$1 AND is_default',
          [customerId],
        );
      const values = [
        body.recipientName.trim(),
        body.phone.replace(/[\s()-]/g, ''),
        body.line1.trim(),
        body.line2?.trim() || '',
        body.city.trim(),
        body.state.trim(),
        body.postalCode,
      ];
      const result = id
        ? await client.query<Record<string, unknown>>(
            `UPDATE customer_addresses SET recipient_name=$3,phone=$4,line1=$5,line2=$6,city=$7,
               state=$8,postal_code=$9,is_default=is_default OR $10,updated_at=now()
             WHERE id=$1 AND customer_id=$2 RETURNING *`,
            [id, customerId, ...values, makeDefault],
          )
        : await client.query<Record<string, unknown>>(
            `INSERT INTO customer_addresses
              (id,customer_id,recipient_name,phone,line1,line2,city,state,postal_code,is_default)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [randomUUID(), customerId, ...values, makeDefault],
          );
      await client.query('COMMIT');
      return result.rows[0] ? exposeAddress(result.rows[0]) : ('missing' as const);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  app.post<{ Body: AddressBody }>(
    '/api/account/addresses',
    { schema: { tags: ['Account'], body: addressBody } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const address = await saveAddress(session.user.id, request.body);
      if (address === 'limit')
        return fail(reply, 409, 'ADDRESS_LIMIT', 'You can save up to 20 addresses.');
      return reply.code(201).send({ address });
    },
  );

  app.put<{ Params: { id: string }; Body: AddressBody }>(
    '/api/account/addresses/:id',
    { schema: { tags: ['Account'], params: idParams, body: addressBody } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const address = await saveAddress(session.user.id, request.body, request.params.id);
      if (address === 'missing' || address === 'limit')
        return fail(reply, 404, 'ADDRESS_NOT_FOUND', 'Address not found.');
      return { address };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/account/addresses/:id',
    { schema: { tags: ['Account'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const removed = await pool.query<{ is_default: boolean }>(
        'DELETE FROM customer_addresses WHERE id=$1 AND customer_id=$2 RETURNING is_default',
        [request.params.id, session.user.id],
      );
      if (!removed.rowCount) return fail(reply, 404, 'ADDRESS_NOT_FOUND', 'Address not found.');
      if (removed.rows[0].is_default)
        await pool.query(
          `UPDATE customer_addresses SET is_default=true WHERE id=(
             SELECT id FROM customer_addresses WHERE customer_id=$1 ORDER BY created_at,id LIMIT 1)`,
          [session.user.id],
        );
      return { status: 'deleted' };
    },
  );

  app.get('/api/account/profile', { schema: { tags: ['Account'] } }, async (request, reply) => {
    const session = await requireIdentityRole(pool, request, reply, auth, [
      'customer',
      'seller',
      'staff',
      'admin',
      'super_admin',
    ]);
    if (!session) return reply;
    const row = await pool.query<{ name: string; email: string; phone: string }>(
      'SELECT name,email,phone FROM identity_users WHERE id=$1',
      [session.user.id],
    );
    return reply.header('Cache-Control', 'no-store').send({ profile: row.rows[0] });
  });

  app.put<{ Body: { name: string; phone?: string } }>(
    '/api/account/profile',
    {
      schema: {
        tags: ['Account'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 100 },
            phone: { type: 'string', pattern: '^$|^\\+?[1-9][0-9]{7,14}$' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'customer',
        'seller',
        'staff',
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      const name = request.body.name.trim();
      if (!name) return fail(reply, 400, 'NAME_REQUIRED', 'Enter your name.');
      const row = await pool.query<{ name: string; email: string; phone: string }>(
        `UPDATE identity_users SET name=$2,phone=$3,updated_at=now() WHERE id=$1
         RETURNING name,email,phone`,
        [session.user.id, name, request.body.phone?.replace(/[\s()-]/g, '') || ''],
      );
      return { profile: row.rows[0] };
    },
  );

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    '/api/account/password',
    {
      schema: {
        tags: ['Account'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: { type: 'string', minLength: 1, maxLength: 128 },
            newPassword: { type: 'string', minLength: 12, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'customer',
        'seller',
        'staff',
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      const user = await pool.query<{ password_hash: string }>(
        'SELECT password_hash FROM identity_users WHERE id=$1',
        [session.user.id],
      );
      if (!(await argon2.verify(user.rows[0].password_hash, request.body.currentPassword)))
        return fail(reply, 400, 'PASSWORD_INCORRECT', 'Your current password is not correct.');
      const hash = await argon2.hash(request.body.newPassword, {
        type: argon2.argon2id,
        memoryCost: 19456,
        timeCost: 2,
        parallelism: 1,
      });
      const client = await pool.connect();
      try {
        // Bumping auth_version signs out every other device; this session is carried forward.
        await client.query('BEGIN');
        const updated = await client.query<{ auth_version: number }>(
          `UPDATE identity_users SET password_hash=$2,auth_version=auth_version+1,updated_at=now()
            WHERE id=$1 RETURNING auth_version`,
          [session.user.id, hash],
        );
        await client.query('UPDATE identity_sessions SET auth_version=$2 WHERE token_hash=$1', [
          session.tokenHash,
          updated.rows[0].auth_version,
        ]);
        await client.query(
          `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
           VALUES($1,$2,'identity.password_changed',$2,$3)`,
          [randomUUID(), session.user.id, request.id],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return { message: 'Password changed. Other devices have been signed out.' };
    },
  );

  app.get('/api/wishlist', { schema: { tags: ['Account'] } }, async (request, reply) => {
    const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
    if (!session) return reply;
    const rows = await pool.query<Record<string, unknown>>(
      `SELECT ${productColumns} FROM customer_wishlist w
         JOIN catalogue_products p ON p.id=w.product_id
        WHERE w.customer_id=$1 AND p.published_at IS NOT NULL
        ORDER BY w.created_at DESC LIMIT 200`,
      [session.user.id],
    );
    const alerts = await pool.query<{ product_id: string }>(
      'SELECT product_id FROM catalogue_restock_requests WHERE customer_id=$1 AND notified_at IS NULL',
      [session.user.id],
    );
    return reply.header('Cache-Control', 'no-store').send({
      items: rows.rows.map(product),
      restockAlerts: alerts.rows.map((row) => row.product_id),
    });
  });

  app.put<{ Params: { id: string } }>(
    '/api/wishlist/:id',
    { schema: { tags: ['Account'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const result = await pool.query(
        `INSERT INTO customer_wishlist(customer_id,product_id)
         SELECT $1,id FROM catalogue_products WHERE id=$2 AND published_at IS NOT NULL
         ON CONFLICT DO NOTHING`,
        [session.user.id, request.params.id],
      );
      const exists = await pool.query(
        'SELECT 1 FROM customer_wishlist WHERE customer_id=$1 AND product_id=$2',
        [session.user.id, request.params.id],
      );
      if (!result.rowCount && !exists.rowCount)
        return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'We could not find this model.');
      return { saved: true };
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/wishlist/:id',
    { schema: { tags: ['Account'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      await pool.query('DELETE FROM customer_wishlist WHERE customer_id=$1 AND product_id=$2', [
        session.user.id,
        request.params.id,
      ]);
      return { saved: false };
    },
  );

  app.put<{ Params: { id: string } }>(
    '/api/restock-alerts/:id',
    { schema: { tags: ['Account'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const result = await pool.query(
        `INSERT INTO catalogue_restock_requests(customer_id,product_id)
         SELECT $1,id FROM catalogue_products WHERE id=$2 AND published_at IS NOT NULL
         ON CONFLICT (customer_id,product_id) DO UPDATE SET notified_at=NULL,created_at=now()`,
        [session.user.id, request.params.id],
      );
      if (!result.rowCount)
        return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'We could not find this model.');
      return { requested: true };
    },
  );
}
