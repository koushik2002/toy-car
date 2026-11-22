import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import { csrfTokenFor, encryptPayload, hashToken, newToken, tokenMatches } from './security.js';

export interface IdentityConfig {
  emailPasswordEnabled: boolean;
  production: boolean;
  allowedOrigins: string[];
  publicWebUrl: string;
  outboxEncryptionKey: string;
}

export type IdentityRole = 'customer' | 'seller' | 'staff' | 'admin' | 'super_admin';
export interface IdentityUser {
  id: string;
  name: string;
  email: string;
  role: IdentityRole;
  emailVerified: boolean;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: IdentityRole;
  email_verified_at: Date | null;
  disabled_at: Date | null;
  password_hash: string;
  auth_version: number;
}

export const SESSION_COOKIE = 'tk_session';
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const passwordSchema = { type: 'string', minLength: 12, maxLength: 128 } as const;
const emailSchema = {
  type: 'string',
  minLength: 3,
  maxLength: 254,
  pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
} as const;
const tokenSchema = { type: 'string', pattern: '^[A-Za-z0-9_-]{43}$' } as const;
const messageResponse = {
  type: 'object',
  required: ['message'],
  properties: { message: { type: 'string' } },
} as const;
const sessionResponse = {
  type: 'object',
  required: ['user', 'csrfToken'],
  properties: {
    user: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          required: ['id', 'name', 'email', 'role', 'emailVerified'],
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            email: { type: 'string' },
            role: { type: 'string', enum: ['customer', 'seller', 'staff', 'admin', 'super_admin'] },
            emailVerified: { type: 'boolean' },
          },
        },
      ],
    },
    csrfToken: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const;

function exposeUser(row: UserRow): IdentityUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    emailVerified: row.email_verified_at !== null,
  };
}

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

function requireOrigin(request: FastifyRequest, reply: FastifyReply, config: IdentityConfig) {
  if (!request.headers.origin || !config.allowedOrigins.includes(request.headers.origin)) {
    fail(reply, 403, 'ORIGIN_NOT_ALLOWED', 'This request did not come from an approved website.');
    return false;
  }
  if (request.headers['sec-fetch-site'] === 'cross-site') {
    fail(reply, 403, 'ORIGIN_NOT_ALLOWED', 'This request did not come from an approved website.');
    return false;
  }
  return true;
}

function setSession(reply: FastifyReply, token: string, production: boolean) {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/api',
    maxAge: SESSION_SECONDS,
  });
}

function clearSession(reply: FastifyReply, production: boolean) {
  reply.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: production,
    sameSite: 'lax',
    path: '/api',
  });
}

async function transaction<T>(pool: Pool, run: (client: PoolClient) => Promise<T>) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function audit(client: PoolClient, request: FastifyRequest, action: string, userId: string) {
  await client.query(
    'INSERT INTO identity_audit_log (id,actor_id,action,entity_id,request_id) VALUES ($1,$2,$3,$2,$4)',
    [randomUUID(), userId, action, request.id],
  );
}

async function throttle(pool: Pool, action: string, email: string, maximum: number) {
  const result = await pool.query<{ attempts: number }>(
    `INSERT INTO identity_throttle (key_hash) VALUES ($1)
     ON CONFLICT (key_hash) DO UPDATE SET
       attempts = CASE WHEN identity_throttle.window_start < now() - interval '15 minutes'
         THEN 1 ELSE identity_throttle.attempts + 1 END,
       window_start = CASE WHEN identity_throttle.window_start < now() - interval '15 minutes'
         THEN now() ELSE identity_throttle.window_start END
     RETURNING attempts`,
    [hashToken(`${action}:${email}`)],
  );
  return result.rows[0].attempts <= maximum;
}

async function enqueueToken(
  client: PoolClient,
  user: UserRow,
  purpose: 'verify_email' | 'reset_password',
  config: IdentityConfig,
) {
  const token = newToken();
  const tokenHash = hashToken(token);
  const lifetimeMs = purpose === 'verify_email' ? 24 * 60 * 60 * 1000 : 30 * 60 * 1000;
  const expiresAt = new Date(Date.now() + lifetimeMs);
  await client.query(
    `UPDATE identity_tokens SET consumed_at = now()
     WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL`,
    [user.id, purpose],
  );
  await client.query(
    'INSERT INTO identity_tokens (token_hash,user_id,purpose,expires_at) VALUES ($1,$2,$3,$4)',
    [tokenHash, user.id, purpose, expiresAt],
  );
  const url = new URL(
    purpose === 'verify_email' ? '/account/verify' : '/account/reset',
    config.publicWebUrl,
  );
  url.hash = `token=${token}`;
  await client.query(
    'INSERT INTO identity_outbox (id,event_key,kind,encrypted_payload) VALUES ($1,$2,$3,$4)',
    [
      randomUUID(),
      `${purpose}:${tokenHash}`,
      purpose,
      encryptPayload(
        { to: user.email, name: user.name, url: url.href, expiresAt: expiresAt.toISOString() },
        config.outboxEncryptionKey,
      ),
    ],
  );
}

