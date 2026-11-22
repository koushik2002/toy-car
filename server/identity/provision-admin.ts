import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';
import { readConfig } from '../config.js';

if (process.env.PROVISION_ADMIN !== '1' || !process.stdout.isTTY) {
  throw new Error(
    'Run in a private terminal with PROVISION_ADMIN=1. Never run this through application logs.',
  );
}
const email = process.argv[2]?.toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
  throw new Error('Usage: npm run admin:provision -- admin@example.com');
const config = readConfig();
const password = randomBytes(24).toString('base64url');
const passwordHash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
const pool = new pg.Pool({ connectionString: config.databaseUrl });
const client = await pool.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(846273991)');
  const privileged = await client.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM identity_users WHERE role IN ('admin','super_admin')",
  );
  if (Number(privileged.rows[0].count) !== 0) {
    throw new Error(
      'Initial super admin already exists. Further privileged users must be invited by the super admin.',
    );
  }
  const id = randomUUID();
  await client.query(
    `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
    VALUES ($1,'Tiny Kars Super Admin',$2,$3,'super_admin',now())`,
    [id, email, passwordHash],
  );
  await client.query(
    `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
    VALUES ($1,$2,'super_admin.provisioned',$2,'private-cli')`,
    [randomUUID(), id],
  );
  await client.query('COMMIT');
  process.stdout.write(
    `Super admin: ${email}\nOne-time password: ${password}\nStore it in the client-owned password manager, sign in, and change it under My account → Security.\n`,
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
