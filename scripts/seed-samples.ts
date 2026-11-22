// Seeds a staging database with the sample catalogue, or withdraws it once real products exist.
//   npm run seed:samples             add sample cars (refuses if the catalogue already has products)
//   npm run seed:samples -- --withdraw   unpublish every product that still uses sample photos
import pg from 'pg';
import { sampleImagePrefix, seedSampleCatalogue } from './sample-catalogue.js';

if (process.env.NODE_ENV === 'production')
  throw new Error('Sample products must never be added to the production database.');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  if (process.argv.includes('--withdraw')) {
    const result = await pool.query(
      `UPDATE catalogue_products SET published_at=NULL,updated_at=now()
        WHERE published_at IS NOT NULL AND id IN (
          SELECT product_id FROM catalogue_product_images WHERE url LIKE $1)`,
      [`${sampleImagePrefix}%`],
    );
    process.stdout.write(`Unpublished ${result.rowCount} sample products.\n`);
  } else {
    const existing = await pool.query('SELECT 1 FROM catalogue_products LIMIT 1');
    if (existing.rowCount) throw new Error('The catalogue already has products; samples skipped.');
    const owner = await pool.query<{ id: string }>(
      "SELECT id FROM identity_users WHERE role='super_admin' ORDER BY created_at LIMIT 1",
    );
    if (!owner.rowCount) throw new Error('Create the super admin first (npm run admin:provision).');
    const ids = await seedSampleCatalogue(pool, owner.rows[0].id);
    process.stdout.write(`Added ${ids.length} sample products with five sample views each.\n`);
  }
} finally {
  await pool.end();
}
