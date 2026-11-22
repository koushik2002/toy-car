import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';

const querySchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    q: { type: 'string', maxLength: 100 },
    brand: { type: 'string', maxLength: 100 },
    series: { type: 'string', maxLength: 100 },
    scale: { type: 'string', maxLength: 50 },
    condition: { type: 'string', maxLength: 50 },
    year: { type: 'integer', minimum: 1886, maximum: 2100 },
    minPrice: { type: 'integer', minimum: 0 },
    maxPrice: { type: 'integer', minimum: 0 },
    inStock: { type: 'boolean' },
    rare: { type: 'boolean' },
    offer: { type: 'string', maxLength: 100 },
    sort: { type: 'string', enum: ['newest', 'price-asc', 'price-desc', 'popular'] },
    cursor: { type: 'string', maxLength: 32, pattern: '^[0-9]+$' },
    limit: { type: 'integer', minimum: 1, maximum: 48 },
  },
} as const;

interface Filters {
  q?: string;
  brand?: string;
  series?: string;
  scale?: string;
  condition?: string;
  year?: number;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  rare?: boolean;
  offer?: string;
  sort?: 'newest' | 'price-asc' | 'price-desc' | 'popular';
  cursor?: string;
  limit?: number;
}

type Row = Record<string, unknown>;

export function product(row: Row) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    brand: row.brand,
    series: row.series,
    manufactureYear: row.manufacture_year,
    scale: row.scale,
    condition: row.condition,
    pricePaise: row.price_paise,
    mrpPaise: row.mrp_paise,
    available: row.available,
    lowStockThreshold: row.low_stock_threshold,
    rare: row.rare,
    description: row.description,
    offer: row.offer,
    variantGroup: row.variant_group,
    variantLabel: row.variant_label,
    requiresReview: row.requires_review ?? false,
    images: row.images || [],
    createdAt: row.created_at,
  };
}

export const productColumns = `p.*, COALESCE((SELECT jsonb_agg(jsonb_build_object('slot',i.slot,'url',i.url,'alt',i.alt) ORDER BY i.slot)
  FROM catalogue_product_images i WHERE i.product_id=p.id), '[]'::jsonb) AS images`;

export async function registerCatalogueRoutes(app: FastifyInstance, pool: Pool) {
  app.get<{ Querystring: Filters }>(
    '/api/products',
    { schema: { tags: ['Catalogue'], querystring: querySchema } },
    async (request, reply) => {
      const f = request.query;
      if (f.minPrice !== undefined && f.maxPrice !== undefined && f.minPrice > f.maxPrice) {
        return reply.code(400).send({
          error: {
            code: 'INVALID_PRICE_RANGE',
            message: 'Minimum price cannot exceed maximum price.',
          },
          requestId: request.id,
        });
      }
      const values: unknown[] = [];
      const where = ['p.published_at IS NOT NULL'];
      const add = (field: string, value: unknown, operator = '=') => {
        values.push(value);
        where.push(`${field} ${operator} $${values.length}`);
      };
      if (f.q?.trim()) {
        values.push(`%${f.q.trim().replace(/[\\%_]/g, '\\$&')}%`);
        where.push(
          `(p.name ILIKE $${values.length} ESCAPE '\\' OR p.brand ILIKE $${values.length} ESCAPE '\\' OR p.sku ILIKE $${values.length} ESCAPE '\\')`,
        );
      }
      if (f.brand) add('p.brand', f.brand);
      if (f.series) add('p.series', f.series);
      if (f.scale) add('p.scale', f.scale);
      if (f.condition) add('p.condition', f.condition);
      if (f.year !== undefined) add('p.manufacture_year', f.year);
      if (f.minPrice !== undefined) add('p.price_paise', f.minPrice, '>=');
      if (f.maxPrice !== undefined) add('p.price_paise', f.maxPrice, '<=');
      if (f.inStock) where.push('p.available > 0');
      if (f.rare) where.push('p.rare = true');
      if (f.offer) add('p.offer', f.offer);
      const predicate = where.join(' AND ');
      const count = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM catalogue_products p WHERE ${predicate}`,
        values,
      );
      const total = Number(count.rows[0].total);
      const limit = f.limit ?? 24;
      const offset = Number(f.cursor ?? '0');
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
        return reply.code(400).send({
          error: { code: 'INVALID_CURSOR', message: 'This page could not be found.' },
          requestId: request.id,
        });
      }
      const order = {
        newest: 'p.created_at DESC, p.id DESC',
        'price-asc': 'p.price_paise ASC, p.id ASC',
        'price-desc': 'p.price_paise DESC, p.id DESC',
        popular: 'p.popularity_score DESC, p.id DESC',
      }[f.sort ?? 'newest'];
      const rows = await pool.query<Row>(
        `SELECT ${productColumns} FROM catalogue_products p WHERE ${predicate} ORDER BY ${order} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
        [...values, limit, offset],
      );
      const facets = await pool.query<{
        brands: string[];
        series: string[];
        scales: string[];
        conditions: string[];
        years: number[];
        offers: string[];
      }>(`SELECT
      ARRAY(SELECT DISTINCT brand FROM catalogue_products WHERE published_at IS NOT NULL ORDER BY brand) AS brands,
      ARRAY(SELECT DISTINCT series FROM catalogue_products WHERE published_at IS NOT NULL AND series <> '' ORDER BY series) AS series,
      ARRAY(SELECT DISTINCT scale FROM catalogue_products WHERE published_at IS NOT NULL AND scale <> '' ORDER BY scale) AS scales,
      ARRAY(SELECT DISTINCT condition FROM catalogue_products WHERE published_at IS NOT NULL ORDER BY condition) AS conditions,
      ARRAY(SELECT DISTINCT manufacture_year FROM catalogue_products WHERE published_at IS NOT NULL AND manufacture_year IS NOT NULL ORDER BY manufacture_year DESC) AS years,
      ARRAY(SELECT DISTINCT offer FROM catalogue_products WHERE published_at IS NOT NULL AND offer IS NOT NULL ORDER BY offer) AS offers`);
      reply.header('Cache-Control', 'private, no-store');
      return {
        items: rows.rows.map(product),
        nextCursor: offset + limit < total ? String(offset + limit) : null,
        total,
        facets: facets.rows[0],
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/products/:id',
    {
      schema: {
        tags: ['Catalogue'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      const result = await pool.query<Row>(
        `SELECT ${productColumns} FROM catalogue_products p WHERE p.id=$1 AND p.published_at IS NOT NULL`,
        [request.params.id],
      );
      if (!result.rowCount)
        return reply.code(404).send({
          error: { code: 'PRODUCT_NOT_FOUND', message: 'We could not find this model.' },
          requestId: request.id,
        });
      reply.header('Cache-Control', 'private, no-store');
      const current = result.rows[0];
      const variants = current.variant_group
        ? await pool.query<Row>(
            `SELECT ${productColumns} FROM catalogue_products p
              WHERE p.variant_group=$1 AND p.published_at IS NOT NULL
              ORDER BY p.variant_label,p.price_paise,p.id`,
            [current.variant_group],
          )
        : null;
      return {
        product: product(current),
        variants: variants ? variants.rows.map(product) : [],
      };
    },
  );
}