export async function getIdentitySession(
  pool: Pool,
  request: FastifyRequest,
  config: IdentityConfig,
): Promise<{ user: IdentityUser; csrfToken: string; tokenHash: string } | null> {
  if (!config.emailPasswordEnabled) return null;
  const token = request.cookies[SESSION_COOKIE];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const tokenHash = hashToken(token);
  const result = await pool.query<UserRow>(
    `SELECT u.* FROM identity_sessions s JOIN identity_users u ON u.id=s.user_id
     WHERE s.token_hash=$1 AND s.expires_at > now() AND s.revoked_at IS NULL
       AND s.auth_version=u.auth_version AND s.role_at_issue=u.role AND u.disabled_at IS NULL
       AND u.email_verified_at IS NOT NULL`,
    [tokenHash],
  );
  if (!result.rowCount) return null;
  return {
    user: exposeUser(result.rows[0]),
    csrfToken: csrfTokenFor(token, config.outboxEncryptionKey),
    tokenHash,
  };
}

/** Authorisation helper: every future privileged route must call this server-side. */
export async function requireIdentityRole(
  pool: Pool,
  request: FastifyRequest,
  reply: FastifyReply,
  config: IdentityConfig,
  roles: IdentityRole[],
) {
  const session = await getIdentitySession(pool, request, config);
  if (!session) {
    fail(reply, 401, 'AUTHENTICATION_REQUIRED', 'Please sign in to continue.');
    return null;
  }
  if (!roles.includes(session.user.role)) {
    fail(reply, 403, 'FORBIDDEN', 'Your account cannot perform this action.');
    return null;
  }
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    if (!requireOrigin(request, reply, config)) return null;
    const csrf = request.headers['x-csrf-token'];
    if (!tokenMatches(typeof csrf === 'string' ? csrf : undefined, session.csrfToken)) {
      fail(reply, 403, 'CSRF_INVALID', 'Refresh this page before trying again.');
      return null;
    }
  }
  return session;
}

