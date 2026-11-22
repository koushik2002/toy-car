import { randomUUID } from 'node:crypto';
import bwipjs from 'bwip-js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';
import { product, productColumns } from './routes.js';
import { ensureSeriesPrefix, nextProductCode, nextUnitCodes, seriesKey } from './series-codes.js';

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;
const productFields = {
  name: { type: 'string', minLength: 1, maxLength: 200 },
  brand: { type: 'string', minLength: 1, maxLength: 100 },
  series: { type: 'string', minLength: 1, maxLength: 100 },
  manufactureYear: { anyOf: [{ type: 'integer', minimum: 1886, maximum: 2100 }, { type: 'null' }] },
  scale: { type: 'string', maxLength: 50 },
  condition: { type: 'string', minLength: 1, maxLength: 50 },
  pricePaise: { type: 'integer', minimum: 0, maximum: 2147483647 },
  mrpPaise: { type: 'integer', minimum: 0, maximum: 2147483647 },
  rare: { type: 'boolean' },
  description: { type: 'string', maxLength: 10000 },
  offer: { anyOf: [{ type: 'string', maxLength: 100 }, { type: 'null' }] },
  variantGroup: { type: 'string', maxLength: 160 },
  variantLabel: { type: 'string', maxLength: 160 },
  serialTracking: { type: 'boolean' },
  lowStockThreshold: { type: 'integer', minimum: 0, maximum: 10000 },
} as const;
type ProductBody = {
  sku?: string;
  name: string;
  brand: string;
  series: string;
  manufactureYear?: number | null;
  scale?: string;
  condition?: string;
  pricePaise: number;
  mrpPaise: number;
  rare?: boolean;
  description?: string;
  offer?: string | null;
  variantGroup?: string;
  variantLabel?: string;
  serialTracking?: boolean;
  lowStockThreshold?: number;
};
const fields: Record<string, string> = {
  name: 'name',
  brand: 'brand',
  series: 'series',
  manufactureYear: 'manufacture_year',
  scale: 'scale',
  condition: 'condition',
  pricePaise: 'price_paise',
  mrpPaise: 'mrp_paise',
  rare: 'rare',
  description: 'description',
  offer: 'offer',
  variantGroup: 'variant_group',
  variantLabel: 'variant_label',
  serialTracking: 'serial_tracking',
  lowStockThreshold: 'low_stock_threshold',
};

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}
async function tx<T>(pool: Pool, fn: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
async function audit(
  client: PoolClient,
  request: FastifyRequest,
  action: string,
  userId: string,
  entityId: string,
  metadata: Record<string, unknown> = {},
) {
  await client.query(
    'INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id,metadata) VALUES ($1,$2,$3,$4,$5,$6)',
    [randomUUID(), userId, action, entityId, request.id, JSON.stringify(metadata)],
  );
}
async function loadProduct(pool: Pool, id: string) {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT ${productColumns} FROM catalogue_products p WHERE p.id=$1`,
    [id],
  );
  return result.rows[0]
    ? {
        ...product(result.rows[0]),
        published: !!result.rows[0].published_at,
        serialTracking: result.rows[0].serial_tracking,
      }
    : null;
}

export async function registerAdminCatalogueRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
) {
  const roles = ['admin', 'super_admin'] as const;
  app.get(
    '/api/admin/series-codes',
    { schema: { tags: ['Admin catalogue'] } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...roles]))) return reply;
      const rows = await pool.query<{ brand_name: string; series_name: string; prefix: string }>(
        'SELECT brand_name,series_name,prefix FROM catalogue_series_codes ORDER BY brand_name,series_name LIMIT 500',
      );
      return {
        items: rows.rows.map((row) => ({
          brand: row.brand_name,
          series: row.series_name,
          prefix: row.prefix,
        })),
      };
    },
  );
  type AdminListQuery = {
    q?: string;
    brand?: string;
    status?: 'live' | 'draft';
    lowStock?: boolean;
    limit?: number;
    offset?: number;
  };
  function adminFilter(query: AdminListQuery) {
    const values: unknown[] = [];
    const where: string[] = [];
    if (query.q?.trim()) {
      values.push(`%${query.q.trim().replace(/[\\%_]/g, '\\$&')}%`);
      where.push(
        `(p.name ILIKE $${values.length} ESCAPE '\\' OR p.sku ILIKE $${values.length} ESCAPE '\\' OR p.brand ILIKE $${values.length} ESCAPE '\\')`,
      );
    }
    if (query.brand) {
      values.push(query.brand);
      where.push(`p.brand = $${values.length}`);
    }
    if (query.status === 'live') where.push('p.published_at IS NOT NULL');
    if (query.status === 'draft') where.push('p.published_at IS NULL');
    if (query.lowStock) where.push('p.available <= p.low_stock_threshold');
    return { values, where: where.length ? `WHERE ${where.join(' AND ')}` : '' };
  }
  const adminListQuery = {
    type: 'object',
    additionalProperties: false,
    properties: {
      q: { type: 'string', maxLength: 100 },
      brand: { type: 'string', maxLength: 100 },
      status: { type: 'string', enum: ['live', 'draft'] },
      lowStock: { type: 'boolean' },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
      offset: { type: 'integer', minimum: 0, maximum: 100000 },
    },
  } as const;
  app.get<{ Querystring: AdminListQuery }>(
    '/api/admin/products',
    { schema: { tags: ['Admin catalogue'], querystring: adminListQuery } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...roles]))) return reply;
      const { limit = 30, offset = 0 } = request.query;
      const { values, where } = adminFilter(request.query);
      const count = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM catalogue_products p ${where}`,
        values,
      );
      const result = await pool.query<Record<string, unknown>>(
        `SELECT ${productColumns} FROM catalogue_products p ${where}
      ORDER BY p.created_at DESC,p.id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset],
      );
      const brands = await pool.query<{ brand: string }>(
        'SELECT DISTINCT brand FROM catalogue_products ORDER BY brand LIMIT 500',
      );
      return {
        items: result.rows.map((row) => ({
          ...product(row),
          published: !!row.published_at,
          serialTracking: row.serial_tracking,
        })),
        total: Number(count.rows[0].total),
        brands: brands.rows.map((row) => row.brand),
      };
    },
  );
  app.get<{ Querystring: AdminListQuery }>(
    '/api/admin/products/export.csv',
    { schema: { tags: ['Admin catalogue'], querystring: adminListQuery } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...roles]))) return reply;
      const { values, where } = adminFilter(request.query);
      const result = await pool.query<Record<string, unknown>>(
        `SELECT p.* FROM catalogue_products p ${where} ORDER BY p.brand,p.series,p.name LIMIT 20000`,
        values,
      );
      const columns = [
        'sku',
        'name',
        'brand',
        'series',
        'manufacture_year',
        'scale',
        'condition',
        'price',
        'mrp',
        'stock',
        'low_stock_threshold',
        'rare',
        'offer',
        'serial_tracking',
        'variant_group',
        'variant_label',
        'description',
      ];
      // Formula-looking cells are prefixed so spreadsheet apps never execute them.
      const cell = (value: unknown) => {
        let text = value === null || value === undefined ? '' : String(value);
        if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
        return `"${text.replaceAll('"', '""')}"`;
      };
      const rupees = (paise: unknown) => (Number(paise) / 100).toFixed(2);
      const lines = result.rows.map((row) =>
        [
          row.sku,
          row.name,
          row.brand,
          row.series,
          row.manufacture_year,
          row.scale,
          row.condition,
          rupees(row.price_paise),
          rupees(row.mrp_paise),
          row.available,
          row.low_stock_threshold,
          row.rare,
          row.offer,
          row.serial_tracking,
          row.variant_group,
          row.variant_label,
          row.description,
        ]
          .map(cell)
          .join(','),
      );
      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', 'attachment; filename="tiny-kars-products.csv"')
        .header('Cache-Control', 'no-store')
        .send(`\uFEFF${[columns.join(','), ...lines].join('\r\n')}\r\n`);
    },
  );
  app.get<{ Params: { id: string } }>(
    '/api/admin/products/:id',
    { schema: { tags: ['Admin catalogue'], params: idParams } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...roles]))) return reply;
      const item = await loadProduct(pool, request.params.id);
      return item ? { product: item } : fail(reply, 404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    },
  );

  app.post<{ Body: ProductBody }>(
    '/api/admin/products',
    {
      schema: {
        tags: ['Admin catalogue'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['name', 'brand', 'series', 'pricePaise', 'mrpPaise'],
          properties: {
            ...productFields,
            sku: { type: 'string', minLength: 3, maxLength: 80, pattern: '^[A-Za-z0-9._-]+$' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [...roles]);
      if (!session) return reply;
      const b = request.body;
      if (!b.name.trim() || !b.brand.trim() || !b.series.trim())
        return fail(
          reply,
          400,
          'INVALID_PRODUCT',
          'Product name, brand and series cannot be blank.',
        );
      if (b.mrpPaise < b.pricePaise)
        return fail(reply, 400, 'INVALID_PRICE', 'MRP cannot be lower than the selling price.');
      let item: string;
      try {
        item = await tx(pool, async (client) => {
          const id = randomUUID();
          let sku: string;
          if (b.sku) {
            await ensureSeriesPrefix(client, b.brand, b.series);
            sku = b.sku.toUpperCase();
          } else sku = await nextProductCode(client, b.brand, b.series);
          await client.query(
            `INSERT INTO catalogue_products(id,sku,name,brand,series,manufacture_year,scale,condition,
        price_paise,mrp_paise,rare,description,offer,variant_group,variant_label,serial_tracking,
        low_stock_threshold)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
              id,
              sku,
              b.name.trim(),
              b.brand.trim(),
              b.series.trim(),
              b.manufactureYear ?? null,
              b.scale || '',
              b.condition || 'New',
              b.pricePaise,
              b.mrpPaise,
              b.rare || false,
              b.description || '',
              b.offer || null,
              b.variantGroup?.trim() || '',
              b.variantLabel?.trim() || '',
              b.serialTracking || false,
              b.lowStockThreshold ?? 3,
            ],
          );
          await audit(client, request, 'product.created', session.user.id, id);
          return id;
        });
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          return fail(reply, 409, 'SKU_CONFLICT', 'This product code is already in use.');
        throw error;
      }
      return reply.code(201).send({ product: await loadProduct(pool, item) });
    },
  );

  app.patch<{ Params: { id: string }; Body: Partial<ProductBody> }>(
    '/api/admin/products/:id',
    {
      schema: {
        tags: ['Admin catalogue'],
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: productFields,
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [...roles]);
      if (!session) return reply;
      const result = await tx(pool, async (client) => {
        const row = await client.query<{
          available: number;
          serial_tracking: boolean;
          price_paise: number;
          mrp_paise: number;
          series: string;
          brand: string;
        }>(
          'SELECT available,serial_tracking,price_paise,mrp_paise,series,brand FROM catalogue_products WHERE id=$1 FOR UPDATE',
          [request.params.id],
        );
        if (!row.rowCount) return 'missing';
        if (
          request.body.series !== undefined &&
          seriesKey(request.body.brand || row.rows[0].brand, request.body.series) !==
            seriesKey(row.rows[0].brand, row.rows[0].series)
        )
          return 'series';
        if (
          request.body.brand !== undefined &&
          seriesKey(request.body.brand, row.rows[0].series) !==
            seriesKey(row.rows[0].brand, row.rows[0].series)
        )
          return 'series';
        if (
          request.body.serialTracking !== undefined &&
          request.body.serialTracking !== row.rows[0].serial_tracking &&
          row.rows[0].available > 0
        )
          return 'stock';
        const price = request.body.pricePaise ?? row.rows[0].price_paise;
        const mrp = request.body.mrpPaise ?? row.rows[0].mrp_paise;
        if (mrp < price) return 'price';
        const entries = Object.entries(request.body).filter(([key]) => fields[key]);
        const values = entries.map(([, value]) => value);
        const setters = entries.map(([key], index) => `${fields[key]}=$${index + 2}`);
        await client.query(
          `UPDATE catalogue_products SET ${setters.join(',')},updated_at=now() WHERE id=$1`,
          [request.params.id, ...values],
        );
        if (request.body.name?.trim())
          await client.query('UPDATE catalogue_products SET requires_review=false WHERE id=$1', [
            request.params.id,
          ]);
        await audit(client, request, 'product.updated', session.user.id, request.params.id, {
          before: row.rows[0],
          changes: request.body,
        });
        return 'ok';
      });
      if (result === 'missing') return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'Product not found.');
      if (result === 'stock')
        return fail(
          reply,
          409,
          'SERIAL_TRACKING_LOCKED',
          'Serial tracking cannot change while stock is available.',
        );
      if (result === 'series')
        return fail(
          reply,
          409,
          'SERIES_LOCKED',
          'Brand and series cannot change after a code is assigned. Create a new draft for a different brand or series.',
        );
      if (result === 'price')
        return fail(reply, 400, 'INVALID_PRICE', 'MRP cannot be lower than the selling price.');
      return { product: await loadProduct(pool, request.params.id) };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/products/:id/publish',
    { schema: { tags: ['Admin catalogue'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [...roles]);
      if (!session) return reply;
      const result = await tx(pool, async (client) => {
        const rows = await client.query<{ requires_review: boolean }>(
          'SELECT requires_review FROM catalogue_products WHERE id=$1 FOR UPDATE',
          [request.params.id],
        );
        if (!rows.rowCount) return 'missing';
        if (rows.rows[0].requires_review) return 'review';
        const media = await client.query<{ count: string }>(
          'SELECT count(*)::text AS count FROM catalogue_product_images WHERE product_id=$1',
          [request.params.id],
        );
        if (Number(media.rows[0].count) < 5) return 'images';
        await client.query(
          'UPDATE catalogue_products SET published_at=COALESCE(published_at,now()),updated_at=now() WHERE id=$1',
          [request.params.id],
        );
        await audit(client, request, 'product.published', session.user.id, request.params.id);
        return 'ok';
      });
      if (result === 'missing') return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'Product not found.');
      if (result === 'images')
        return fail(
          reply,
          409,
          'IMAGES_INCOMPLETE',
          'Add five real product images before publishing.',
        );
      if (result === 'review')
        return fail(
          reply,
          409,
          'REVIEW_REQUIRED',
          'Replace the temporary import identifier with the real product name before publishing.',
        );
      return { product: await loadProduct(pool, request.params.id) };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/products/:id/archive',
    { schema: { tags: ['Admin catalogue'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [...roles]);
      if (!session) return reply;
      const updated = await tx(pool, async (client) => {
        const result = await client.query(
          'UPDATE catalogue_products SET published_at=NULL,updated_at=now() WHERE id=$1 RETURNING id',
          [request.params.id],
        );
        if (result.rowCount)
          await audit(client, request, 'product.archived', session.user.id, request.params.id);
        return !!result.rowCount;
      });
      return updated
        ? { product: await loadProduct(pool, request.params.id) }
        : fail(reply, 404, 'PRODUCT_NOT_FOUND', 'Product not found.');
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/admin/products/:id/label.svg',
    { schema: { tags: ['Admin catalogue'], params: idParams } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...roles]))) return reply;
      const row = await pool.query<{ sku: string }>(
        'SELECT sku FROM catalogue_products WHERE id=$1',
        [request.params.id],
      );
      if (!row.rowCount) return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'Product not found.');
      const svg = bwipjs.toSVG({
        bcid: 'code128',
        text: row.rows[0].sku,
        scale: 2,
        height: 12,
        includetext: true,
        textxalign: 'center',
      });
      return reply
        .header('Content-Type', 'image/svg+xml')
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', `inline; filename="${row.rows[0].sku}.svg"`)
        .send(svg);
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/admin/products/:id/units',
    { schema: { tags: ['Admin catalogue'], params: idParams } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...roles]))) return reply;
      const exists = await pool.query('SELECT id FROM catalogue_products WHERE id=$1', [
        request.params.id,
      ]);
      if (!exists.rowCount) return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'Product not found.');
      const rows = await pool.query<{ id: string; serial_code: string; state: string }>(
        'SELECT id,serial_code,state FROM inventory_units WHERE product_id=$1 ORDER BY created_at DESC,id DESC LIMIT 500',
        [request.params.id],
      );
      return {
        units: rows.rows.map((row) => ({
          id: row.id,
          serialCode: row.serial_code,
          state: row.state,
        })),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/admin/units/:id/label.svg',
    { schema: { tags: ['Admin catalogue'], params: idParams } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...roles]))) return reply;
      const row = await pool.query<{ serial_code: string }>(
        'SELECT serial_code FROM inventory_units WHERE id=$1',
        [request.params.id],
      );
      if (!row.rowCount) return fail(reply, 404, 'UNIT_NOT_FOUND', 'Physical unit not found.');
      const svg = bwipjs.toSVG({
        bcid: 'code128',
        text: row.rows[0].serial_code,
        scale: 2,
        height: 12,
        includetext: true,
        textxalign: 'center',
      });
      return reply
        .header('Content-Type', 'image/svg+xml')
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', `inline; filename="${row.rows[0].serial_code}.svg"`)
        .send(svg);
    },
  );

  app.post<{
    Params: { id: string };
    Body: { delta: number; reason: string; idempotencyKey: string };
  }>(
    '/api/admin/products/:id/stock',
    {
      schema: {
        tags: ['Admin catalogue'],
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['delta', 'reason', 'idempotencyKey'],
          properties: {
            delta: { type: 'integer', minimum: -100, maximum: 100, not: { const: 0 } },
            reason: { type: 'string', minLength: 3, maxLength: 500 },
            idempotencyKey: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [...roles]);
      if (!session) return reply;
      const { delta, reason, idempotencyKey } = request.body;
      const result = await tx(pool, async (client) => {
        const row = await client.query<{
          available: number;
          serial_tracking: boolean;
          series: string;
          brand: string;
        }>(
          'SELECT available,serial_tracking,series,brand FROM catalogue_products WHERE id=$1 FOR UPDATE',
          [request.params.id],
        );
        if (!row.rowCount) return { kind: 'missing' };
        const previous = await client.query<{
          id: string;
          product_id: string;
          delta: number;
          reason: string;
          after_available: number;
        }>(
          'SELECT id,product_id,delta,reason,after_available FROM inventory_movements WHERE source_key=$1',
          [idempotencyKey],
        );
        if (previous.rowCount)
          return previous.rows[0].product_id === request.params.id &&
            previous.rows[0].delta === delta &&
            previous.rows[0].reason === reason.trim()
            ? {
                kind: 'existing',
                movementId: previous.rows[0].id,
                available: previous.rows[0].after_available,
              }
            : { kind: 'conflict' };
        const available = row.rows[0].available + delta;
        if (available < 0) return { kind: 'stock' };
        if (row.rows[0].serial_tracking && delta < 0) {
          const units = await client.query<{ id: string }>(
            `SELECT id FROM inventory_units WHERE product_id=$1 AND state='available'
          ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2`,
            [request.params.id, -delta],
          );
          if (units.rows.length !== -delta) return { kind: 'stock' };
          await client.query(
            "UPDATE inventory_units SET state='quarantine' WHERE id=ANY($1::uuid[])",
            [units.rows.map((unit) => unit.id)],
          );
        }
        if (row.rows[0].serial_tracking && delta > 0) {
          if (!row.rows[0].series.trim()) return { kind: 'series' };
          const codes = await nextUnitCodes(client, row.rows[0].brand, row.rows[0].series, delta);
          for (const code of codes)
            await client.query(
              'INSERT INTO inventory_units(id,product_id,serial_code) VALUES ($1,$2,$3)',
              [randomUUID(), request.params.id, code],
            );
        }
        await client.query(
          'UPDATE catalogue_products SET available=$2,updated_at=now() WHERE id=$1',
          [request.params.id, available],
        );
        const movementId = randomUUID();
        await client.query(
          `INSERT INTO inventory_movements(id,product_id,delta,after_available,reason,source_key,actor_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            movementId,
            request.params.id,
            delta,
            available,
            reason.trim(),
            idempotencyKey,
            session.user.id,
          ],
        );
        await audit(client, request, 'inventory.adjusted', session.user.id, request.params.id, {
          beforeAvailable: row.rows[0].available,
          afterAvailable: available,
          delta,
          reason: reason.trim(),
        });
        return { kind: 'created', movementId, available };
      });
      if (result.kind === 'missing')
        return fail(reply, 404, 'PRODUCT_NOT_FOUND', 'Product not found.');
      if (result.kind === 'stock')
        return fail(
          reply,
          409,
          'INSUFFICIENT_STOCK',
          'This adjustment would make available stock negative.',
        );
      if (result.kind === 'series')
        return fail(
          reply,
          409,
          'SERIES_REQUIRED',
          'Add a series before assigning physical unit codes.',
        );
      if (result.kind === 'conflict')
        return fail(
          reply,
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request key was used for a different adjustment.',
        );
      return result;
    },
  );
}
