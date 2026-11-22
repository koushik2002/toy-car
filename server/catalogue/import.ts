import { createHash, randomUUID } from 'node:crypto';
import { parse } from 'csv-parse/sync';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';
import { ensureSeriesPrefix, nextProductCode, nextUnitCodes } from './series-codes.js';

type ImportRow = {
  name: string;
  brand: string;
  series: string;
  manufactureYear: number | null;
  scale: string;
  condition: string;
  pricePaise: number;
  mrpPaise: number;
  description: string;
  sku: string;
  serialTracking: boolean;
  // Optional because rows staged before these columns existed lack them.
  stock?: number;
  rare?: boolean;
  offer?: string | null;
  lowStockThreshold?: number;
  requiresReview?: boolean;
  variantGroup?: string;
  variantLabel?: string;
};
const headers = [
  'sku',
  'name',
  'brand',
  'series',
  'manufacture_year',
  'scale',
  'condition',
  'price_paise',
  'mrp_paise',
  'price',
  'mrp',
  'stock',
  'low_stock_threshold',
  'rare',
  'offer',
  'description',
  'serial_tracking',
  'variant_group',
  'variant_label',
];
const booleanWords = ['true', 'false', '1', '0', 'yes', 'no', 'y', 'n'];
const isTrue = (value: string) => ['true', '1', 'yes', 'y'].includes(value);
const idSchema = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

function normalize(raw: Record<string, string>, rowNumber: number) {
  const errors: string[] = [];
  const text = (key: string) => (raw[key] || '').trim();
  const suppliedName = text('name');
  const name = suppliedName || `IMPORT-ROW-${rowNumber}`;
  const brand = text('brand');
  const sku = text('sku').toUpperCase();
  const money = (key: string) => {
    const value = text(key);
    if (!/^\d{1,10}$/.test(value) || Number(value) > 2147483647) {
      errors.push(`${key} must be an integer amount in paise.`);
      return 0;
    }
    return Number(value);
  };
  if (name.length > 200) errors.push('name must be at most 200 characters.');
  if (!brand || brand.length > 100)
    errors.push('brand is required and must be at most 100 characters.');
  if (!text('series') || text('series').length > 100)
    errors.push('series is required and must be at most 100 characters.');
  if (sku && !/^[A-Z0-9._-]{3,80}$/.test(sku))
    errors.push('sku must be 3–80 letters, numbers, dots, dashes or underscores.');
  const yearText = text('manufacture_year');
  const year = yearText ? Number(yearText) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1886 || year > 2100))
    errors.push('manufacture_year must be 1886–2100.');
  // Rupee columns (price, mrp) are what people type; paise columns stay supported for old files.
  const rupees = (key: string) => {
    const value = text(key).replace(/[₹,\s]/g, '');
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(value)) {
      errors.push(`${key} must be a rupee amount such as 249 or 249.50.`);
      return 0;
    }
    return Math.round(Number(value) * 100);
  };
  const pricePaise = 'price' in raw ? rupees('price') : money('price_paise');
  const mrpPaise = 'mrp' in raw ? rupees('mrp') : money('mrp_paise');
  if (mrpPaise < pricePaise) errors.push('MRP cannot be less than the selling price.');
  const whole = (key: string, fallback: number, maximum: number) => {
    const value = text(key);
    if (!value) return fallback;
    if (!/^\d{1,6}$/.test(value) || Number(value) > maximum) {
      errors.push(`${key} must be a whole number from 0 to ${maximum}.`);
      return fallback;
    }
    return Number(value);
  };
  const stock = whole('stock', 0, 10000);
  const lowStockThreshold = whole('low_stock_threshold', 3, 10000);
  const rareText = text('rare').toLowerCase();
  if (rareText && !booleanWords.includes(rareText)) errors.push('rare must be yes or no.');
  if (text('offer').length > 100) errors.push('offer must be at most 100 characters.');
  if (text('variant_group').length > 160 || text('variant_label').length > 160)
    errors.push('variant_group and variant_label must be at most 160 characters.');
  if (
    text('series').length > 100 ||
    text('scale').length > 50 ||
    text('condition').length > 50 ||
    text('description').length > 10000
  )
    errors.push('A text field exceeds its maximum length.');
  const serialText = text('serial_tracking').toLowerCase();
  if (serialText && !booleanWords.includes(serialText))
    errors.push('serial_tracking must be yes or no.');
  const normalized: ImportRow = {
    sku,
    name,
    brand,
    series: text('series'),
    manufactureYear: year,
    scale: text('scale'),
    condition: text('condition') || 'New',
    pricePaise,
    mrpPaise,
    description: text('description'),
    serialTracking: isTrue(serialText),
    stock,
    rare: isTrue(rareText),
    offer: text('offer') || null,
    lowStockThreshold,
    requiresReview: !suppliedName,
    variantGroup: text('variant_group'),
    variantLabel: text('variant_label'),
  };
  return { rowNumber, normalized, errors };
}

