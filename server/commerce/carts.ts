import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';

const itemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['productId', 'quantity'],
  properties: {
    productId: { type: 'string', format: 'uuid' },
    quantity: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

export async function registerCartRoutes(app: FastifyInstance, pool: Pool, auth: IdentityConfig) {
  app.get('/api/cart', { schema: { tags: ['Cart'] } }, async (request, reply) => {
    const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
    if (!session) return reply;
    const rows = await pool.query<{
      product_id: string;
      quantity: number;
      sku: string;
      name: string;
      price_paise: number;
      available: number;
      published_at: Date | null;
    }>(
      `SELECT i.product_id,i.quantity,p.sku,p.name,p.price_paise,p.available,p.published_at
         FROM commerce_carts c JOIN commerce_cart_items i ON i.cart_id=c.id
         JOIN catalogue_products p ON p.id=i.product_id
        WHERE c.customer_id=$1 ORDER BY i.added_at,i.product_id`,
      [session.user.id],
    );
    return reply.header('Cache-Control', 'no-store').send({
      items: rows.rows.map((row) => ({
        productId: row.product_id,
        quantity: row.quantity,
        sku: row.sku,
        name: row.name,
        pricePaise: row.price_paise,
        available: row.available,
        purchasable: !!row.published_at && row.available >= row.quantity,
      })),
    });
  });

  app.put<{ Body: { items: { productId: string; quantity: number }[] } }>(
    '/api/cart',
    {
      schema: {
        tags: ['Cart'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['items'],
          properties: { items: { type: 'array', maxItems: 100, items: itemSchema } },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const unique = new Map<string, number>();
      for (const item of request.body.items) {
        if (unique.has(item.productId))
          return fail(reply, 400, 'DUPLICATE_CART_ITEM', 'Each product may appear only once.');
        unique.set(item.productId, item.quantity);
      }
      if (unique.size) {
        const found = await pool.query<{ id: string }>(
          'SELECT id FROM catalogue_products WHERE id=ANY($1::uuid[])',
          [[...unique.keys()]],
        );
        if (found.rowCount !== unique.size)
          return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'A cart product no longer exists.');
      }
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cart = await client.query<{ id: string }>(
          `INSERT INTO commerce_carts(id,customer_id) VALUES($1,$2)
           ON CONFLICT(customer_id) DO UPDATE SET updated_at=now() RETURNING id`,
          [randomUUID(), session.user.id],
        );
        await client.query('DELETE FROM commerce_cart_items WHERE cart_id=$1', [cart.rows[0].id]);
        for (const [productId, quantity] of unique)
          await client.query(
            'INSERT INTO commerce_cart_items(cart_id,product_id,quantity) VALUES($1,$2,$3)',
            [cart.rows[0].id, productId, quantity],
          );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return reply.send({ saved: true, itemCount: unique.size });
    },
  );

  app.delete('/api/cart', { schema: { tags: ['Cart'] } }, async (request, reply) => {
    const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
    if (!session) return reply;
    await pool.query('DELETE FROM commerce_carts WHERE customer_id=$1', [session.user.id]);
    return reply.code(204).send();
  });
}
