import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { readConfig } from './config.js';

const migrations = [
  new URL('./identity/schema.sql', import.meta.url),
  new URL('./catalogue/schema.sql', import.meta.url),
  new URL('./identity/002_mfa.sql', import.meta.url),
  new URL('./catalogue/002_operations.sql', import.meta.url),
  new URL('./identity/003_roles.sql', import.meta.url),
  new URL('./commerce/001_orders.sql', import.meta.url),
  new URL('./catalogue/003_series_codes.sql', import.meta.url),
  new URL('./commerce/002_shipping.sql', import.meta.url),
  new URL('./commerce/003_vouchers.sql', import.meta.url),
  new URL('./commerce/004_payment_events.sql', import.meta.url),
  new URL('./commerce/005_notifications.sql', import.meta.url),
  new URL('./commerce/006_checkout.sql', import.meta.url),
  new URL('./commerce/007_finance.sql', import.meta.url),
  new URL('./commerce/008_whatsapp.sql', import.meta.url),
  new URL('./billing/001_billing.sql', import.meta.url),
  new URL('./commerce/009_storefront.sql', import.meta.url),
  new URL('./catalogue/004_variants.sql', import.meta.url),
  new URL('./catalogue/005_backend_admin.sql', import.meta.url),
  new URL('./commerce/010_end_to_end.sql', import.meta.url),
  new URL('./billing/002_seller_portal.sql', import.meta.url),
  new URL('./billing/003_test_payment_snapshot.sql', import.meta.url),
];

export async function migrate(pool: pg.Pool) {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(98701027)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const source of migrations) {
      const name = fileURLToPath(source).split('/').slice(-2).join('/');
      const sql = await readFile(source, 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const prior = await client.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name=$1',
        [name],
      );
      if (prior.rowCount) {
        if (prior.rows[0].checksum !== checksum)
          throw new Error(`Migration changed after application: ${name}`);
        continue;
      }
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name,checksum) VALUES ($1,$2)', [
          name,
          checksum,
        ]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock(98701027)');
    client.release();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const pool = new pg.Pool({ connectionString: readConfig().databaseUrl });
  migrate(pool)
    .then(() => console.log('Migrations applied.'))
    .finally(() => pool.end());
}
