import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig, IdentityRole } from './routes.js';
import { requireIdentityRole } from './routes.js';

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

export async function registerPrivilegedIdentityRoutes(
  app: FastifyInstance,
  pool: Pool,
  config: IdentityConfig,
) {
  app.post<{ Body: { email: string; role: 'customer' | 'seller' | 'staff' | 'admin' } }>(
    '/api/admin/users/assign-role',
    {
      schema: {
        tags: ['Admin identity'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['email', 'role'],
          properties: {
            email: {
              type: 'string',
              minLength: 3,
              maxLength: 254,
              pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$',
            },
            role: { type: 'string', enum: ['customer', 'seller', 'staff', 'admin'] },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, config, ['super_admin']);
      if (!session) return reply;
      const client = await pool.connect();
      let result: 'missing' | 'self' | 'unchanged' | 'updated';
      try {
        await client.query('BEGIN');
        const user = await client.query<{
          id: string;
          role: IdentityRole;
          email_verified_at: Date | null;
        }>(
          'SELECT id,role,email_verified_at FROM identity_users WHERE email=$1 AND disabled_at IS NULL FOR UPDATE',
          [request.body.email.trim().toLowerCase()],
        );
        if (!user.rowCount || !user.rows[0].email_verified_at) result = 'missing';
        else if (user.rows[0].id === session.user.id) result = 'self';
        else if (user.rows[0].role === request.body.role) result = 'unchanged';
        else {
          await client.query(
            `UPDATE identity_users SET role=$2,auth_version=auth_version+1,updated_at=now()
            WHERE id=$1`,
            [user.rows[0].id, request.body.role],
          );
          await client.query(
            'UPDATE identity_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',
            [user.rows[0].id],
          );
          await client.query(
            `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id,metadata)
            VALUES($1,$2,'user.role_changed',$3,$4,$5)`,
            [
              randomUUID(),
              session.user.id,
              user.rows[0].id,
              request.id,
              JSON.stringify({ from: user.rows[0].role, to: request.body.role }),
            ],
          );
          result = 'updated';
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      if (result === 'missing')
        return fail(reply, 404, 'USER_NOT_FOUND', 'Use a verified, active customer account.');
      if (result === 'self')
        return fail(
          reply,
          409,
          'SELF_ROLE_CHANGE',
          'Super admins cannot change their own role here.',
        );
      return { status: result, role: request.body.role };
    },
  );
}