export async function registerIdentityRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: IdentityConfig,
) {
  const dummyHash = await argon2.hash(newToken(), {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
  const hashPassword = (password: string) =>
    argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1,
    });
  await app.register(async function identityRoutes(scope) {
    scope.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store').header('Pragma', 'no-cache');
      if (request.method !== 'GET') {
        if (!config.emailPasswordEnabled)
          return fail(reply, 503, 'AUTH_DISABLED', 'Account access is not available yet.');
        if (!requireOrigin(request, reply, config)) return reply;
      }
    });

    scope.get(
      '/api/auth/me',
      { schema: { tags: ['Identity'], response: { 200: sessionResponse } } },
      async (request) => {
        const session = await getIdentitySession(pool, request, config);
        return { user: session?.user ?? null, csrfToken: session?.csrfToken ?? null };
      },
    );

    scope.post<{ Body: { name: string; email: string; password: string } }>(
      '/api/auth/register',
      {
        schema: {
          tags: ['Identity'],
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'email', 'password'],
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 100 },
              email: emailSchema,
              password: passwordSchema,
            },
          },
          response: { 202: messageResponse },
        },
      },
      async (request, reply) => {
        const email = request.body.email.toLowerCase();
        const name = request.body.name.trim();
        if (!name) return fail(reply, 400, 'INVALID_NAME', 'Enter your name.');
        if (!(await throttle(pool, 'register', email, 3)))
          return fail(reply, 429, 'RATE_LIMITED', 'Please wait before trying again.');
        // Always hash, including duplicate addresses, to reduce account-existence timing differences.
        const passwordHash = await hashPassword(request.body.password);
        await transaction(pool, async (client) => {
          const result = await client.query<UserRow>(
            `INSERT INTO identity_users (id,name,email,password_hash) VALUES ($1,$2,$3,$4)
           ON CONFLICT (email) DO NOTHING RETURNING *`,
            [randomUUID(), name, email, passwordHash],
          );
          if (!result.rowCount) return;
          const user = result.rows[0];
          await enqueueToken(client, user, 'verify_email', config);
          await audit(client, request, 'account.registered', user.id);
        });
        return reply.code(202).send({
          message:
            'If this address can be registered, a verification link will arrive by email. Open it before signing in.',
        });
      },
    );

    scope.post<{ Body: { email: string; password: string } }>(
      '/api/auth/login',
      {
        schema: {
          tags: ['Identity'],
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['email', 'password'],
            properties: {
              email: emailSchema,
              password: passwordSchema,
            },
          },
          response: { 200: sessionResponse },
        },
      },
      async (request, reply) => {
        const email = request.body.email.toLowerCase();
        if (!(await throttle(pool, 'login', email, 10)))
          return fail(
            reply,
            429,
            'RATE_LIMITED',
            'Too many attempts. Please wait 15 minutes before trying again.',
          );
        const initial = await pool.query<UserRow>('SELECT * FROM identity_users WHERE email=$1', [
          email,
        ]);
        const candidate = initial.rows[0];
        const passwordOk = await argon2.verify(
          candidate?.password_hash ?? dummyHash,
          request.body.password,
        );
        if (!candidate || !passwordOk || candidate.disabled_at)
          return fail(reply, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
        if (!candidate.email_verified_at)
          return fail(
            reply,
            403,
            'EMAIL_NOT_VERIFIED',
            'Verify your email before signing in. You can request a new link using Forgot password.',
          );
        const token = newToken();
        const user = await transaction(pool, async (client) => {
          const locked = await client.query<UserRow>(
            'SELECT * FROM identity_users WHERE id=$1 FOR UPDATE',
            [candidate.id],
          );
          const current = locked.rows[0];
          if (
            !current ||
            current.password_hash !== candidate.password_hash ||
            current.disabled_at ||
            !current.email_verified_at ||
            !['customer', 'seller', 'staff', 'admin', 'super_admin'].includes(current.role)
          )
            return null;
          const previous = request.cookies[SESSION_COOKIE];
          if (previous)
            await client.query(
              'UPDATE identity_sessions SET revoked_at=now() WHERE token_hash=$1',
              [hashToken(previous)],
            );
          await client.query(
            'INSERT INTO identity_sessions (token_hash,user_id,auth_version,role_at_issue,expires_at) VALUES ($1,$2,$3,$4,$5)',
            [
              hashToken(token),
              current.id,
              current.auth_version,
              current.role,
              new Date(Date.now() + SESSION_SECONDS * 1000),
            ],
          );
          await audit(client, request, 'session.created', current.id);
          return exposeUser(current);
        });
        if (!user)
          return fail(reply, 401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
        setSession(reply, token, config.production);
        return { user, csrfToken: csrfTokenFor(token, config.outboxEncryptionKey) };
      },
    );

    scope.post(
      '/api/auth/logout',
      {
        schema: { tags: ['Identity'], response: { 200: messageResponse } },
      },
      async (request, reply) => {
        const session = await getIdentitySession(pool, request, config);
        if (session) {
          const csrf = request.headers['x-csrf-token'];
          if (!tokenMatches(typeof csrf === 'string' ? csrf : undefined, session.csrfToken))
            return fail(reply, 403, 'CSRF_INVALID', 'Refresh this page before trying again.');
          await transaction(pool, async (client) => {
            await client.query(
              'UPDATE identity_sessions SET revoked_at=now() WHERE token_hash=$1',
              [session.tokenHash],
            );
            await audit(client, request, 'session.revoked', session.user.id);
          });
        }
        clearSession(reply, config.production);
        return { message: 'You have signed out.' };
      },
    );

    scope.post<{ Body: { email: string } }>(
      '/api/auth/forgot-password',
      {
        schema: {
          tags: ['Identity'],
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['email'],
            properties: { email: emailSchema },
          },
          response: { 202: messageResponse },
        },
      },
      async (request, reply) => {
        const email = request.body.email.toLowerCase();
        if (!(await throttle(pool, 'forgot', email, 3)))
          return fail(reply, 429, 'RATE_LIMITED', 'Please wait before requesting another email.');
        await transaction(pool, async (client) => {
          const result = await client.query<UserRow>(
            'SELECT * FROM identity_users WHERE email=$1 FOR UPDATE',
            [email],
          );
          const user = result.rows[0];
          if (!user || user.disabled_at || !['customer', 'seller'].includes(user.role)) return;
          await enqueueToken(
            client,
            user,
            user.email_verified_at ? 'reset_password' : 'verify_email',
            config,
          );
          await audit(client, request, 'account.recovery_requested', user.id);
        });
        return reply
          .code(202)
          .send({ message: 'If an eligible account exists, we will email a link to continue.' });
      },
    );

    scope.post<{ Body: { token: string } }>(
      '/api/auth/verify-email',
      {
        schema: {
          tags: ['Identity'],
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['token'],
            properties: { token: tokenSchema },
          },
          response: { 200: messageResponse },
        },
      },
      async (request, reply) => {
        const tokenHash = hashToken(request.body.token);
        const verified = await transaction(pool, async (client) => {
          // All token-consuming routes lock the user first, then the token to avoid reset/verify deadlocks.
          const lookup = await client.query<{ user_id: string }>(
            "SELECT user_id FROM identity_tokens WHERE token_hash=$1 AND purpose='verify_email'",
            [tokenHash],
          );
          if (!lookup.rowCount) return false;
          const users = await client.query<UserRow>(
            'SELECT * FROM identity_users WHERE id=$1 FOR UPDATE',
            [lookup.rows[0].user_id],
          );
          const user = users.rows[0];
          if (!user || user.disabled_at) return false;
          const consumed = await client.query(
            `UPDATE identity_tokens SET consumed_at=now() WHERE token_hash=$1 AND purpose='verify_email'
           AND consumed_at IS NULL AND expires_at > now() RETURNING user_id`,
            [tokenHash],
          );
          if (!consumed.rowCount) return false;
          await client.query(
            'UPDATE identity_users SET email_verified_at=COALESCE(email_verified_at,now()),updated_at=now() WHERE id=$1',
            [user.id],
          );
          await audit(client, request, 'account.email_verified', user.id);
          return true;
        });
        if (!verified)
          return fail(
            reply,
            400,
            'TOKEN_INVALID',
            'This link has expired or has already been used. Request a new email.',
          );
        return { message: 'Email verified. You can now sign in.' };
      },
    );

    scope.post<{ Body: { token: string; password: string } }>(
      '/api/auth/reset-password',
      {
        schema: {
          tags: ['Identity'],
          body: {
            type: 'object',
            additionalProperties: false,
            required: ['token', 'password'],
            properties: { token: tokenSchema, password: passwordSchema },
          },
          response: { 200: messageResponse },
        },
      },
      async (request, reply) => {
        const tokenHash = hashToken(request.body.token);
        const passwordHash = await hashPassword(request.body.password);
        const changed = await transaction(pool, async (client) => {
          const lookup = await client.query<{ user_id: string }>(
            "SELECT user_id FROM identity_tokens WHERE token_hash=$1 AND purpose='reset_password'",
            [tokenHash],
          );
          if (!lookup.rowCount) return false;
          const users = await client.query<UserRow>(
            'SELECT * FROM identity_users WHERE id=$1 FOR UPDATE',
            [lookup.rows[0].user_id],
          );
          const user = users.rows[0];
          if (
            !user ||
            user.disabled_at ||
            !user.email_verified_at ||
            !['customer', 'seller'].includes(user.role)
          )
            return false;
          const consumed = await client.query(
            `UPDATE identity_tokens SET consumed_at=now() WHERE token_hash=$1 AND purpose='reset_password'
           AND consumed_at IS NULL AND expires_at > now() RETURNING user_id`,
            [tokenHash],
          );
          if (!consumed.rowCount) return false;
          await client.query(
            'UPDATE identity_users SET password_hash=$1,auth_version=auth_version+1,updated_at=now() WHERE id=$2',
            [passwordHash, user.id],
          );
          await client.query(
            'UPDATE identity_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
            [user.id],
          );
          await client.query(
            'UPDATE identity_tokens SET consumed_at=now() WHERE user_id=$1 AND consumed_at IS NULL',
            [user.id],
          );
          await audit(client, request, 'account.password_reset', user.id);
          return true;
        });
        if (!changed)
          return fail(
            reply,
            400,
            'TOKEN_INVALID',
            'This link has expired or has already been used. Request a new email.',
          );
        clearSession(reply, config.production);
        return { message: 'Password updated. Sign in with your new password.' };
      },
    );
  });
}
