import pg from 'pg';
import { readConfig } from './config.js';
import { decryptPayload } from './identity/security.js';

if (process.env.NODE_ENV === 'production')
  throw new Error('Development email inspection is disabled in production.');
if (process.env.ALLOW_DEV_EMAIL_INSPECTION !== '1')
  throw new Error('Set ALLOW_DEV_EMAIL_INSPECTION=1 for local email inspection.');
const address = process.argv[2]?.toLowerCase();
if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address))
  throw new Error('Usage: npm run dev:email -- customer@example.com');
const config = readConfig();
const pool = new pg.Pool({ connectionString: config.databaseUrl });
try {
  const result = await pool.query<{ kind: string; encrypted_payload: string }>(
    `SELECT o.kind,o.encrypted_payload FROM identity_outbox o
     JOIN identity_tokens t ON o.event_key=t.purpose || ':' || t.token_hash
     JOIN identity_users u ON u.id=t.user_id
     WHERE u.email=$1 AND t.consumed_at IS NULL AND t.expires_at > now()
     ORDER BY o.created_at DESC LIMIT 1`,
    [address],
  );
  if (!result.rowCount) throw new Error('No active account email for this address.');
  const payload = decryptPayload(result.rows[0].encrypted_payload, config.outboxEncryptionKey);
  // Local developer terminal only. This command is excluded from the production entry point.
  console.log(`${result.rows[0].kind}: ${payload.url}`);
} finally {
  await pool.end();
}
