import pg from 'pg';
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { migrate } from './migrate.js';
import { pruneIdentity, sendPendingEmails } from './notifications/worker.js';
import { sendOrderConfirmations } from './commerce/notification-worker.js';
import { expirePendingCheckouts } from './commerce/checkout.js';

const config = readConfig();
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});
await migrate(pool);
const app = await createApp(pool, config);
const address = await app.listen({ host: '0.0.0.0', port: config.port });
app.log.info({ address }, 'Tiny Kars API is listening');
const timer = setInterval(() => {
  void sendPendingEmails(pool, config).catch((error) =>
    app.log.error({ err: error }, 'Email worker failed'),
  );
  void sendOrderConfirmations(pool, config).catch((error) =>
    app.log.error({ err: error }, 'Order confirmation worker failed'),
  );
  void expirePendingCheckouts(pool).catch((error) =>
    app.log.error({ err: error }, 'Checkout expiry worker failed'),
  );
}, 5000);
timer.unref();
const maintenance = setInterval(
  () => {
    void pruneIdentity(pool).catch((error) =>
      app.log.error({ err: error }, 'Identity maintenance failed'),
    );
  },
  60 * 60 * 1000,
);
maintenance.unref();
void pruneIdentity(pool).catch((error) =>
  app.log.error({ err: error }, 'Identity maintenance failed'),
);
const stop = async () => {
  clearInterval(timer);
  clearInterval(maintenance);
  await app.close();
  await pool.end();
};
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
