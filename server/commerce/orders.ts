import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';
import { issueFullStoreCreditRefund } from './refund-service.js';
import { invoiceHtml } from '../billing/routes.js';

/** Customers may ask for a return this many days after delivery. Pending client confirmation. */
export const RETURN_WINDOW_DAYS = 7;

const idParams = {
  type: 'object',
  required: ['id'],
  properties: {
    id: { type: 'string', format: 'uuid' },
  },
} as const;
const transitions: Record<string, string> = {
  paid: 'processing',
  processing: 'shipped',
  shipped: 'out_for_delivery',
  out_for_delivery: 'delivered',
};

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

// First photo and item count are folded into list rows so order cards can show thumbnails.
const summaryColumns = `o.*,
  u.name AS customer_name, u.email AS customer_email,
  COALESCE((SELECT sum(i.quantity) FROM commerce_order_items i WHERE i.order_id=o.id),0)::integer AS item_count,
  ARRAY(SELECT img.url FROM commerce_order_items i
    JOIN catalogue_product_images img ON img.product_id=i.product_id AND img.slot=1
    WHERE i.order_id=o.id ORDER BY i.id LIMIT 3) AS preview_images,
  (SELECT i.name FROM commerce_order_items i WHERE i.order_id=o.id ORDER BY i.id LIMIT 1) AS first_item_name,
  (SELECT jsonb_build_object('kind',r.kind,'status',r.status) FROM commerce_order_requests r
    WHERE r.order_id=o.id ORDER BY r.created_at DESC LIMIT 1) AS latest_request`;

function summary(row: Record<string, unknown>) {
  const address = (row.address_snapshot || {}) as Record<string, string>;
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    channel: row.channel,
    subtotalPaise: row.subtotal_paise,
    shippingPaise: row.shipping_paise,
    taxPaise: row.tax_paise,
    discountPaise: row.discount_paise,
    totalPaise: row.total_paise,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    deliveredAt: row.delivered_at,
    courier: row.courier,
    trackingNumber: row.tracking_number,
    customerName: row.customer_name ?? null,
    customerEmail: row.customer_email ?? null,
    city: address.city || '',
    itemCount: row.item_count ?? 0,
    firstItemName: row.first_item_name ?? '',
    previewImages: row.preview_images ?? [],
    latestRequest: row.latest_request ?? null,
  };
}

async function detail(pool: Pool, id: string, customerId?: string) {
  const order = await pool.query<Record<string, unknown>>(
    `SELECT ${summaryColumns} FROM commerce_orders o
       LEFT JOIN identity_users u ON u.id=o.customer_id
      WHERE o.id=$1 ${customerId ? 'AND o.customer_id=$2' : ''}`,
    customerId ? [id, customerId] : [id],
  );
  if (!order.rowCount) return null;
  const row = order.rows[0];
  const items = await pool.query(
    `SELECT i.product_id,i.sku,i.name,i.quantity,i.unit_price_paise,i.line_total_paise,
       p.brand,p.scale,
       (SELECT img.url FROM catalogue_product_images img
         WHERE img.product_id=i.product_id ORDER BY img.slot LIMIT 1) AS image
     FROM commerce_order_items i LEFT JOIN catalogue_products p ON p.id=i.product_id
     WHERE i.order_id=$1 ORDER BY i.id`,
    [id],
  );
  const events = await pool.query(
    `SELECT status,note,created_at FROM commerce_order_events
    WHERE order_id=$1 ORDER BY created_at,id`,
    [id],
  );
  const requests = await pool.query(
    `SELECT id,kind,reason,status,refund_preference,resolution_note,created_at,resolved_at
       FROM commerce_order_requests WHERE order_id=$1 ORDER BY created_at DESC`,
    [id],
  );
  const invoice = await pool.query<{ id: string; invoice_number: string }>(
    'SELECT id,invoice_number FROM billing_invoices WHERE order_id=$1',
    [id],
  );
  const deliveredAt = row.delivered_at as Date | null;
  return {
    ...summary(row),
    address: row.address_snapshot,
    deliveryRecipient: row.delivery_recipient,
    voucherDiscountPaise: row.voucher_discount_paise ?? 0,
    walletAppliedPaise: row.wallet_applied_paise ?? 0,
    loyaltyAppliedPaise: row.loyalty_applied_paise ?? 0,
    canCancel: row.channel === 'online' && row.status === 'paid',
    canReturn:
      row.status === 'delivered' &&
      !!deliveredAt &&
      Date.now() - new Date(deliveredAt).getTime() <= RETURN_WINDOW_DAYS * 86400000,
    returnWindowDays: RETURN_WINDOW_DAYS,
    invoice: invoice.rows[0]
      ? { id: invoice.rows[0].id, invoiceNumber: invoice.rows[0].invoice_number }
      : null,
    items: items.rows.map((item) => ({
      productId: item.product_id,
      sku: item.sku,
      name: item.name,
      brand: item.brand ?? '',
      scale: item.scale ?? '',
      image: item.image ?? null,
      quantity: item.quantity,
      unitPricePaise: item.unit_price_paise,
      lineTotalPaise: item.line_total_paise,
    })),
    timeline: events.rows.map((event) => ({
      status: event.status,
      note: event.note,
      at: event.created_at,
    })),
    requests: requests.rows.map((request) => ({
      id: request.id,
      kind: request.kind,
      reason: request.reason,
      status: request.status,
      refundPreference: request.refund_preference,
      resolutionNote: request.resolution_note,
      createdAt: request.created_at,
      resolvedAt: request.resolved_at,
    })),
  };
}

