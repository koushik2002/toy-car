import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import argon2 from 'argon2';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { createApp } from '../server/app.js';
import { readConfig } from '../server/config.js';
import { migrate } from '../server/migrate.js';
import { localReviewAccounts, localReviewPassword } from './local-review-accounts.js';
import { sampleImagePrefix, seedSampleCatalogue, seedSampleOrders } from './sample-catalogue.js';

if (process.env.NODE_ENV === 'production' || process.env.DATABASE_URL) {
  throw new Error(
    'Local review must use its isolated database; remove production environment settings.',
  );
}

const databasePort = 56000 + (process.pid % 1000);
// Override when another local copy is already using the default ports.
const apiPort = Number(process.env.LOCAL_API_PORT || 3001);
const webPort = Number(process.env.LOCAL_WEB_PORT || 5173);
const localDatabaseDir = process.env.LOCAL_DATABASE_DIR?.trim();
if (localDatabaseDir) await mkdir(localDatabaseDir, { recursive: true });
const database = await PGlite.create(localDatabaseDir);
const databaseServer = new PGLiteSocketServer({
  db: database,
  host: '127.0.0.1',
  port: databasePort,
});
await databaseServer.start();

const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${databasePort}/postgres`;
// The embedded socket adapter is intentionally single-connection. Production PostgreSQL uses the
// normal multi-connection pool configured by server/index.ts.
const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
await migrate(pool);

const localEmail = 'seller@tinykars.local';
const localPassword = localReviewPassword;
const sellerId = 'b0400df5-42d5-4237-997f-3006f65f693c';
const productId = '0eb971bc-3ff2-4b74-a89f-b23a2ee04555';
const passwordHash = await argon2.hash(localPassword, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});

const seeded = await pool.query<{ id: string }>(
  "SELECT id FROM identity_users WHERE email='collector@tinykars.local' LIMIT 1",
);
if (!seeded.rowCount) {
  await pool.query(
    `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
     VALUES($1,'Local Billing Seller',$2,$3,'seller',now())`,
    [sellerId, localEmail, passwordHash],
  );
  const collectorId = randomUUID();
  await pool.query(
    `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at,phone)
     VALUES($1,'Local Collector','collector@tinykars.local',$2,'customer',now(),'9876500001')`,
    [collectorId, passwordHash],
  );
  await pool.query(
    `INSERT INTO catalogue_products
      (id,sku,name,brand,series,manufacture_year,scale,condition,price_paise,mrp_paise,
       available,description,published_at)
     VALUES($1,'482916-P000001','Blue Sports Car','Tiny Kars','Collector Series',2026,
       '1:64','New',129900,149900,10,'Local production walkthrough product.',now())`,
    [productId],
  );
  for (let slot = 1; slot <= 5; slot += 1)
    await pool.query(
      'INSERT INTO catalogue_product_images(product_id,slot,url,alt) VALUES($1,$2,$3,$4)',
      [
        productId,
        slot,
        `${sampleImagePrefix}car-1-view-${slot}.webp`,
        `Blue Sports Car view ${slot}`,
      ],
    );
  for (const account of localReviewAccounts) {
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
       VALUES($1,$2,$3,$4,$5,now())`,
      [randomUUID(), account.name, account.email, passwordHash, account.role],
    );
  }
  await pool.query(
    `INSERT INTO billing_settings
      (id,legal_name,invoice_prefix,default_tax_bps,active,created_by,activated_at)
     VALUES($1,'Tiny Kars','TK',0,true,$2,now())`,
    [randomUUID(), sellerId],
  );

  const sampleProducts = await seedSampleCatalogue(pool, sellerId);
  await seedSampleOrders(pool, collectorId, sampleProducts);
}

// Local-only finance fixtures make points and store-credit controls visible during the client
// walkthrough. They are append-only ledger records and remain idempotent across demo restarts.
const demoPeople = await pool.query<{ collector_id: string; owner_id: string }>(
  `SELECT
    (SELECT id FROM identity_users WHERE email='collector@tinykars.local') AS collector_id,
    (SELECT id FROM identity_users WHERE email='superadmin@tinykars.local') AS owner_id`,
);
const demoCollectorId = demoPeople.rows[0]?.collector_id;
const demoOwnerId = demoPeople.rows[0]?.owner_id;
if (demoCollectorId && demoOwnerId) {
  await pool.query(
    `INSERT INTO commerce_loyalty_policies
      (id,earn_points_per_100_rupees,redeem_paise_per_point,minimum_redeem_points,
       maximum_redeem_points,active,created_by,activated_at)
     SELECT $1,2,100,50,500,true,$2,now()
      WHERE NOT EXISTS (SELECT 1 FROM commerce_loyalty_policies WHERE active=true)`,
    [randomUUID(), demoOwnerId],
  );
  await pool.query(
    `INSERT INTO commerce_loyalty_entries
      (id,customer_id,points,kind,reason,source_key,created_by)
     VALUES($1,$2,250,'adjustment','Opening local demo balance','local-demo:loyalty',$3)
     ON CONFLICT(source_key) DO NOTHING`,
    [randomUUID(), demoCollectorId, demoOwnerId],
  );
  await pool.query(
    `INSERT INTO commerce_wallet_entries
      (id,customer_id,amount_paise,kind,reason,source_key,created_by)
     VALUES($1,$2,25000,'adjustment','Opening local demo balance','local-demo:wallet',$3)
     ON CONFLICT(source_key) DO NOTHING`,
    [randomUUID(), demoCollectorId, demoOwnerId],
  );
}

const config = readConfig({
  PUBLIC_BROWSING: process.env.PUBLIC_BROWSING ?? '0',
  DATABASE_URL: databaseUrl,
  PORT: String(apiPort),
  PUBLIC_WEB_URL: `http://127.0.0.1:${webPort}`,
  ALLOWED_ORIGINS: `http://127.0.0.1:${webPort}`,
  OUTBOX_ENCRYPTION_KEY: '11'.repeat(32),
  PAYMENT_TEST_MODE: '1',
});
const app = await createApp(pool, config);
await app.listen({ host: '127.0.0.1', port: apiPort });

const vite = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    String(webPort),
    '--strictPort',
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, VITE_API_PROXY: `http://127.0.0.1:${apiPort}` },
    stdio: 'inherit',
  },
);

process.stdout.write(`
Tiny Kars production application is running locally.
Website: http://127.0.0.1:${webPort}
Billing: http://127.0.0.1:${webPort}/billing
Email: ${localEmail}
Customer email: collector@tinykars.local
Super admin email: superadmin@tinykars.local
Admin email: admin@tinykars.local
Delivery staff email: staff@tinykars.local
Password: ${localPassword}

This uses the real React/Fastify/PostgreSQL code with a ${localDatabaseDir ? `persistent local database at ${localDatabaseDir}` : 'temporary in-memory local database'}.
It is filled with the demo's 60 cars and labelled SAMPLE photos until the real catalogue arrives.
Set PUBLIC_BROWSING=1 to let signed-out visitors browse, as in the original demo.
Razorpay, email, WhatsApp and R2 remain disabled until real provider credentials are configured.
${localDatabaseDir ? 'Press Ctrl+C to stop. Restart with the same command to reuse all local data.' : 'Press Ctrl+C to stop and erase the temporary local data.'}

`);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  vite.kill('SIGTERM');
  await app.close();
  await pool.end();
  await databaseServer.stop();
  await database.close();
}

process.once('SIGINT', () => void stop().finally(() => process.exit(0)));
process.once('SIGTERM', () => void stop().finally(() => process.exit(0)));
vite.once('exit', () => void stop().finally(() => process.exit(0)));
