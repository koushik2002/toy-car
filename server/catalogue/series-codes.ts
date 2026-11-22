import { randomInt } from 'node:crypto';
import type { PoolClient } from 'pg';

export function seriesKey(brand: string, series: string) {
  return `${brand.trim().toLowerCase()}\u001f${series.trim().toLowerCase()}`;
}

export async function ensureSeriesPrefix(client: PoolClient, brand: string, series: string) {
  const brandName = brand.trim();
  const name = series.trim();
  if (!brandName || brandName.length > 100 || !name || name.length > 100)
    throw new Error('Brand and series are required for generated codes.');
  const key = seriesKey(brandName, name);
  // Prefix creation is rare; a transaction lock makes random collisions retryable without
  // assigning the same prefix to two concurrent series imports.
  await client.query('SELECT pg_advisory_xact_lock(98511432)');
  const existing = await client.query<{ prefix: string }>(
    'SELECT prefix FROM catalogue_series_codes WHERE series_key=$1',
    [key],
  );
  if (existing.rowCount) return { key, prefix: existing.rows[0].prefix };
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const prefix = String(randomInt(100000, 1000000));
    const inserted = await client.query<{ prefix: string }>(
      `INSERT INTO catalogue_series_codes
      (series_key,brand_name,series_name,prefix) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING prefix`,
      [key, brandName, name, prefix],
    );
    if (inserted.rowCount) return { key, prefix: inserted.rows[0].prefix };
  }
  throw new Error('Could not allocate a unique series prefix.');
}

export async function nextProductCode(client: PoolClient, brand: string, series: string) {
  const { key, prefix } = await ensureSeriesPrefix(client, brand, series);
  const number = await client.query<{ n: number }>(
    `UPDATE catalogue_series_codes SET
    next_product_number=next_product_number+1 WHERE series_key=$1
    RETURNING next_product_number-1 AS n`,
    [key],
  );
  return `${prefix}-P${String(number.rows[0].n).padStart(6, '0')}`;
}

export async function nextUnitCodes(
  client: PoolClient,
  brand: string,
  series: string,
  count: number,
) {
  if (!Number.isInteger(count) || count < 1 || count > 100)
    throw new Error('Invalid unit allocation count.');
  const { key, prefix } = await ensureSeriesPrefix(client, brand, series);
  const number = await client.query<{ start: number }>(
    `UPDATE catalogue_series_codes SET
    next_unit_number=next_unit_number+$2 WHERE series_key=$1
    RETURNING next_unit_number-$2 AS start`,
    [key, count],
  );
  return Array.from(
    { length: count },
    (_, index) => `${prefix}-U${String(number.rows[0].start + index).padStart(9, '0')}`,
  );
}