export async function registerOrderRoutes(app: FastifyInstance, pool: Pool, auth: IdentityConfig) {
  app.get('/api/orders', { schema: { tags: ['Orders'] } }, async (request, reply) => {
    const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
    if (!session) return reply;
    const rows = await pool.query<Record<string, unknown>>(
      `SELECT ${summaryColumns} FROM commerce_orders o
         LEFT JOIN identity_users u ON u.id=o.customer_id
        WHERE o.customer_id=$1 AND o.channel='online'
        ORDER BY o.created_at DESC,o.id DESC LIMIT 100`,
      [session.user.id],
    );
    return reply.header('Cache-Control', 'no-store').send({ items: rows.rows.map(summary) });
  });

  app.get<{ Params: { id: string } }>(
    '/api/orders/:id',
    {
      schema: { tags: ['Orders'], params: idParams },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const order = await detail(pool, request.params.id, session.user.id);
      return order
        ? reply.header('Cache-Control', 'no-store').send({ order })
        : fail(reply, 404, 'ORDER_NOT_FOUND', 'Order not found.');
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/orders/:id/invoice',
    { schema: { tags: ['Orders'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const invoice = await pool.query<Record<string, unknown>>(
        `SELECT i.* FROM billing_invoices i JOIN commerce_orders o ON o.id=i.order_id
          WHERE i.order_id=$1 AND o.customer_id=$2`,
        [request.params.id, session.user.id],
      );
      if (!invoice.rowCount)
        return fail(reply, 404, 'INVOICE_NOT_FOUND', 'The invoice has not been issued yet.');
      const items = await pool.query(
        `SELECT product_id,sku,name,hsn,quantity,unit_price_paise,line_total_paise
           FROM billing_invoice_items WHERE invoice_id=$1 ORDER BY id`,
        [invoice.rows[0].id],
      );
      return reply
        .header('Cache-Control', 'no-store')
        .send({ invoice: { ...invoice.rows[0], items: items.rows } });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/orders/:id/invoice/download',
    { schema: { tags: ['Orders'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const invoice = await pool.query<Record<string, unknown>>(
        `SELECT i.* FROM billing_invoices i JOIN commerce_orders o ON o.id=i.order_id
          WHERE i.order_id=$1 AND o.customer_id=$2`,
        [request.params.id, session.user.id],
      );
      if (!invoice.rowCount)
        return fail(reply, 404, 'INVOICE_NOT_FOUND', 'The invoice has not been issued yet.');
      const items = await pool.query<Record<string, unknown>>(
        `SELECT product_id,sku,name,hsn,quantity,unit_price_paise,line_total_paise
           FROM billing_invoice_items WHERE invoice_id=$1 ORDER BY id`,
        [invoice.rows[0].id],
      );
      const detail = { ...invoice.rows[0], items: items.rows };
      const filename = String(invoice.rows[0].invoice_number).replace(/[^A-Za-z0-9-]/g, '_');
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', `attachment; filename="${filename}.html"`)
        .type('text/html; charset=utf-8')
        .send(invoiceHtml(detail));
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      kind: 'cancel' | 'return';
      reason: string;
      refundPreference?: 'source' | 'store_credit';
    };
  }>(
    '/api/orders/:id/requests',
    {
      schema: {
        tags: ['Orders'],
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'reason'],
          properties: {
            kind: { type: 'string', enum: ['cancel', 'return'] },
            reason: { type: 'string', minLength: 3, maxLength: 1000 },
            refundPreference: { type: 'string', enum: ['source', 'store_credit'] },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const { kind } = request.body;
      const reason = request.body.reason.trim();
      if (reason.length < 3)
        return fail(reply, 400, 'REASON_REQUIRED', 'Tell us briefly what went wrong.');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const order = await client.query<{ status: string; delivered_at: Date | null }>(
          `SELECT status,delivered_at FROM commerce_orders
            WHERE id=$1 AND customer_id=$2 AND channel='online' FOR UPDATE`,
          [request.params.id, session.user.id],
        );
        if (!order.rowCount) {
          await client.query('ROLLBACK');
          return fail(reply, 404, 'ORDER_NOT_FOUND', 'Order not found.');
        }
        const { status, delivered_at: deliveredAt } = order.rows[0];
        const allowed =
          kind === 'cancel'
            ? status === 'paid'
            : status === 'delivered' &&
              !!deliveredAt &&
              Date.now() - deliveredAt.getTime() <= RETURN_WINDOW_DAYS * 86400000;
        if (!allowed) {
          await client.query('ROLLBACK');
          return fail(
            reply,
            409,
            'REQUEST_NOT_ALLOWED',
            kind === 'cancel'
              ? 'This order is already being prepared, so it can no longer be cancelled online.'
              : `Returns can be requested within ${RETURN_WINDOW_DAYS} days of delivery.`,
          );
        }
        const id = randomUUID();
        await client.query(
          `INSERT INTO commerce_order_requests
            (id,order_id,customer_id,kind,reason,refund_preference)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [
            id,
            request.params.id,
            session.user.id,
            kind,
            reason,
            request.body.refundPreference ?? 'source',
          ],
        );
        await client.query(
          `INSERT INTO commerce_order_events(id,order_id,status,note,actor_id)
           VALUES($1,$2,$3,$4,$5)`,
          [
            randomUUID(),
            request.params.id,
            kind === 'cancel' ? 'cancel_requested' : 'return_requested',
            reason,
            session.user.id,
          ],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505')
          return fail(
            reply,
            409,
            'REQUEST_OPEN',
            'A request for this order is already being reviewed.',
          );
        throw error;
      } finally {
        client.release();
      }
      return reply.code(201).send({ order: await detail(pool, request.params.id) });
    },
  );

  app.get<{ Querystring: { status?: string; q?: string; request?: 'open'; offset?: number } }>(
    '/api/admin/orders',
    {
      schema: {
        tags: ['Admin orders'],
        querystring: {
          type: 'object',
          additionalProperties: false,
          properties: {
            status: {
              type: 'string',
              enum: [
                'pending_payment',
                'paid',
                'processing',
                'shipped',
                'out_for_delivery',
                'delivered',
                'cancelled',
                'refund_pending',
                'refunded',
              ],
            },
            q: { type: 'string', maxLength: 100 },
            request: { type: 'string', enum: ['open'] },
            offset: { type: 'integer', minimum: 0, maximum: 100000 },
          },
        },
      },
    },
    async (request, reply) => {
      if (
        !(await requireIdentityRole(pool, request, reply, auth, ['staff', 'admin', 'super_admin']))
      )
        return reply;
      const values: unknown[] = [];
      const where = ["o.channel='online'"];
      if (request.query.status) {
        values.push(request.query.status);
        where.push(`o.status=$${values.length}`);
      }
      if (request.query.q?.trim()) {
        values.push(`%${request.query.q.trim().replace(/[\\%_]/g, '\\$&')}%`);
        where.push(`(o.order_number ILIKE $${values.length} ESCAPE '\\'
          OR u.name ILIKE $${values.length} ESCAPE '\\' OR u.email ILIKE $${values.length} ESCAPE '\\'
          OR o.tracking_number ILIKE $${values.length} ESCAPE '\\')`);
      }
      if (request.query.request === 'open')
        where.push(
          "EXISTS (SELECT 1 FROM commerce_order_requests r WHERE r.order_id=o.id AND r.status='open')",
        );
      values.push(request.query.offset ?? 0);
      const rows = await pool.query<Record<string, unknown>>(
        `SELECT ${summaryColumns} FROM commerce_orders o
           LEFT JOIN identity_users u ON u.id=o.customer_id
          WHERE ${where.join(' AND ')}
          ORDER BY o.created_at DESC,o.id DESC LIMIT 100 OFFSET $${values.length}`,
        values,
      );
      return reply.header('Cache-Control', 'no-store').send({ items: rows.rows.map(summary) });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/admin/orders/:id',
    {
      schema: { tags: ['Admin orders'], params: idParams },
    },
    async (request, reply) => {
      if (
        !(await requireIdentityRole(pool, request, reply, auth, ['staff', 'admin', 'super_admin']))
      )
        return reply;
      const order = await detail(pool, request.params.id);
      return order
        ? reply.header('Cache-Control', 'no-store').send({ order })
        : fail(reply, 404, 'ORDER_NOT_FOUND', 'Order not found.');
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      status: 'processing' | 'shipped' | 'out_for_delivery' | 'delivered';
      note?: string;
      courier?: string;
      trackingNumber?: string;
      recipient?: string;
      idempotencyKey: string;
    };
  }>(
    '/api/admin/orders/:id/status',
    {
      schema: {
        tags: ['Admin orders'],
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['status', 'idempotencyKey'],
          properties: {
            status: {
              type: 'string',
              enum: ['processing', 'shipped', 'out_for_delivery', 'delivered'],
            },
            note: { type: 'string', maxLength: 500 },
            courier: { type: 'string', maxLength: 100 },
            trackingNumber: { type: 'string', maxLength: 100 },
            recipient: { type: 'string', maxLength: 120 },
            idempotencyKey: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'staff',
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      const { status, idempotencyKey } = request.body;
      if (session.user.role === 'staff' && status !== 'out_for_delivery' && status !== 'delivered')
        return fail(reply, 403, 'FORBIDDEN', 'Staff can update the final delivery steps only.');
      const client = await pool.connect();
      let result: 'missing' | 'conflict' | 'invalid' | 'blocked' | 'existing' | 'updated';
      try {
        await client.query('BEGIN');
        const order = await client.query<{ status: string; channel: string }>(
          'SELECT status,channel FROM commerce_orders WHERE id=$1 FOR UPDATE',
          [request.params.id],
        );
        if (!order.rowCount || order.rows[0].channel !== 'online') result = 'missing';
        else {
          const prior = await client.query<{ order_id: string; status: string }>(
            'SELECT order_id,status FROM commerce_order_events WHERE source_key=$1',
            [idempotencyKey],
          );
          const cancelPending = await client.query(
            `SELECT 1 FROM commerce_order_requests
              WHERE order_id=$1 AND kind='cancel' AND status IN ('open','approved')`,
            [request.params.id],
          );
          if (prior.rowCount)
            result =
              prior.rows[0].order_id === request.params.id && prior.rows[0].status === status
                ? 'existing'
                : 'conflict';
          else if (transitions[order.rows[0].status] !== status) result = 'invalid';
          else if (cancelPending.rowCount && status !== 'delivered') result = 'blocked';
          else {
            const courier = request.body.courier?.trim() || '';
            const tracking = request.body.trackingNumber?.trim() || '';
            const recipient = request.body.recipient?.trim() || '';
            await client.query(
              `UPDATE commerce_orders SET status=$2,updated_at=now(),
            delivered_at=CASE WHEN $2='delivered' THEN now() ELSE delivered_at END,
            delivered_by=CASE WHEN $2='delivered' THEN $3::uuid ELSE delivered_by END,
            out_for_delivery_at=CASE WHEN $2='out_for_delivery' THEN now() ELSE out_for_delivery_at END,
            out_for_delivery_by=CASE WHEN $2='out_for_delivery' THEN $3::uuid ELSE out_for_delivery_by END,
            courier=CASE WHEN $2='shipped' THEN $4 ELSE courier END,
            tracking_number=CASE WHEN $2='shipped' THEN $5 ELSE tracking_number END,
            delivery_recipient=CASE WHEN $2='delivered' THEN $6 ELSE delivery_recipient END
            WHERE id=$1`,
              [request.params.id, status, session.user.id, courier, tracking, recipient],
            );
            const autoNote =
              status === 'shipped' && (courier || tracking)
                ? [courier, tracking && `Tracking ${tracking}`].filter(Boolean).join(' · ')
                : status === 'delivered' && recipient
                  ? `Received by ${recipient}`
                  : '';
            await client.query(
              `INSERT INTO commerce_order_events(id,order_id,status,note,actor_id,source_key)
            VALUES($1,$2,$3,$4,$5,$6)`,
              [
                randomUUID(),
                request.params.id,
                status,
                request.body.note?.trim() || autoNote,
                session.user.id,
                idempotencyKey,
              ],
            );
            if (status === 'shipped' || status === 'delivered')
              await client.query(
                `INSERT INTO commerce_notification_outbox(id,order_id,kind)
                 VALUES($1,$2,$3) ON CONFLICT (order_id,kind) DO NOTHING`,
                [
                  randomUUID(),
                  request.params.id,
                  status === 'shipped' ? 'order_shipped' : 'order_delivered',
                ],
              );
            await client.query(
              `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
            VALUES($1,$2,'order.status_changed',$3,$4)`,
              [randomUUID(), session.user.id, request.params.id, request.id],
            );
            result = 'updated';
          }
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
      if (result === 'missing') return fail(reply, 404, 'ORDER_NOT_FOUND', 'Order not found.');
      if (result === 'conflict')
        return fail(
          reply,
          409,
          'IDEMPOTENCY_CONFLICT',
          'This request key was used for a different change.',
        );
      if (result === 'invalid')
        return fail(reply, 409, 'INVALID_TRANSITION', 'This order is not ready for that status.');
      if (result === 'blocked')
        return fail(
          reply,
          409,
          'CANCELLATION_PENDING',
          'The customer asked to cancel this order. Resolve the request before shipping.',
        );
      return { status: result, order: await detail(pool, request.params.id) };
    },
  );

  app.post<{
    Params: { id: string };
    Body: { decision: 'approved' | 'rejected'; note?: string };
  }>(
    '/api/admin/order-requests/:id/resolve',
    {
      schema: {
        tags: ['Admin orders'],
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['decision'],
          properties: {
            decision: { type: 'string', enum: ['approved', 'rejected'] },
            note: { type: 'string', maxLength: 1000 },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      const note = request.body.note?.trim() || '';
      const client = await pool.connect();
      let orderId: string | undefined;
      try {
        await client.query('BEGIN');
        const current = await client.query<{
          order_id: string;
          customer_id: string;
          kind: 'cancel' | 'return';
          refund_preference: 'source' | 'store_credit';
          total_paise: number;
        }>(
          `SELECT r.order_id,r.customer_id,r.kind,r.refund_preference,o.total_paise
             FROM commerce_order_requests r JOIN commerce_orders o ON o.id=r.order_id
            WHERE r.id=$1 AND r.status='open' FOR UPDATE OF r,o`,
          [request.params.id],
        );
        if (!current.rowCount) {
          await client.query('ROLLBACK');
          return fail(reply, 404, 'REQUEST_NOT_FOUND', 'This request is not open any more.');
        }
        const row = current.rows[0];
        orderId = row.order_id;
        await client.query(
          `UPDATE commerce_order_requests SET status=$2,resolution_note=$3,resolved_by=$4,
             resolved_at=now() WHERE id=$1`,
          [request.params.id, request.body.decision, note, session.user.id],
        );
        if (request.body.decision === 'approved') {
          if (row.refund_preference === 'store_credit')
            await issueFullStoreCreditRefund(client, {
              orderId: row.order_id,
              customerId: row.customer_id,
              amountPaise: row.total_paise,
              reason: note || 'Approved customer request',
              idempotencyKey: request.params.id,
              actorId: session.user.id,
              restock: row.kind === 'cancel',
            });
          else
            await client.query(
              "UPDATE commerce_orders SET status='refund_pending',updated_at=now() WHERE id=$1",
              [row.order_id],
            );
        }
        await client.query(
          `INSERT INTO commerce_order_events(id,order_id,status,note,actor_id,source_key)
           VALUES($1,$2,$3,$4,$5,$6)`,
          [
            randomUUID(),
            row.order_id,
            `${row.kind}_${request.body.decision}`,
            note ||
              (request.body.decision === 'approved'
                ? 'Approved. Refund processing started.'
                : 'Request declined.'),
            session.user.id,
            `request:${request.params.id}:${request.body.decision}`,
          ],
        );
        await client.query(
          `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id,metadata)
           VALUES($1,$2,'order.request_resolved',$3,$4,$5)`,
          [
            randomUUID(),
            session.user.id,
            request.params.id,
            request.id,
            JSON.stringify({
              decision: request.body.decision,
              refundPreference: row.refund_preference,
            }),
          ],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505')
          return fail(
            reply,
            409,
            'REFUND_ALREADY_PROCESSED',
            'This request refund was already processed.',
          );
        throw error;
      } finally {
        client.release();
      }
      return { order: await detail(pool, orderId!) };
    },
  );
}
