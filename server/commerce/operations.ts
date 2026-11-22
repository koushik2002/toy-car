import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';

const managers = ['admin', 'super_admin'] as const;
// Orders that represent real, kept revenue. Pending, cancelled and refunded orders are excluded.
const earning = "('paid','processing','shipped','out_for_delivery','delivered')";

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}
const like = (value: string) => `%${value.trim().replace(/[\\%_]/g, '\\$&')}%`;

export async function registerOperationsRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
) {
  app.get('/api/admin/dashboard', { schema: { tags: ['Admin'] } }, async (request, reply) => {
    if (!(await requireIdentityRole(pool, request, reply, auth, [...managers]))) return reply;
    // Day boundaries follow the shop's India business day, not the server's UTC clock.
    const totals = await pool.query<{
      today_orders: number;
      online_revenue: number;
      online_orders: number;
      offline_revenue_today: number;
      offline_bills_today: number;
      low_stock: number;
      pending_shipments: number;
      failed_tally: number;
      failed_notifications: number;
      open_requests: number;
      customers: number;
    }>(`SELECT
      (SELECT count(*) FROM commerce_orders WHERE channel='online' AND status IN ${earning}
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date)::integer AS today_orders,
      (SELECT COALESCE(sum(total_paise),0) FROM commerce_orders WHERE channel='online' AND status IN ${earning})::bigint AS online_revenue,
      (SELECT count(*) FROM commerce_orders WHERE channel='online' AND status IN ${earning})::integer AS online_orders,
      (SELECT COALESCE(sum(total_paise),0) FROM billing_invoices WHERE channel='offline'
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date)::bigint AS offline_revenue_today,
      (SELECT count(*) FROM billing_invoices WHERE channel='offline'
        AND (created_at AT TIME ZONE 'Asia/Kolkata')::date=(now() AT TIME ZONE 'Asia/Kolkata')::date)::integer AS offline_bills_today,
      (SELECT count(*) FROM catalogue_products WHERE published_at IS NOT NULL AND available<=low_stock_threshold)::integer AS low_stock,
      (SELECT count(*) FROM commerce_orders WHERE channel='online' AND status IN ('paid','processing'))::integer AS pending_shipments,
      (SELECT count(*) FROM billing_tally_jobs WHERE status='failed')::integer AS failed_tally,
      (SELECT count(*) FROM commerce_notification_outbox WHERE status='failed')::integer AS failed_notifications,
      (SELECT count(*) FROM commerce_order_requests WHERE status='open')::integer AS open_requests,
      (SELECT count(*) FROM identity_users WHERE role='customer')::integer AS customers`);
    const daily = await pool.query<{ day: string; orders: number; revenue: number }>(
      `SELECT to_char(d.day,'YYYY-MM-DD') AS day,
          count(o.id)::integer AS orders, COALESCE(sum(o.total_paise),0)::bigint AS revenue
         FROM generate_series((now() AT TIME ZONE 'Asia/Kolkata')::date - 29,
                              (now() AT TIME ZONE 'Asia/Kolkata')::date, interval '1 day') AS d(day)
         LEFT JOIN commerce_orders o ON o.channel='online' AND o.status IN ${earning}
          AND (o.created_at AT TIME ZONE 'Asia/Kolkata')::date=d.day::date
        GROUP BY d.day ORDER BY d.day`,
    );
    const brands = await pool.query<{ brand: string; revenue: number }>(
      `SELECT COALESCE(p.brand,'Archived') AS brand, sum(i.line_total_paise)::bigint AS revenue
         FROM commerce_order_items i JOIN commerce_orders o ON o.id=i.order_id
         LEFT JOIN catalogue_products p ON p.id=i.product_id
        WHERE o.status IN ${earning}
        GROUP BY 1 ORDER BY 2 DESC LIMIT 12`,
    );
    const latest = await pool.query<Record<string, unknown>>(
      `SELECT o.id,o.order_number,o.status,o.total_paise,o.created_at,u.name AS customer_name
         FROM commerce_orders o LEFT JOIN identity_users u ON u.id=o.customer_id
        WHERE o.channel='online' AND o.status<>'pending_payment'
        ORDER BY o.created_at DESC,o.id DESC LIMIT 6`,
    );
    const t = totals.rows[0];
    return reply.header('Cache-Control', 'no-store').send({
      todayOrders: t.today_orders,
      onlineRevenuePaise: Number(t.online_revenue),
      averageOrderPaise: t.online_orders
        ? Math.round(Number(t.online_revenue) / t.online_orders)
        : 0,
      offlineRevenueTodayPaise: Number(t.offline_revenue_today),
      offlineBillsToday: t.offline_bills_today,
      lowStock: t.low_stock,
      pendingShipments: t.pending_shipments,
      failedTallyJobs: t.failed_tally,
      failedNotifications: t.failed_notifications,
      openRequests: t.open_requests,
      customers: t.customers,
      daily: daily.rows.map((row) => ({
        day: row.day,
        orders: row.orders,
        revenuePaise: Number(row.revenue),
      })),
      brandSales: brands.rows.map((row) => ({
        brand: row.brand,
        revenuePaise: Number(row.revenue),
      })),
      latestOrders: latest.rows.map((row) => ({
        id: row.id,
        orderNumber: row.order_number,
        status: row.status,
        totalPaise: row.total_paise,
        createdAt: row.created_at,
        customerName: row.customer_name,
      })),
    });
  });

  app.get<{ Querystring: { q?: string; offset?: number } }>(
    '/api/admin/customers',
    {
      schema: {
        tags: ['Admin'],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            q: { type: 'string', maxLength: 100 },
            offset: { type: 'integer', minimum: 0, maximum: 100000 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...managers]))) return reply;
      const values: unknown[] = [];
      let filter = '';
      if (request.query.q?.trim()) {
        values.push(like(request.query.q));
        filter = `AND (u.name ILIKE $1 ESCAPE '\\' OR u.email ILIKE $1 ESCAPE '\\' OR u.phone ILIKE $1 ESCAPE '\\')`;
      }
      values.push(request.query.offset ?? 0);
      const rows = await pool.query<Record<string, unknown>>(
        `SELECT u.id,u.name,u.email,u.phone,u.created_at,u.email_verified_at,
            (SELECT count(*) FROM commerce_orders o WHERE o.customer_id=u.id AND o.status IN ${earning})::integer AS orders,
            (SELECT COALESCE(sum(total_paise),0) FROM commerce_orders o WHERE o.customer_id=u.id AND o.status IN ${earning})::bigint AS lifetime,
            (SELECT a.city FROM customer_addresses a WHERE a.customer_id=u.id ORDER BY a.is_default DESC,a.created_at LIMIT 1) AS city
           FROM identity_users u WHERE u.role='customer' ${filter}
          ORDER BY u.created_at DESC,u.id DESC LIMIT 100 OFFSET $${values.length}`,
        values,
      );
      return reply.header('Cache-Control', 'no-store').send({
        items: rows.rows.map((row) => ({
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          city: row.city || '',
          verified: !!row.email_verified_at,
          joinedAt: row.created_at,
          orders: row.orders,
          lifetimePaise: Number(row.lifetime),
        })),
      });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/admin/customers/:id',
    {
      schema: {
        tags: ['Admin'],
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string', format: 'uuid' } },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...managers]))) return reply;
      const user = await pool.query<Record<string, unknown>>(
        `SELECT id,name,email,phone,created_at,
            (SELECT COALESCE(sum(points),0) FROM commerce_loyalty_entries WHERE customer_id=u.id)::integer AS points,
            (SELECT COALESCE(sum(amount_paise),0) FROM commerce_wallet_entries WHERE customer_id=u.id)::integer AS wallet
           FROM identity_users u WHERE id=$1 AND role='customer'`,
        [request.params.id],
      );
      if (!user.rowCount) return fail(reply, 404, 'CUSTOMER_NOT_FOUND', 'Customer not found.');
      const orders = await pool.query<Record<string, unknown>>(
        `SELECT id,order_number,status,total_paise,created_at FROM commerce_orders
          WHERE customer_id=$1 AND channel='online' ORDER BY created_at DESC LIMIT 100`,
        [request.params.id],
      );
      const addresses = await pool.query<Record<string, unknown>>(
        `SELECT line1,line2,city,state,postal_code,is_default FROM customer_addresses
          WHERE customer_id=$1 ORDER BY is_default DESC,created_at`,
        [request.params.id],
      );
      const row = user.rows[0];
      return reply.header('Cache-Control', 'no-store').send({
        customer: {
          id: row.id,
          name: row.name,
          email: row.email,
          phone: row.phone,
          joinedAt: row.created_at,
          loyaltyPoints: row.points,
          walletPaise: row.wallet,
        },
        orders: orders.rows.map((order) => ({
          id: order.id,
          orderNumber: order.order_number,
          status: order.status,
          totalPaise: order.total_paise,
          createdAt: order.created_at,
        })),
        addresses: addresses.rows.map((address) => ({
          line1: address.line1,
          line2: address.line2,
          city: address.city,
          state: address.state,
          postalCode: address.postal_code,
          isDefault: address.is_default,
        })),
      });
    },
  );

  app.get<{ Querystring: { q?: string; productId?: string; offset?: number } }>(
    '/api/admin/inventory/movements',
    {
      schema: {
        tags: ['Admin catalogue'],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            q: { type: 'string', maxLength: 100 },
            productId: { type: 'string', format: 'uuid' },
            offset: { type: 'integer', minimum: 0, maximum: 100000 },
          },
        },
      },
    },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, [...managers]))) return reply;
      const values: unknown[] = [];
      const where: string[] = [];
      if (request.query.productId) {
        values.push(request.query.productId);
        where.push(`m.product_id=$${values.length}`);
      }
      if (request.query.q?.trim()) {
        values.push(like(request.query.q));
        where.push(`(p.sku ILIKE $${values.length} ESCAPE '\\' OR p.name ILIKE $${values.length} ESCAPE '\\'
          OR m.reason ILIKE $${values.length} ESCAPE '\\')`);
      }
      values.push(request.query.offset ?? 0);
      const rows = await pool.query<Record<string, unknown>>(
        `SELECT m.id,m.delta,m.after_available,m.reason,m.created_at,p.id AS product_id,p.sku,p.name,
            u.name AS actor_name
           FROM inventory_movements m JOIN catalogue_products p ON p.id=m.product_id
           LEFT JOIN identity_users u ON u.id=m.actor_id
           ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY m.created_at DESC,m.id DESC LIMIT 200 OFFSET $${values.length}`,
        values,
      );
      return reply.header('Cache-Control', 'no-store').send({
        items: rows.rows.map((row) => ({
          id: row.id,
          productId: row.product_id,
          sku: row.sku,
          name: row.name,
          delta: row.delta,
          before: Number(row.after_available) - Number(row.delta),
          after: row.after_available,
          reason: row.reason,
          actor: row.actor_name || 'System',
          at: row.created_at,
        })),
      });
    },
  );
}
