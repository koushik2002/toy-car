import type { FastifyInstance } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig } from './routes.js';
import { requireIdentityRole } from './routes.js';

export async function registerAuditRoutes(app: FastifyInstance, pool: Pool, auth: IdentityConfig) {
  app.get<{
    Querystring: { q?: string; action?: string; actorId?: string; limit?: number; offset?: number };
  }>(
    '/api/admin/audit-logs',
    {
      schema: {
        tags: ['Admin audit'],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            q: { type: 'string', maxLength: 100 },
            action: { type: 'string', maxLength: 120 },
            actorId: { type: 'string', format: 'uuid' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0, maximum: 100000 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['admin', 'super_admin'])))
        return reply;
      const values: unknown[] = [];
      const where: string[] = [];
      if (request.query.action?.trim()) {
        values.push(request.query.action.trim());
        where.push(`a.action=$${values.length}`);
      }
      if (request.query.actorId) {
        values.push(request.query.actorId);
        where.push(`a.actor_id=$${values.length}`);
      }
      if (request.query.q?.trim()) {
        values.push(`%${request.query.q.trim().replace(/[\\%_]/g, '\\$&')}%`);
        where.push(`(a.action ILIKE $${values.length} ESCAPE '\\' OR
          COALESCE(u.name,'System') ILIKE $${values.length} ESCAPE '\\' OR
          COALESCE(u.email,'') ILIKE $${values.length} ESCAPE '\\' OR
          a.entity_id::text ILIKE $${values.length} ESCAPE '\\')`);
      }
      const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const count = await pool.query<{ total: string }>(
        `SELECT count(*)::text AS total FROM identity_audit_log a
          LEFT JOIN identity_users u ON u.id=a.actor_id ${clause}`,
        values,
      );
      values.push(request.query.limit ?? 50, request.query.offset ?? 0);
      const rows = await pool.query<Record<string, unknown>>(
        `SELECT a.id,a.action,a.entity_id,a.request_id,a.metadata,a.created_at,
            u.id AS actor_id,u.name AS actor_name,u.email AS actor_email,u.role AS actor_role
           FROM identity_audit_log a LEFT JOIN identity_users u ON u.id=a.actor_id
           ${clause} ORDER BY a.created_at DESC,a.id DESC
           LIMIT $${values.length - 1} OFFSET $${values.length}`,
        values,
      );
      return reply.header('Cache-Control', 'no-store').send({
        total: Number(count.rows[0].total),
        items: rows.rows.map((row) => ({
          id: row.id,
          action: row.action,
          entityId: row.entity_id,
          requestId: row.request_id,
          metadata: row.metadata,
          createdAt: row.created_at,
          actor: row.actor_id
            ? {
                id: row.actor_id,
                name: row.actor_name,
                email: row.actor_email,
                role: row.actor_role,
              }
            : null,
        })),
      });
    },
  );
}
