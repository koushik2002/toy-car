import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';
import type { ServerConfig } from '../config.js';

type SettingsRow = {
  id: string;
  legal_name: string;
  gstin: string | null;
  invoice_prefix: string;
  default_tax_bps: number;
  active: boolean;
  created_at: Date;
  activated_at: Date | null;
};

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

function connectorAllowed(authorization: string | undefined, secret: string | undefined) {
  if (!secret || !authorization?.startsWith('Bearer ')) return false;
  const received = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(secret);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

function exposeSettings(row: SettingsRow) {
  return {
    id: row.id,
    legalName: row.legal_name,
    gstin: row.gstin,
    invoicePrefix: row.invoice_prefix,
    defaultTaxBps: row.default_tax_bps,
    active: row.active,
    createdAt: row.created_at,
    activatedAt: row.activated_at,
  };
}

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
} as const;

async function invoiceDetail(pool: Pool | PoolClient, id: string) {
  const invoice = await pool.query<Record<string, unknown>>(
    'SELECT * FROM billing_invoices WHERE id=$1',
    [id],
  );
  if (!invoice.rowCount) return null;
  const items = await pool.query<Record<string, unknown>>(
    `SELECT i.product_id,i.sku,i.name,i.hsn,i.quantity,i.unit_price_paise,i.line_total_paise,
       COALESCE((SELECT json_agg(u.serial_code ORDER BY u.serial_code)
         FROM billing_invoice_item_units u WHERE u.invoice_item_id=i.id),'[]'::json) AS serial_codes
       FROM billing_invoice_items i WHERE i.invoice_id=$1 ORDER BY i.id`,
    [id],
  );
  const corrections = await pool.query<Record<string, unknown>>(
    `SELECT id,correction_number,kind,reason,amount_paise,created_by,created_at
       FROM billing_invoice_corrections WHERE invoice_id=$1 ORDER BY created_at,id`,
    [id],
  );
  return {
    ...invoice.rows[0],
    items: items.rows,
    corrections: corrections.rows,
  };
}

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

export function invoiceHtml(invoice: Record<string, unknown>) {
  const settings = invoice.settings_snapshot as Record<string, unknown>;
  const items = invoice.items as Record<string, unknown>[];
  const rows = items
    .map(
      (item) => `<tr><td>${escapeHtml(item.name)}<small>${escapeHtml(item.sku)}</small></td>
        <td>${escapeHtml(item.hsn || '—')}</td><td>${escapeHtml(item.quantity)}</td>
        <td>₹${(Number(item.unit_price_paise) / 100).toFixed(2)}</td>
        <td>₹${(Number(item.line_total_paise) / 100).toFixed(2)}</td></tr>`,
    )
    .join('');
  const money = (value: unknown) => `₹${(Number(value) / 100).toFixed(2)}`;
  const paymentWords: Record<string, string> = {
    cash: 'Cash',
    upi: 'UPI',
    card: 'Card',
    bank_transfer: 'Bank transfer',
    online: 'Paid online',
    test: 'Local test payment',
  };
  const payment = paymentWords[String(invoice.payment_method)] || invoice.payment_method;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(invoice.invoice_number)}</title>