export async function registerImportRoutes(app: FastifyInstance, pool: Pool, auth: IdentityConfig) {
  app.post<{ Body: { csv: string } }>(
    '/api/admin/imports',
    {
      bodyLimit: 1024 * 1024,
      schema: {
        tags: ['Admin catalogue'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['csv'],
          properties: { csv: { type: 'string', minLength: 1, maxLength: 900000 } },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      const csv = request.body.csv;
      let records: Record<string, string>[];
      try {
        records = parse(csv, {
          columns: (input: string[]) => {
            const cols = input.map((v) =>
              v
                .replace(/^\uFEFF/, '')
                .trim()
                .toLowerCase(),
            );
            if (
              new Set(cols).size !== cols.length ||
              !cols.includes('name') ||
              !cols.includes('brand') ||
              !cols.includes('series') ||
              !(cols.includes('price') || cols.includes('price_paise')) ||
              !(cols.includes('mrp') || cols.includes('mrp_paise')) ||
              (cols.includes('price') && cols.includes('price_paise')) ||
              (cols.includes('mrp') && cols.includes('mrp_paise')) ||
              cols.some((v) => !headers.includes(v))
            )
              throw new Error(
                'CSV headers must include name, brand, series, price and mrp (in rupees), with no unknown or duplicate columns. Download the template from the products page.',
              );
            return cols;
          },
          skip_empty_lines: true,
          trim: true,
          relax_quotes: false,
          bom: true,
        });
      } catch (error) {
        return fail(
          reply,
          400,
          'INVALID_CSV',
          error instanceof Error ? error.message : 'Invalid CSV file.',
        );
      }
      if (!records.length || records.length > 5000)
        return fail(reply, 400, 'INVALID_ROW_COUNT', 'CSV must have 1–5000 rows.');
      const rows = records.map((raw, index) => ({
        raw,
        action: 'create' as 'create' | 'update' | 'invalid',
        ...normalize(raw, index + 2),
      }));
      const specified = new Set<string>();
      for (const row of rows)
        if (row.normalized.sku) {
          if (specified.has(row.normalized.sku)) row.errors.push('Duplicate SKU in this file.');
          specified.add(row.normalized.sku);
        }
      if (specified.size) {
        const existing = await pool.query<{ sku: string; brand: string; series: string }>(
          'SELECT sku,brand,series FROM catalogue_products WHERE sku=ANY($1::text[])',
          [[...specified]],
        );
        const existingMap = new Map(existing.rows.map((row) => [row.sku, row]));
        for (const row of rows) {
          const found = existingMap.get(row.normalized.sku);
          if (!found) continue;
          row.action = 'update';
          if (
            found.brand.trim().toLowerCase() !== row.normalized.brand.trim().toLowerCase() ||
            found.series.trim().toLowerCase() !== row.normalized.series.trim().toLowerCase()
          )
            row.errors.push('An existing SKU cannot be moved to a different brand or series.');
        }
      }
      for (const row of rows) if (row.errors.length) row.action = 'invalid';
      const digest = createHash('sha256').update(csv).digest('hex');
      const client = await pool.connect();
      let jobId: string;
      try {
        await client.query('BEGIN');
        const previous = await client.query<{ id: string }>(
          'SELECT id FROM catalogue_import_jobs WHERE content_sha256=$1',
          [digest],
        );
        if (previous.rowCount) {
          jobId = previous.rows[0].id;
          await client.query('COMMIT');
        } else {
          jobId = randomUUID();
          await client.query(
            `INSERT INTO catalogue_import_jobs(id,content_sha256,created_by,row_count,error_count)
          VALUES($1,$2,$3,$4,$5)`,
            [
              jobId,
              digest,
              session.user.id,
              rows.length,
              rows.filter((row) => row.errors.length).length,
            ],
          );
          for (const row of rows)
            await client.query(
              `INSERT INTO catalogue_import_rows
          (job_id,row_number,action,raw,normalized,errors) VALUES($1,$2,$3,$4,$5,$6)`,
              [
                jobId,
                row.rowNumber,
                row.action,
                row.raw,
                row.normalized,
                JSON.stringify(row.errors),
              ],
            );
          await client.query('COMMIT');
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      return reply.code(201).send({
        jobId,
        preview: rows.slice(0, 50).map((row) => ({
          rowNumber: row.rowNumber,
          action: row.action,
          sku: row.normalized.sku || 'Generated on commit',
          name: row.normalized.requiresReview ? '(Admin review required)' : row.normalized.name,
          brand: row.normalized.brand,
          series: row.normalized.series,
          pricePaise: row.normalized.pricePaise,
          stock: row.normalized.stock ?? 0,
          errors: row.errors,
        })),
        rowCount: rows.length,
        errorCount: rows.filter((row) => row.errors.length).length,
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/admin/imports/:id',
    {
      schema: { tags: ['Admin catalogue'], params: idSchema },
    },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['admin', 'super_admin'])))
        return reply;
      const job = await pool.query(
        'SELECT id,status,row_count,error_count,created_at,committed_at FROM catalogue_import_jobs WHERE id=$1',
        [request.params.id],
      );
      if (!job.rowCount) return fail(reply, 404, 'IMPORT_NOT_FOUND', 'Import not found.');
      const rows = await pool.query(
        'SELECT row_number,action,normalized,errors FROM catalogue_import_rows WHERE job_id=$1 ORDER BY row_number LIMIT 100',
        [request.params.id],
      );
      return { job: job.rows[0], rows: rows.rows };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/imports/:id/commit',
    {
      schema: { tags: ['Admin catalogue'], params: idSchema },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      const client = await pool.connect();
      let outcome: 'missing' | 'invalid' | 'committed' | 'created';
      try {
        await client.query('BEGIN');
        const job = await client.query<{ status: string; error_count: number }>(
          'SELECT status,error_count FROM catalogue_import_jobs WHERE id=$1 FOR UPDATE',
          [request.params.id],
        );
        if (!job.rowCount) outcome = 'missing';
        else if (job.rows[0].status === 'committed') outcome = 'committed';
        else if (job.rows[0].error_count) outcome = 'invalid';
        else {
          const rows = await client.query<{ action: 'create' | 'update'; normalized: ImportRow }>(
            'SELECT action,normalized FROM catalogue_import_rows WHERE job_id=$1 ORDER BY row_number',
            [request.params.id],
          );
          for (const { action, normalized: b } of rows.rows) {
            let sku: string;
            if (b.sku) {
              await ensureSeriesPrefix(client, b.brand, b.series);
              sku = b.sku;
            } else sku = await nextProductCode(client, b.brand, b.series);
            const prior =
              action === 'update'
                ? await client.query<{
                    id: string;
                    available: number;
                    serial_tracking: boolean;
                  }>(
                    'SELECT id,available,serial_tracking FROM catalogue_products WHERE sku=$1 FOR UPDATE',
                    [sku],
                  )
                : null;
            if (action === 'update' && !prior?.rowCount)
              throw Object.assign(new Error('An update target was removed after preview.'), {
                code: 'IMPORT_TARGET_MISSING',
              });
            const productId = prior?.rows[0].id || randomUUID();
            const stock = b.stock ?? 0;
            if (action === 'create')
              await client.query(
                `INSERT INTO catalogue_products(id,sku,name,brand,series,manufacture_year,scale,condition,
            price_paise,mrp_paise,description,serial_tracking,available,rare,offer,low_stock_threshold,
            requires_review,variant_group,variant_label)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
                [
                  productId,
                  sku,
                  b.name,
                  b.brand,
                  b.series,
                  b.manufactureYear,
                  b.scale,
                  b.condition,
                  b.pricePaise,
                  b.mrpPaise,
                  b.description,
                  b.serialTracking,
                  stock,
                  b.rare ?? false,
                  b.offer ?? null,
                  b.lowStockThreshold ?? 3,
                  b.requiresReview ?? false,
                  b.variantGroup || '',
                  b.variantLabel || '',
                ],
              );
            else {
              if (
                prior!.rows[0].available > 0 &&
                prior!.rows[0].serial_tracking !== b.serialTracking
              )
                throw Object.assign(
                  new Error('Serial tracking cannot change while an imported SKU has stock.'),
                  { code: 'SERIAL_TRACKING_LOCKED' },
                );
              await client.query(
                `UPDATE catalogue_products SET name=$2,manufacture_year=$3,scale=$4,condition=$5,
                  price_paise=$6,mrp_paise=$7,description=$8,serial_tracking=$9,available=$10,
                  rare=$11,offer=$12,low_stock_threshold=$13,requires_review=$14,
                  variant_group=$15,variant_label=$16,
                  published_at=CASE WHEN $14 THEN NULL ELSE published_at END,updated_at=now()
                 WHERE id=$1`,
                [
                  productId,
                  b.name,
                  b.manufactureYear,
                  b.scale,
                  b.condition,
                  b.pricePaise,
                  b.mrpPaise,
                  b.description,
                  b.serialTracking,
                  stock,
                  b.rare ?? false,
                  b.offer ?? null,
                  b.lowStockThreshold ?? 3,
                  b.requiresReview ?? false,
                  b.variantGroup || '',
                  b.variantLabel || '',
                ],
              );
            }
            const delta = stock - (prior?.rows[0].available ?? 0);
            if (delta !== 0) {
              await client.query(
                `INSERT INTO inventory_movements
                  (id,product_id,delta,after_available,reason,source_key,actor_id)
                 VALUES($1,$2,$3,$4,$5,$6,$7)`,
                [
                  randomUUID(),
                  productId,
                  delta,
                  stock,
                  action === 'create'
                    ? 'Opening stock from CSV import'
                    : 'Stock updated from CSV import',
                  `import:${request.params.id}:${productId}`,
                  session.user.id,
                ],
              );
              if (b.serialTracking && delta < 0) {
                const units = await client.query<{ id: string }>(
                  `SELECT id FROM inventory_units WHERE product_id=$1 AND state='available'
                   ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $2`,
                  [productId, -delta],
                );
                if (units.rowCount !== -delta)
                  throw Object.assign(
                    new Error('Serial inventory does not match imported stock.'),
                    {
                      code: 'SERIAL_STOCK_MISMATCH',
                    },
                  );
                await client.query(
                  "UPDATE inventory_units SET state='quarantine' WHERE id=ANY($1::uuid[])",
                  [units.rows.map((unit) => unit.id)],
                );
              }
              // Serial allocation is capped per call, so large additions are numbered in batches.
              for (let left = b.serialTracking && delta > 0 ? delta : 0; left > 0; left -= 100)
                for (const code of await nextUnitCodes(
                  client,
                  b.brand,
                  b.series,
                  Math.min(left, 100),
                ))
                  await client.query(
                    'INSERT INTO inventory_units(id,product_id,serial_code) VALUES ($1,$2,$3)',
                    [randomUUID(), productId, code],
                  );
            }
          }
          await client.query(
            "UPDATE catalogue_import_jobs SET status='committed',committed_at=now() WHERE id=$1",
            [request.params.id],
          );
          await client.query(
            `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
          VALUES ($1,$2,'catalogue.imported',$3,$4)`,
            [randomUUID(), session.user.id, request.params.id, request.id],
          );
          outcome = 'created';
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505')
          return fail(
            reply,
            409,
            'SKU_CONFLICT',
            'A SKU was created after this file was staged. Upload the latest file again.',
          );
        if ((error as { code?: string }).code === 'IMPORT_TARGET_MISSING')
          return fail(
            reply,
            409,
            'IMPORT_TARGET_MISSING',
            'An update target changed after preview. Stage the file again.',
          );
        if (
          (error as { code?: string }).code === 'SERIAL_TRACKING_LOCKED' ||
          (error as { code?: string }).code === 'SERIAL_STOCK_MISMATCH'
        )
          return fail(reply, 409, (error as { code: string }).code, (error as Error).message);
        throw error;
      } finally {
        client.release();
      }
      if (outcome === 'missing') return fail(reply, 404, 'IMPORT_NOT_FOUND', 'Import not found.');
      if (outcome === 'invalid')
        return fail(reply, 409, 'IMPORT_HAS_ERRORS', 'Fix invalid rows and stage the file again.');
      const summary = await pool.query<{ action: string; count: string }>(
        `SELECT action,count(*)::text AS count FROM catalogue_import_rows
          WHERE job_id=$1 GROUP BY action ORDER BY action`,
        [request.params.id],
      );
      return {
        status: outcome === 'created' ? 'committed' : outcome,
        summary: Object.fromEntries(summary.rows.map((row) => [row.action, Number(row.count)])),
      };
    },
  );
}
