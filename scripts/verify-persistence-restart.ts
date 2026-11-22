import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import pg from 'pg';
import { createApp } from '../server/app.js';
import { migrate } from '../server/migrate.js';
import type { ServerConfig } from '../server/config.js';

const dataDir = await mkdtemp(join(tmpdir(), 'tiny-kars-persistence-'));
const basePort = 57000 + (process.pid % 4000);
const userId = randomUUID();
const productId = randomUUID();

async function open(port: number) {
  const database = await PGlite.create(dataDir);
  const socket = new PGLiteSocketServer({ db: database, host: '127.0.0.1', port });
  await socket.start();
  const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres`;
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  await migrate(pool);
  const config: ServerConfig = {
    databaseUrl,
    port: 0,
    production: false,
    allowedOrigins: ['http://127.0.0.1:5173'],
    publicWebUrl: 'http://127.0.0.1:5173',
    outboxEncryptionKey: '22'.repeat(32),
  };
  const app = await createApp(pool, config);
  const ready = await app.inject({ method: 'GET', url: '/api/health/ready' });
  if (ready.statusCode !== 200) throw new Error(`Readiness failed: ${ready.body}`);
  return { database, socket, pool, app };
}

async function close(value: Awaited<ReturnType<typeof open>>) {
  await value.app.close();
  await value.pool.end();
  await value.socket.stop();
  await value.database.close();
}

let current: Awaited<ReturnType<typeof open>> | null = null;
try {
  current = await open(basePort);
  await current.pool.query(
    `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
     VALUES($1,'Persistence QA',$2,'local-test-hash','customer',now())`,
    [userId, `persistence-${userId}@example.test`],
  );
  await current.pool.query(
    `INSERT INTO catalogue_products
      (id,sku,name,brand,series,price_paise,mrp_paise,available,published_at)
     VALUES($1,$2,'Persistence Car','QA Brand','Restart',10000,10000,7,now())`,
    [productId, `PERSIST-${productId.slice(0, 8)}`],
  );
  await current.pool.query(
    `INSERT INTO inventory_movements
      (id,product_id,delta,after_available,reason,source_key,actor_id)
     VALUES($1,$2,7,7,'Persistence seed',$3,$4)`,
    [randomUUID(), productId, `persistence:${productId}`, userId],
  );
  await current.pool.query(
    `INSERT INTO commerce_wallet_entries
      (id,customer_id,amount_paise,kind,reason,source_key,created_by)
     VALUES($1,$2,12345,'adjustment','Persistence verification',$3,$2)`,
    [randomUUID(), userId, `persistence:${userId}`],
  );
  await close(current);
  current = null;

  current = await open(basePort + 1);
  const stock = await current.pool.query<{ available: number; movements: number }>(
    `SELECT p.available,
      (SELECT count(*)::integer FROM inventory_movements m WHERE m.product_id=p.id) AS movements
     FROM catalogue_products p WHERE p.id=$1`,
    [productId],
  );
  const wallet = await current.pool.query<{ balance: number }>(
    `SELECT COALESCE(sum(amount_paise),0)::integer AS balance
       FROM commerce_wallet_entries WHERE customer_id=$1`,
    [userId],
  );
  const migrations = await current.pool.query<{ total: number }>(
    'SELECT count(*)::integer AS total FROM schema_migrations',
  );
  if (
    stock.rows[0]?.available !== 7 ||
    stock.rows[0]?.movements !== 1 ||
    wallet.rows[0]?.balance !== 12345
  )
    throw new Error('Inventory or financial records did not survive the database restart.');
  process.stdout.write(
    `${JSON.stringify({
      status: 'passed',
      stockAvailable: stock.rows[0].available,
      inventoryMovements: stock.rows[0].movements,
      walletBalancePaise: wallet.rows[0].balance,
      appliedMigrations: migrations.rows[0].total,
    })}\n`,
  );
} finally {
  if (current) await close(current);
  if (dataDir.startsWith(join(tmpdir(), 'tiny-kars-persistence-')))
    await rm(dataDir, { recursive: true, force: true });
}