<style>@page{size:A4;margin:14mm}body{font:13px Arial,sans-serif;color:#18212d;margin:0}header{display:flex;justify-content:space-between;border-bottom:2px solid;padding-bottom:16px}h1,h2,p{margin:4px 0}.customer{padding:20px 0}table{width:100%;border-collapse:collapse}th,td{padding:9px;border:1px solid #dbe0e6;text-align:left}th{background:#f2f4f7}small{display:block;color:#526072}.totals{width:320px;margin:20px 0 0 auto}.totals p{display:flex;justify-content:space-between}.grand{border-top:2px solid;padding-top:8px;font-size:17px}footer{text-align:center;margin-top:30px}@media print{button{display:none}}</style></head><body>
<header><div><h1>${escapeHtml(settings.legalName)}</h1><p>${settings.gstin ? `GSTIN: ${escapeHtml(settings.gstin)}` : 'GST not registered'}</p></div>
<div><h2>${settings.gstin ? 'TAX INVOICE' : 'INVOICE'}</h2><b>${escapeHtml(invoice.invoice_number)}</b><p>${escapeHtml(invoice.created_at)}</p><p>${invoice.channel === 'online' ? 'Online order' : 'Counter sale'}</p></div></header>
<section class="customer"><small>BILL TO</small><h2>${escapeHtml(invoice.customer_name)}</h2><p>${escapeHtml(invoice.customer_address)}</p><p>${escapeHtml([invoice.customer_phone, invoice.customer_email].filter(Boolean).join(' · '))}</p></section>
<table><thead><tr><th>Item / code</th><th>HSN</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr></thead><tbody>${rows}</tbody></table>
<section class="totals"><p><span>Subtotal</span><b>${money(invoice.subtotal_paise)}</b></p><p><span>Discount</span><b>−${money(invoice.discount_paise)}</b></p><p><span>Shipping</span><b>${money(invoice.shipping_paise)}</b></p><p><span>Tax</span><b>${money(invoice.tax_paise)}</b></p><p class="grand"><span>Total</span><b>${money(invoice.total_paise)}</b></p><p><span>Payment</span><b>${escapeHtml(payment)}</b></p></section>
<p>${escapeHtml(invoice.note)}</p><footer>Thank you for collecting with Tiny Kars.<br><small>Issued invoices are immutable.</small></footer></body></html>`;
}

async function sellerOwnsInvoice(pool: Pool, invoiceId: string, sellerId: string) {
  const result = await pool.query(
    `SELECT 1 FROM billing_invoices
      WHERE id=$1 AND channel='offline' AND created_by=$2`,
    [invoiceId, sellerId],
  );
  return Boolean(result.rowCount);
}

function tallyPayload(invoice: Record<string, unknown>, exportReference: string) {
  const settings = invoice.settings_snapshot as Record<string, unknown>;
  return {
    format: 'tiny-kars-tally-v1',
    exportReference,
    sale: {
      invoiceNumber: invoice.invoice_number,
      issuedAt: invoice.created_at,
      channel: invoice.channel,
      paymentMethod: invoice.payment_method,
    },
    business: { legalName: settings.legalName, gstin: settings.gstin || null },
    customer: {
      name: invoice.customer_name,
      email: invoice.customer_email,
      phone: invoice.customer_phone,
      address: invoice.customer_address,
    },
    amounts: {
      subtotalPaise: invoice.subtotal_paise,
      discountPaise: invoice.discount_paise,
      shippingPaise: invoice.shipping_paise,
      taxPaise: invoice.tax_paise,
      totalPaise: invoice.total_paise,
      taxRateBps: settings.defaultTaxBps,
    },
    items: invoice.items,
  };
}

export async function registerBillingRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
  config: ServerConfig,
) {
  app.get(
    '/api/admin/billing-settings',
    { schema: { tags: ['Billing settings'] } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['super_admin']))) return reply;
      const result = await pool.query<SettingsRow>(
        'SELECT * FROM billing_settings ORDER BY created_at DESC,id DESC LIMIT 100',
      );
      return { items: result.rows.map(exposeSettings) };
    },
  );

  app.post<{
    Body: {
      legalName: string;
      gstin?: string | null;
      invoicePrefix: string;
      defaultTaxBps: number;
    };
  }>(
    '/api/admin/billing-settings',
    {
      schema: {
        tags: ['Billing settings'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['legalName', 'invoicePrefix', 'defaultTaxBps'],
          properties: {
            legalName: { type: 'string', minLength: 2, maxLength: 200 },
            gstin: {
              anyOf: [{ type: 'string', pattern: '^[0-9A-Za-z]{15}$' }, { type: 'null' }],
            },
            invoicePrefix: { type: 'string', pattern: '^[A-Za-z0-9-]{2,12}$' },
            defaultTaxBps: { type: 'integer', minimum: 0, maximum: 10000 },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const b = request.body;
      const result = await pool.query<SettingsRow>(
        `INSERT INTO billing_settings
          (id,legal_name,gstin,invoice_prefix,default_tax_bps,created_by)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [
          randomUUID(),
          b.legalName.trim(),
          b.gstin?.toUpperCase() || null,
          b.invoicePrefix.toUpperCase(),
          b.defaultTaxBps,
          session.user.id,
        ],
      );
      return reply.code(201).send({ settings: exposeSettings(result.rows[0]) });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/admin/billing-settings/:id/activate',
    { schema: { tags: ['Billing settings'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['super_admin']);
      if (!session) return reply;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SELECT pg_advisory_xact_lock(98511435)');
        const found = await client.query('SELECT 1 FROM billing_settings WHERE id=$1', [
          request.params.id,
        ]);
        if (!found.rowCount) {
          await client.query('ROLLBACK');
          return fail(reply, 404, 'SETTINGS_NOT_FOUND', 'Billing settings not found.');
        }
        await client.query('UPDATE billing_settings SET active=false WHERE active=true');
        const result = await client.query<SettingsRow>(
          'UPDATE billing_settings SET active=true,activated_at=now() WHERE id=$1 RETURNING *',
          [request.params.id],
        );
        await client.query('COMMIT');
        return { settings: exposeSettings(result.rows[0]) };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  );

  // Read-only view of the active rules so the billing desk can preview tax before issuing.
  app.get(
    '/api/billing/settings/active',
    { schema: { tags: ['Billing'] } },
    async (request, reply) => {
      if (
        !(await requireIdentityRole(pool, request, reply, auth, ['seller', 'admin', 'super_admin']))
      )
        return reply;
      const result = await pool.query<SettingsRow>(
        'SELECT * FROM billing_settings WHERE active=true',
      );
      return reply
        .header('Cache-Control', 'no-store')
        .send({ settings: result.rowCount ? exposeSettings(result.rows[0]) : null });
    },
  );

  app.get<{ Querystring: { q: string } }>(
    '/api/billing/products',
    {
      schema: {
        tags: ['Billing'],
        querystring: {
          type: 'object',
          additionalProperties: false,
          required: ['q'],
          properties: { q: { type: 'string', minLength: 1, maxLength: 100 } },
        },
      },
    },
    async (request, reply) => {
      if (
        !(await requireIdentityRole(pool, request, reply, auth, ['seller', 'admin', 'super_admin']))
      )
        return reply;
      const query = request.query.q.trim();
      const contains = `%${query.replace(/[\\%_]/g, '\\$&')}%`;
      const result = await pool.query(
        `SELECT id,sku,name,brand,series,price_paise,available,serial_tracking
           FROM catalogue_products
          WHERE published_at IS NOT NULL
            AND (sku ILIKE $1 ESCAPE '\\' OR name ILIKE $2 ESCAPE '\\')
          ORDER BY CASE WHEN upper(sku)=upper($3) THEN 0 ELSE 1 END,name,id LIMIT 12`,
        [contains, contains, query],
      );
      return reply.header('Cache-Control', 'private, no-store').send({
        items: result.rows.map((row) => ({
          id: row.id,
          sku: row.sku,
          barcode: row.sku,
          name: row.name,
          brand: row.brand,
          series: row.series,
          pricePaise: row.price_paise,
          available: row.available,
          serialTracking: row.serial_tracking,
        })),
      });
    },
  );

  app.get('/api/billing/invoices', { schema: { tags: ['Billing'] } }, async (request, reply) => {
    const session = await requireIdentityRole(pool, request, reply, auth, [
      'seller',
      'admin',
      'super_admin',
    ]);
    if (!session) return reply;
    const sellerFilter =
      session.user.role === 'seller' ? "WHERE created_by=$1 AND channel='offline'" : '';
    const values = session.user.role === 'seller' ? [session.user.id] : [];
    const result = await pool.query(
      `SELECT id,invoice_number,order_id,channel,customer_name,subtotal_paise,shipping_paise,
        discount_paise,tax_paise,total_paise,created_at
       FROM billing_invoices ${sellerFilter} ORDER BY created_at DESC,id DESC LIMIT 200`,
      values,
    );
    return reply.header('Cache-Control', 'no-store').send({ items: result.rows });
  });

  app.get(
    '/api/billing/eligible-orders',
    { schema: { tags: ['Billing'] } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['admin', 'super_admin'])))
        return reply;
      const result = await pool.query(
        `SELECT o.id,o.total_paise,o.status,o.created_at,u.name AS customer_name,u.email
           FROM commerce_orders o JOIN identity_users u ON u.id=o.customer_id
          WHERE o.channel='online' AND o.status IN ('paid','processing','shipped','out_for_delivery','delivered','refunded')
            AND NOT EXISTS (SELECT 1 FROM billing_invoices i WHERE i.order_id=o.id)
          ORDER BY o.created_at DESC,o.id DESC LIMIT 200`,
      );
      return reply.header('Cache-Control', 'no-store').send({ items: result.rows });
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/billing/invoices/:id',
    { schema: { tags: ['Billing'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'seller',
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      if (
        session.user.role === 'seller' &&
        !(await sellerOwnsInvoice(pool, request.params.id, session.user.id))
      )
        return fail(reply, 404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
      const invoice = await invoiceDetail(pool, request.params.id);
      return invoice
        ? reply.header('Cache-Control', 'no-store').send({ invoice })
        : fail(reply, 404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/billing/invoices/:id/download',
    { schema: { tags: ['Billing'], params: idParams } },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'seller',
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      if (
        session.user.role === 'seller' &&
        !(await sellerOwnsInvoice(pool, request.params.id, session.user.id))
      )
        return fail(reply, 404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
      const invoice = await invoiceDetail(pool, request.params.id);
      if (!invoice) return fail(reply, 404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
      const filename = String((invoice as Record<string, unknown>).invoice_number).replace(
        /[^A-Za-z0-9-]/g,
        '_',
      );
      return reply
        .header('Cache-Control', 'private, no-store')
        .header('Content-Disposition', `attachment; filename="${filename}.html"`)
        .type('text/html; charset=utf-8')
        .send(invoiceHtml(invoice));
    },
  );

  app.post<{
    Params: { id: string };
    Body: {
      kind: 'note' | 'credit_note' | 'void_notice';
      reason: string;
      amountPaise?: number;
      idempotencyKey: string;
    };
  }>(
    '/api/admin/billing/invoices/:id/corrections',
    {
      schema: {
        tags: ['Billing settings'],
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['kind', 'reason', 'idempotencyKey'],
          properties: {
            kind: { type: 'string', enum: ['note', 'credit_note', 'void_notice'] },
            reason: { type: 'string', minLength: 3, maxLength: 1000 },
            amountPaise: { type: 'integer', minimum: 0, maximum: 100000000 },
            idempotencyKey: { type: 'string', format: 'uuid' },
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
      const repeated = await pool.query<{ invoice_id: string } & Record<string, unknown>>(
        'SELECT * FROM billing_invoice_corrections WHERE idempotency_key=$1',
        [request.body.idempotencyKey],
      );
      if (repeated.rowCount) {
        if (repeated.rows[0].invoice_id !== request.params.id)
          return fail(
            reply,
            409,
            'CORRECTION_KEY_USED',
            'This correction submission key has already been used.',
          );
        return reply.send({ correction: repeated.rows[0] });
      }
      const invoice = await pool.query<{ invoice_number: string }>(
        'SELECT invoice_number FROM billing_invoices WHERE id=$1',
        [request.params.id],
      );
      if (!invoice.rowCount) return fail(reply, 404, 'INVOICE_NOT_FOUND', 'Invoice not found.');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const number = await client.query<{ value: string }>(
          `SELECT $1 || '-C' || lpad(nextval('billing_correction_number_seq')::text,4,'0') AS value`,
          [invoice.rows[0].invoice_number],
        );
        const result = await client.query(
          `INSERT INTO billing_invoice_corrections
            (id,idempotency_key,invoice_id,correction_number,kind,reason,amount_paise,created_by)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [
            randomUUID(),
            request.body.idempotencyKey,
            request.params.id,
            number.rows[0].value,
            request.body.kind,
            request.body.reason.trim(),
            request.body.amountPaise ?? 0,
            session.user.id,
          ],
        );
        await client.query(
          `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id,metadata)
           VALUES($1,$2,'invoice.correction_recorded',$3,$4,$5)`,
          [
            randomUUID(),
            session.user.id,
            request.params.id,
            request.id,
            JSON.stringify({
              correctionNumber: number.rows[0].value,
              kind: request.body.kind,
              amountPaise: request.body.amountPaise ?? 0,
            }),
          ],
        );
        await client.query('COMMIT');
        return reply.code(201).send({ correction: result.rows[0] });
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505') {
          const prior = await pool.query(
            'SELECT * FROM billing_invoice_corrections WHERE idempotency_key=$1',
            [request.body.idempotencyKey],
          );
          if (prior.rowCount) return reply.send({ correction: prior.rows[0] });
        }
        throw error;
      } finally {
        client.release();
      }
    },
  );

  app.post<{
    Body: {
      channel: 'online' | 'offline';
      orderId?: string;
      customerName?: string;
      customerEmail?: string;
      customerPhone?: string;
      customerAddress?: string;
      paymentMethod?: 'cash' | 'upi' | 'card' | 'bank_transfer';
      note?: string;
      shippingPaise?: number;
      discountPaise?: number;
      items?: {
        productId?: string;
        name?: string;
        unitPricePaise?: number;
        quantity: number;
        hsn?: string;
      }[];
      idempotencyKey: string;
    };
  }>(
    '/api/billing/invoices',
    {
      schema: {
        tags: ['Billing'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['channel', 'idempotencyKey'],
          properties: {
            channel: { type: 'string', enum: ['online', 'offline'] },
            orderId: { type: 'string', format: 'uuid' },
            customerName: { type: 'string', minLength: 2, maxLength: 200 },
            customerEmail: { type: 'string', maxLength: 320 },
            customerPhone: { type: 'string', maxLength: 30 },
            customerAddress: { type: 'string', maxLength: 500 },
            paymentMethod: { type: 'string', enum: ['cash', 'upi', 'card', 'bank_transfer'] },
            note: { type: 'string', maxLength: 500 },
            shippingPaise: { type: 'integer', minimum: 0, maximum: 10000000 },
            discountPaise: { type: 'integer', minimum: 0, maximum: 10000000 },
            idempotencyKey: { type: 'string', format: 'uuid' },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['quantity'],
                properties: {
                  productId: { type: 'string', format: 'uuid' },
                  name: { type: 'string', minLength: 2, maxLength: 200 },
                  unitPricePaise: { type: 'integer', minimum: 0, maximum: 10000000 },
                  quantity: { type: 'integer', minimum: 1, maximum: 100 },
                  hsn: { type: 'string', pattern: '^$|^[0-9]{4,8}$' },
                },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, [
        'seller',
        'admin',
        'super_admin',
      ]);
      if (!session) return reply;
      const b = request.body;
      if (session.user.role === 'seller' && b.channel !== 'offline')
        return fail(reply, 403, 'FORBIDDEN', 'Sellers can issue counter-sale invoices only.');
      if (b.channel === 'online' && !b.orderId)
        return fail(reply, 400, 'ORDER_REQUIRED', 'Choose an online order.');
      const repeated = await pool.query<{ id: string; created_by: string }>(
        'SELECT id,created_by FROM billing_invoices WHERE idempotency_key=$1',
        [b.idempotencyKey],
      );
      if (repeated.rowCount) {
        if (session.user.role === 'seller' && repeated.rows[0].created_by !== session.user.id)
          return fail(reply, 409, 'INVOICE_EXISTS', 'This submission key has already been used.');
        return reply.send({ invoice: await invoiceDetail(pool, repeated.rows[0].id) });
      }
      const catalogueItems = (b.items || []).filter((item) => item.productId);
      const customItems = (b.items || []).filter((item) => !item.productId);
      // Sellers bill catalogue stock only; discounts and free-text items need an admin.
      const managerOnly = customItems.length > 0 || (b.discountPaise ?? 0) > 0;
      if (b.channel === 'offline' && managerOnly && session.user.role === 'seller')
        return fail(
          reply,
          403,
          'FORBIDDEN',
          'Only an admin can add a discount or an item that is not in the catalogue.',
        );
      if (customItems.some((item) => !item.name?.trim() || item.unitPricePaise === undefined))
        return fail(reply, 400, 'CUSTOM_ITEM_INVALID', 'Give each custom item a name and price.');
      if (
        b.channel === 'offline' &&
        (!b.customerName ||
          !b.items?.length ||
          new Set(catalogueItems.map((item) => item.productId)).size !== catalogueItems.length)
      )
        return fail(
          reply,
          400,
          'OFFLINE_DETAILS_REQUIRED',
          'Add the customer and each offline product once.',
        );
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const settings = await client.query<SettingsRow>(
          'SELECT * FROM billing_settings WHERE active=true FOR SHARE',
        );
        if (!settings.rowCount)
          throw Object.assign(new Error('Billing settings are not active.'), {
            httpStatus: 503,
            publicCode: 'BILLING_NOT_CONFIGURED',
          });
        const rule = settings.rows[0];
        const number = await client.query<{ value: string }>(
          `SELECT $1 || '-' || EXTRACT(YEAR FROM now())::integer || '-' ||
            lpad(nextval('billing_invoice_number_seq')::text,6,'0') AS value`,
          [rule.invoice_prefix],
        );
        const invoiceId = randomUUID();
        let orderId: string | null = null;
        let customerId: string | null = null;
        let customerName = b.customerName?.trim() || '';
        let customerEmail = b.customerEmail?.trim() || '';
        let customerPhone = b.customerPhone?.trim() || '';
        let customerAddress = b.customerAddress?.trim() || '';
        let subtotalPaise = 0;
        let shippingPaise = 0;
        let discountPaise = 0;
        let taxPaise = 0;
        let totalPaise = 0;
        let paymentMethod = b.paymentMethod || '';
        const lines: {
          orderItemId?: string;
          productId: string | null;
          sku: string;
          name: string;
          quantity: number;
          unitPricePaise: number;
          hsn?: string;
          units?: { id: string; serialCode: string }[];
        }[] = [];
        if (b.channel === 'online') {
          const order = await client.query<Record<string, unknown>>(
            `SELECT o.*,u.name AS customer_name,u.email AS customer_email
               FROM commerce_orders o JOIN identity_users u ON u.id=o.customer_id
              WHERE o.id=$1 AND o.channel='online' AND o.status IN
                ('paid','processing','shipped','out_for_delivery','delivered','refunded') FOR SHARE OF o`,
            [b.orderId],
          );
          if (!order.rowCount)
            throw Object.assign(new Error('Paid online order not found.'), {
              httpStatus: 404,
              publicCode: 'ORDER_NOT_FOUND',
            });
          const row = order.rows[0];
          orderId = String(row.id);
          customerId = String(row.customer_id);
          customerName = String(row.customer_name);
          customerEmail = String(row.customer_email);
          const address = row.address_snapshot as Record<string, unknown>;
          customerPhone = String(address?.phone || '');
          customerAddress = [
            address?.line1,
            address?.line2,
            address?.city,
            address?.state,
            address?.postalCode,
          ]
            .filter(Boolean)
            .join(', ');
          subtotalPaise = Number(row.subtotal_paise);
          shippingPaise = Number(row.shipping_paise);
          discountPaise = Number(row.discount_paise);
          taxPaise = Number(row.tax_paise);
          totalPaise = Number(row.total_paise);
          paymentMethod = String(row.gateway_payment_id || '').startsWith('test_pay_')
            ? 'test'
            : 'online';
          const orderItems = await client.query<{
            id: string;
            product_id: string;
            sku: string;
            name: string;
            quantity: number;
            unit_price_paise: number;
          }>('SELECT * FROM commerce_order_items WHERE order_id=$1 ORDER BY id', [orderId]);
          lines.push(
            ...orderItems.rows.map((item) => ({
              orderItemId: item.id,
              productId: item.product_id,
              sku: item.sku,
              name: item.name,
              quantity: item.quantity,
              unitPricePaise: item.unit_price_paise,
            })),
          );
        } else {
          const ids = catalogueItems.map((item) => item.productId!);
          const products = await client.query<{
            id: string;
            sku: string;
            name: string;
            price_paise: number;
            available: number;
            serial_tracking: boolean;
          }>(
            `SELECT id,sku,name,price_paise,available,serial_tracking
               FROM catalogue_products WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
            [ids],
          );
          if (products.rowCount !== ids.length)
            throw Object.assign(new Error('An offline product was not found.'), {
              httpStatus: 409,
              publicCode: 'PRODUCT_UNAVAILABLE',
            });
          const byId = new Map(products.rows.map((product) => [product.id, product]));
          for (const item of catalogueItems) {
            const product = byId.get(item.productId!)!;
            if (product.available < item.quantity)
              throw Object.assign(new Error(`${product.name} does not have enough stock.`), {
                httpStatus: 409,
                publicCode: 'INSUFFICIENT_STOCK',
              });
            lines.push({
              productId: product.id,
              sku: product.sku,
              name: product.name,
              quantity: item.quantity,
              unitPricePaise: product.price_paise,
              hsn: item.hsn || '',
              units: [],
            });
            subtotalPaise += product.price_paise * item.quantity;
            const updated = await client.query<{ available: number }>(
              'UPDATE catalogue_products SET available=available-$2,updated_at=now() WHERE id=$1 RETURNING available',
              [product.id, item.quantity],
            );
            await client.query(
              `INSERT INTO inventory_movements
                (id,product_id,delta,after_available,reason,source_key,actor_id)
               VALUES($1,$2,$3,$4,'Offline invoice sale',$5,$6)`,
              [
                randomUUID(),
                product.id,
                -item.quantity,
                updated.rows[0].available,
                `invoice:${invoiceId}:${product.id}`,
                session.user.id,
              ],
            );
            if (product.serial_tracking) {
              const sold = await client.query<{ id: string; serial_code: string }>(
                `UPDATE inventory_units SET state='sold',sold_at=now(),sale_reference=$2
                  WHERE id IN (SELECT id FROM inventory_units WHERE product_id=$1 AND state='available'
                    ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $3) RETURNING id,serial_code`,
                [product.id, number.rows[0].value, item.quantity],
              );
              if (sold.rowCount !== item.quantity)
                throw Object.assign(
                  new Error(`${product.name} serial inventory needs reconciliation.`),
                  {
                    httpStatus: 409,
                    publicCode: 'SERIAL_STOCK_MISMATCH',
                  },
                );
              lines[lines.length - 1].units = sold.rows.map((unit) => ({
                id: unit.id,
                serialCode: unit.serial_code,
              }));
            }
          }
          for (const item of customItems) {
            lines.push({
              productId: null,
              sku: 'CUSTOM',
              name: item.name!.trim(),
              quantity: item.quantity,
              unitPricePaise: item.unitPricePaise!,
              hsn: item.hsn || '',
            });
            subtotalPaise += item.unitPricePaise! * item.quantity;
          }
          shippingPaise = b.shippingPaise ?? 0;
          discountPaise = b.discountPaise ?? 0;
          if (discountPaise > subtotalPaise)
            throw Object.assign(new Error('The discount cannot be more than the items total.'), {
              httpStatus: 400,
              publicCode: 'DISCOUNT_TOO_LARGE',
            });
          // Tax applies to the discounted goods value; shipping is not taxed here.
          taxPaise = Math.floor(((subtotalPaise - discountPaise) * rule.default_tax_bps) / 10000);
          totalPaise = subtotalPaise + shippingPaise + taxPaise - discountPaise;
        }
        await client.query(
          `INSERT INTO billing_invoices
            (id,idempotency_key,invoice_number,order_id,customer_id,channel,customer_name,customer_email,
             customer_phone,subtotal_paise,shipping_paise,discount_paise,tax_paise,total_paise,
             settings_snapshot,created_by,customer_address,payment_method,note)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
          [
            invoiceId,
            b.idempotencyKey,
            number.rows[0].value,
            orderId,
            customerId,
            b.channel,
            customerName,
            customerEmail,
            customerPhone,
            subtotalPaise,
            shippingPaise,
            discountPaise,
            taxPaise,
            totalPaise,
            JSON.stringify(exposeSettings(rule)),
            session.user.id,
            customerAddress,
            paymentMethod,
            b.note?.trim() || '',
          ],
        );
        for (const line of lines) {
          const invoiceItemId = randomUUID();
          await client.query(
            `INSERT INTO billing_invoice_items
              (id,invoice_id,product_id,sku,name,quantity,unit_price_paise,line_total_paise,hsn)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              invoiceItemId,
              invoiceId,
              line.productId,
              line.sku,
              line.name,
              line.quantity,
              line.unitPricePaise,
              line.unitPricePaise * line.quantity,
              line.hsn || '',
            ],
          );
          if (line.orderItemId)
            await client.query(
              `INSERT INTO billing_invoice_item_units(invoice_item_id,unit_id,serial_code)
               SELECT $1,unit_id,serial_code FROM commerce_order_item_units WHERE order_item_id=$2`,
              [invoiceItemId, line.orderItemId],
            );
          for (const unit of line.units || [])
            await client.query(
              'INSERT INTO billing_invoice_item_units(invoice_item_id,unit_id,serial_code) VALUES($1,$2,$3)',
              [invoiceItemId, unit.id, unit.serialCode],
            );
        }
        await client.query('INSERT INTO billing_tally_jobs(id,invoice_id) VALUES($1,$2)', [
          randomUUID(),
          invoiceId,
        ]);
        await client.query(
          `INSERT INTO identity_audit_log(id,actor_id,action,entity_id,request_id)
           VALUES($1,$2,'invoice.issued',$3,$4)`,
          [randomUUID(), session.user.id, invoiceId, request.id],
        );
        await client.query('COMMIT');
        return reply.code(201).send({ invoice: await invoiceDetail(client, invoiceId) });
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505') {
          const prior = await pool.query<{ id: string; created_by: string }>(
            'SELECT id,created_by FROM billing_invoices WHERE idempotency_key=$1 OR order_id=$2',
            [b.idempotencyKey, b.orderId || null],
          );
          if (
            prior.rowCount &&
            session.user.role === 'seller' &&
            prior.rows[0].created_by !== session.user.id
          )
            return fail(reply, 409, 'INVOICE_EXISTS', 'This submission key has already been used.');
          const existing = prior.rowCount ? await invoiceDetail(pool, prior.rows[0].id) : null;
          if (existing) return reply.send({ invoice: existing });
          return fail(reply, 409, 'INVOICE_EXISTS', 'This invoice was already issued.');
        }
        const known = error as Error & { httpStatus?: number; publicCode?: string };
        if (known.httpStatus)
          return fail(reply, known.httpStatus, known.publicCode || 'BILLING_FAILED', known.message);
        request.log.error({ err: error }, 'Invoice creation failed');
        return fail(reply, 503, 'BILLING_UNAVAILABLE', 'Billing is temporarily unavailable.');
      } finally {
        client.release();
      }
    },
  );

  app.get('/api/admin/tally-jobs', { schema: { tags: ['Tally sync'] } }, async (request, reply) => {
    if (!(await requireIdentityRole(pool, request, reply, auth, ['admin', 'super_admin'])))
      return reply;
    const result = await pool.query(
      `SELECT j.*,i.invoice_number FROM billing_tally_jobs j
        JOIN billing_invoices i ON i.id=j.invoice_id
       ORDER BY j.created_at DESC,j.id DESC LIMIT 200`,
    );
    return { items: result.rows };
  });

  app.post<{ Params: { id: string } }>(
    '/api/admin/tally-jobs/:id/retry',
    { schema: { tags: ['Tally sync'], params: idParams } },
    async (request, reply) => {
      if (!(await requireIdentityRole(pool, request, reply, auth, ['admin', 'super_admin'])))
        return reply;
      const result = await pool.query(
        `UPDATE billing_tally_jobs SET status='pending',available_at=now(),last_error=NULL,
          lease_until=NULL,lease_owner=NULL WHERE id=$1 AND status='failed' RETURNING *`,
        [request.params.id],
      );
      return result.rowCount
        ? { job: result.rows[0] }
        : fail(reply, 409, 'JOB_NOT_RETRYABLE', 'This Tally job is not failed.');
    },
  );

  app.post(
    '/api/connectors/tally/claim',
    { schema: { tags: ['Tally connector'] } },
    async (request, reply) => {
      if (!config.tallyConnectorSecret)
        return fail(reply, 503, 'TALLY_NOT_CONFIGURED', 'Tally connector is not configured.');
      if (!connectorAllowed(request.headers.authorization, config.tallyConnectorSecret))
        return fail(reply, 401, 'CONNECTOR_UNAUTHORISED', 'Connector authentication failed.');
      const leaseToken = randomUUID();
      const claimed = await pool.query<{ id: string; invoice_id: string }>(
        `UPDATE billing_tally_jobs SET status='processing',attempts=attempts+1,
          lease_until=now()+interval '5 minutes',lease_owner=$1
         WHERE id IN (
           SELECT id FROM billing_tally_jobs
            WHERE (status='pending' AND available_at<=now())
               OR (status='processing' AND lease_until<now())
            ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20
         ) RETURNING id,invoice_id`,
        [leaseToken],
      );
      const jobs = [];
      for (const job of claimed.rows) {
        const invoice = await invoiceDetail(pool, job.invoice_id);
        if (invoice)
          jobs.push({
            id: job.id,
            exportReference: job.id,
            invoice,
            payload: tallyPayload(invoice, job.id),
          });
      }
      return reply.header('Cache-Control', 'no-store').send({ leaseToken, jobs });
    },
  );

  app.post<{
    Params: { id: string };
    Body: { leaseToken: string; success: boolean; externalId?: string; errorCode?: string };
  }>(
    '/api/connectors/tally/:id/complete',
    {
      schema: {
        tags: ['Tally connector'],
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['leaseToken', 'success'],
          properties: {
            leaseToken: { type: 'string', format: 'uuid' },
            success: { type: 'boolean' },
            externalId: { type: 'string', maxLength: 200 },
            errorCode: { type: 'string', pattern: '^[a-z0-9_]{3,80}$' },
          },
        },
      },
    },
    async (request, reply) => {
      if (!config.tallyConnectorSecret)
        return fail(reply, 503, 'TALLY_NOT_CONFIGURED', 'Tally connector is not configured.');
      if (!connectorAllowed(request.headers.authorization, config.tallyConnectorSecret))
        return fail(reply, 401, 'CONNECTOR_UNAUTHORISED', 'Connector authentication failed.');
      const b = request.body;
      if (b.success && !b.externalId?.trim())
        return fail(
          reply,
          400,
          'EXTERNAL_REFERENCE_REQUIRED',
          'A successful Tally export must include its Tally reference.',
        );
      let result;
      try {
        result = await pool.query(
          `UPDATE billing_tally_jobs SET status=$3,lease_until=NULL,lease_owner=NULL,
            external_id=CASE WHEN $2 THEN $4 ELSE external_id END,
            last_error=CASE WHEN $2 THEN NULL ELSE $5 END,
            sent_at=CASE WHEN $2 THEN now() ELSE sent_at END,
            available_at=CASE WHEN $2 THEN available_at ELSE now()+interval '5 minutes' END
           WHERE id=$1 AND status='processing' AND lease_owner=$6 RETURNING *`,
          [
            request.params.id,
            b.success,
            b.success ? 'sent' : 'failed',
            b.externalId?.trim() || null,
            b.errorCode || 'tally_rejected',
            b.leaseToken,
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code === '23505')
          return fail(
            reply,
            409,
            'TALLY_REFERENCE_EXISTS',
            'That Tally reference is already attached to another export.',
          );
        throw error;
      }
      return result.rowCount
        ? { job: result.rows[0] }
        : fail(reply, 409, 'LEASE_INVALID', 'This job lease is no longer active.');
    },
  );
}
