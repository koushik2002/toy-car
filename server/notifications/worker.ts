import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { ServerConfig } from '../config.js';
import { decryptPayload } from '../identity/security.js';

interface Job {
  id: string;
  event_key: string;
  kind: 'verify_email' | 'reset_password';
  encrypted_payload: string;
  attempts: number;
}

export async function sendPendingEmails(pool: Pool, config: ServerConfig) {
  if (!config.resendApiKey || !config.emailFrom) return 0;
  const leaseOwner = randomUUID();
  const claimed = await pool.query<Job>(
    `UPDATE identity_outbox SET status='processing', attempts=attempts+1,
    lease_until=now()+interval '2 minutes', lease_owner=$1
    WHERE id IN (
      SELECT id FROM identity_outbox
      WHERE (status='pending' AND available_at <= now())
         OR (status='processing' AND lease_until < now())
      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 5
    ) RETURNING id,event_key,kind,encrypted_payload,attempts`,
    [leaseOwner],
  );
  for (const job of claimed.rows) {
    try {
      const active = await pool.query(
        `SELECT 1 FROM identity_tokens WHERE purpose || ':' || token_hash=$1
         AND consumed_at IS NULL AND expires_at > now()`,
        [job.event_key],
      );
      if (!active.rowCount) {
        await pool.query(
          `UPDATE identity_outbox SET status='failed',lease_until=NULL,lease_owner=NULL,
           encrypted_payload='',last_error='action_link_inactive'
           WHERE id=$1 AND status='processing' AND lease_owner=$2`,
          [job.id, leaseOwner],
        );
        continue;
      }
      const payload = decryptPayload(job.encrypted_payload, config.outboxEncryptionKey);
      const subject =
        job.kind === 'verify_email'
          ? 'Verify your Tiny Kars email'
          : 'Reset your Tiny Kars password';
      const text = `${payload.name},\n\n${job.kind === 'verify_email' ? 'Verify your email' : 'Reset your password'} using this link:\n${payload.url}\n\nThis link expires at ${payload.expiresAt}. If you did not request this, ignore this email.`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${config.resendApiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': job.id,
        },
        body: JSON.stringify({ from: config.emailFrom, to: [payload.to], subject, text }),
      });
      if (!response.ok) throw new Error(`Email provider returned ${response.status}`);
      const body = (await response.json()) as { id?: string };
      await pool.query(
        `UPDATE identity_outbox SET status='sent',sent_at=now(),lease_until=NULL,lease_owner=NULL,provider_id=$2,last_error=NULL,encrypted_payload=''
        WHERE id=$1 AND status='processing' AND lease_owner=$3`,
        [job.id, body.id || null, leaseOwner],
      );
    } catch (error) {
      const status = job.attempts >= 8 ? 'failed' : 'pending';
      const providerStatus =
        error instanceof Error
          ? /^Email provider returned (\d{3})$/.exec(error.message)?.[1]
          : undefined;
      const failureCode = providerStatus
        ? `provider_http_${providerStatus}`
        : error instanceof Error && error.name === 'TimeoutError'
          ? 'provider_timeout'
          : 'delivery_error';
      // Never persist provider bodies or exception strings: they can contain action links.
      await pool.query(
        `UPDATE identity_outbox SET status=$2,available_at=now()+($3::integer * interval '1 minute'),
        lease_until=NULL,lease_owner=NULL,last_error=$5
        WHERE id=$1 AND status='processing' AND lease_owner=$4`,
        [job.id, status, Math.min(60, 2 ** job.attempts), leaseOwner, failureCode],
      );
    }
  }
  return claimed.rowCount ?? 0;
}

/** Erase stale action URLs and bound authentication/notification table growth. */
export async function pruneIdentity(pool: Pool) {
  await pool.query(`UPDATE identity_outbox SET status='failed',encrypted_payload='',
    lease_until=NULL,lease_owner=NULL,last_error='action_link_expired'
    WHERE status IN ('pending','processing','failed') AND created_at < now()-interval '7 days'`);
  await pool.query(`DELETE FROM identity_outbox
    WHERE status IN ('sent','failed') AND created_at < now()-interval '30 days'`);
  await pool.query(`DELETE FROM identity_tokens
    WHERE expires_at < now()-interval '7 days' OR consumed_at < now()-interval '7 days'`);
  await pool.query(`DELETE FROM identity_sessions
    WHERE expires_at < now()-interval '7 days' OR revoked_at < now()-interval '7 days'`);
  await pool.query(`DELETE FROM identity_mfa_pending WHERE expires_at < now()`);
  await pool.query(`DELETE FROM identity_throttle WHERE window_start < now()-interval '1 day'`);
}
