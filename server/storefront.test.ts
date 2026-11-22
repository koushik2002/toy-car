import { randomBytes, randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { csrfTokenFor, hashToken } from './identity/security.js';
import type { ServerConfig } from './config.js';
import type { IdentityRole } from './identity/routes.js';

const url = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!url);
suite('storefront, account and operations features against PostgreSQL', () => {
  const schema = `tinykars_store_${randomBytes(5).toString('hex')}`;
  const config: ServerConfig = {
    databaseUrl: url!,
    port: 3001,
    production: false,
    allowedOrigins: ['http://localhost:5173'],
    publicWebUrl: 'http://localhost:5173',
    outboxEncryptionKey: randomBytes(32).toString('hex'),
  };
  let adminPool: pg.Pool;
  let pool: pg.Pool;
  let app: Awaited<ReturnType<typeof createApp>>;
  const origin = { origin: config.allowedOrigins[0] };

  /** Creates a verified account with a live session, skipping the email and MFA steps. */
  async function account(role: IdentityRole, password = 'unused password value') {
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const hash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456 });
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
       VALUES($1,$2,$3,$4,$5,now())`,
      [id, `${role} person`, `${role}-${id}@example.com`, hash, role],
    );
    await pool.query(
      `INSERT INTO identity_sessions(token_hash,user_id,auth_version,role_at_issue,expires_at)
       VALUES($1,$2,1,$3,now()+interval '1 hour')`,
      [hashToken(token), id, role],
    );
    return {
      id,
      token,
      headers: {
        ...origin,
        cookie: `tk_session=${token}`,
        'x-csrf-token': csrfTokenFor(token, config.outboxEncryptionKey),
      },
    };
  }

  async function publishedProduct(fields: { price?: number; available?: number; brand?: string }) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO catalogue_products
        (id,sku,name,brand,series,scale,price_paise,mrp_paise,available,published_at)
       VALUES($1,$2,'Test Car',$3,'Street','1:64',$4,$4,$5,now())`,
      [
        id,
        `STORE-${id.slice(0, 8)}`,
        fields.brand || 'Storefront Brand',
        fields.price ?? 50000,
        fields.available ?? 5,
      ],
    );
    return id;
  }

  async function paidOrder(customerId: string, productId: string, status = 'paid') {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO commerce_orders(id,customer_id,channel,status,subtotal_paise,shipping_paise,
        tax_paise,discount_paise,total_paise,address_snapshot,paid_at,delivered_at)
       VALUES($1,$2,'online',$3,50000,0,0,0,50000,$4,now(),
        CASE WHEN $3='delivered' THEN now() END)`,
      [id, customerId, status, JSON.stringify({ city: 'Pune', phone: '9876543210' })],
    );
    await pool.query(
      `INSERT INTO commerce_order_items(id,order_id,product_id,sku,name,quantity,unit_price_paise,
        line_total_paise) VALUES($1,$2,$3,'STORE','Test Car',1,50000,50000)`,
      [randomUUID(), id, productId],
    );
    return id;
  }

  beforeAll(async () => {
    adminPool = new pg.Pool({ connectionString: url });
    if (process.env.TEST_DATABASE_ISOLATED !== '1')
      await adminPool.query(`CREATE SCHEMA ${schema}`);
    pool = new pg.Pool({
      connectionString: url,
      ...(process.env.TEST_DATABASE_ISOLATED === '1'
        ? {}
        : { options: `-c search_path=${schema}` }),
    });
    await migrate(pool);
    app = await createApp(pool, config);
  }, 30000);
  afterAll(async () => {
    // Other suites share the local database, so shop-wide settings made here are switched off.
    if (pool) {
      await pool.query('UPDATE commerce_shipping_policies SET active=false WHERE active');
      await pool.query('UPDATE billing_settings SET active=false WHERE active');
      await pool.query('DELETE FROM commerce_notification_outbox');
    }
    await app?.close();
    await pool?.end();
    if (adminPool) {
      if (process.env.TEST_DATABASE_ISOLATED !== '1')
        await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
  });

  it('assigns readable order numbers to every order', async () => {
    const customer = await account('customer');
    const order = await paidOrder(customer.id, await publishedProduct({}));
    const row = await pool.query<{ order_number: string }>(
      'SELECT order_number FROM commerce_orders WHERE id=$1',
      [order],
    );
    expect(row.rows[0].order_number).toMatch(/^TK-\d{4}-\d{4,}$/);
    const list = await app.inject({ method: 'GET', url: '/api/orders', headers: customer.headers });
    expect(list.json().items[0]).toMatchObject({
      orderNumber: row.rows[0].order_number,
      itemCount: 1,
      firstItemName: 'Test Car',
    });
  });

  it('keeps public browsing off unless the shop enables it', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/products' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/config' })).json().catalogue).toEqual({
      publicBrowsing: false,
    });
    const open = await createApp(pool, { ...config, publicBrowsing: true });
    try {
      expect((await open.inject({ method: 'GET', url: '/api/products' })).statusCode).toBe(200);
      expect((await open.inject({ method: 'GET', url: '/api/products/overview' })).statusCode).toBe(
        200,
      );
      // Public browsing never opens customer actions to signed-out visitors.
      expect(
        (
          await open.inject({
            method: 'PUT',
            url: `/api/wishlist/${randomUUID()}`,
            headers: origin,
          })
        ).statusCode,
      ).toBe(401);
    } finally {
      await open.close();
    }
  });

  it('returns explicit sellable variations from the database', async () => {
    const customer = await account('customer');
    const first = randomUUID();
    const second = randomUUID();
    const group = `variant-${randomUUID()}`;
    await pool.query(
      `INSERT INTO catalogue_products
        (id,sku,name,brand,series,scale,condition,price_paise,mrp_paise,available,
         variant_group,variant_label,published_at)
       VALUES($1,$3,'Variant Car','Tiny Kars','Road','1:64','New',49900,59900,2,$5,'Red · 1:64',now()),
             ($2,$4,'Variant Car','Tiny Kars','Road','1:43','New',79900,89900,1,$5,'Blue · 1:43',now())`,
      [first, second, `VAR-${first.slice(0, 8)}`, `VAR-${second.slice(0, 8)}`, group],
    );
    const response = await app.inject({
      method: 'GET',
      url: `/api/products/${first}`,
      headers: customer.headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().product).toMatchObject({ id: first, variantGroup: group });
    expect(response.json().variants).toHaveLength(2);
    expect(
      response.json().variants.map((item: { variantLabel: string }) => item.variantLabel),
    ).toEqual(['Blue · 1:43', 'Red · 1:64']);
  });

  it('signs staff, admin and super admin in with email and password only', async () => {
    const password = 'team password value 1';
    for (const role of ['staff', 'admin', 'super_admin'] as const) {
      const member = await account(role, password);
      const email = (
        await pool.query<{ email: string }>('SELECT email FROM identity_users WHERE id=$1', [
          member.id,
        ])
      ).rows[0].email;
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: origin,
        payload: { email, password },
      });
      expect(login.json().user.role).toBe(role);
    }
  });

  it('summarises brands, series, scales and free shipping for menus', async () => {
    const customer = await account('customer');
    const brand = `Overview ${randomUUID().slice(0, 6)}`;
    await publishedProduct({ brand });
    await publishedProduct({ brand });
    const response = await app.inject({
      method: 'GET',
      url: '/api/products/overview',
      headers: customer.headers,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().brands.find((entry: { name: string }) => entry.name === brand)).toEqual({
      name: brand,
      total: 2,
      series: ['Street'],
    });
    expect(response.json().scales.some((s: { name: string }) => s.name === '1:64')).toBe(true);
  });

  it('quotes the same total checkout would charge, without reserving stock', async () => {
    const customer = await account('customer');
    const admin = await account('super_admin');
    const productId = await publishedProduct({ price: 40000, available: 3 });
    await pool.query('UPDATE commerce_shipping_policies SET active=false WHERE active');
    await pool.query(
      `INSERT INTO commerce_shipping_policies(id,mode,base_paise,free_above_paise,created_by,active,activated_at)
       VALUES($1,'flat',7900,100000,$2,true,now())`,
      [randomUUID(), admin.id],
    );
    const code = `SAVE${randomUUID().slice(0, 6).toUpperCase()}`;
    await pool.query(
      `INSERT INTO commerce_vouchers(id,code,kind,value,minimum_subtotal_paise,use_scope,
        starts_at,expires_at,created_by)
       VALUES($1,$2,'fixed',5000,0,'once_per_customer',now()-interval '1 day',now()+interval '1 day',$3)`,
      [randomUUID(), code, admin.id],
    );
    const quote = await app.inject({
      method: 'POST',
      url: '/api/checkout/quote',
      headers: customer.headers,
      payload: { items: [{ productId, quantity: 2 }], voucherCode: code },
    });
    expect(quote.statusCode).toBe(200);
    expect(quote.json()).toMatchObject({
      subtotalPaise: 80000,
      shippingPaise: 7900,
      voucherDiscountPaise: 5000,
      discountPaise: 5000,
      totalPaise: 82900,
      freeAbovePaise: 100000,
    });
    const free = await app.inject({
      method: 'POST',
      url: '/api/checkout/quote',
      headers: customer.headers,
      payload: { items: [{ productId, quantity: 3 }] },
    });
    expect(free.json(), JSON.stringify(free.json())).toMatchObject({
      shippingPaise: 0,
      freeShippingApplied: true,
    });
    const stock = await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [
      productId,
    ]);
    expect(stock.rows[0].available).toBe(3);
    expect(
      (
        await pool.query(
          'SELECT 1 FROM commerce_voucher_redemptions r JOIN commerce_vouchers v ON v.id=r.voucher_id WHERE v.code=$1',
          [code],
        )
      ).rowCount,
    ).toBe(0);
    const tooMany = await app.inject({
      method: 'POST',
      url: '/api/checkout/quote',
      headers: customer.headers,
      payload: { items: [{ productId, quantity: 4 }] },
    });
    expect(tooMany.json().error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('saves, defaults, edits and deletes only the owner’s addresses', async () => {
    const customer = await account('customer');
    const other = await account('customer');
    const address = {
      recipientName: 'Asha Rao',
      phone: '9876543210',
      line1: '12 MG Road',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
    };
    const first = await app.inject({
      method: 'POST',
      url: '/api/account/addresses',
      headers: customer.headers,
      payload: address,
    });
    expect(first.statusCode).toBe(201);
    expect(first.json().address.isDefault).toBe(true);
    const second = await app.inject({
      method: 'POST',
      url: '/api/account/addresses',
      headers: customer.headers,
      payload: { ...address, city: 'Mysuru', postalCode: '570001', isDefault: true },
    });
    expect(second.json().address.isDefault).toBe(true);
    const list = await app.inject({
      method: 'GET',
      url: '/api/account/addresses',
      headers: customer.headers,
    });
    expect(list.json().items.map((item: { city: string }) => item.city)).toEqual([
      'Mysuru',
      'Bengaluru',
    ]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/account/addresses/${first.json().address.id}`,
          headers: other.headers,
          payload: address,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'DELETE',
          url: `/api/account/addresses/${second.json().address.id}`,
          headers: customer.headers,
        })
      ).statusCode,
    ).toBe(200);
    const after = await app.inject({
      method: 'GET',
      url: '/api/account/addresses',
      headers: customer.headers,
    });
    expect(after.json().items).toHaveLength(1);
    expect(after.json().items[0].isDefault).toBe(true);
  });

  it('updates the profile and changes the password while keeping only this session', async () => {
    const password = 'original password 123';
    const customer = await account('customer', password);
    const otherDevice = randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO identity_sessions(token_hash,user_id,auth_version,role_at_issue,expires_at)
       VALUES($1,$2,1,'customer',now()+interval '1 hour')`,
      [hashToken(otherDevice), customer.id],
    );
    const profile = await app.inject({
      method: 'PUT',
      url: '/api/account/profile',
      headers: customer.headers,
      payload: { name: 'Asha', phone: '9876543210' },
    });
    expect(profile.json().profile).toMatchObject({ name: 'Asha', phone: '9876543210' });
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/account/password',
      headers: customer.headers,
      payload: { currentPassword: 'not the password', newPassword: 'brand new password 456' },
    });
    expect(wrong.json().error.code).toBe('PASSWORD_INCORRECT');
    const changed = await app.inject({
      method: 'POST',
      url: '/api/account/password',
      headers: customer.headers,
      payload: { currentPassword: password, newPassword: 'brand new password 456' },
    });
    expect(changed.statusCode).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: customer.headers })).json()
        .user.id,
    ).toBe(customer.id);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: `tk_session=${otherDevice}` },
        })
      ).json().user,
    ).toBeNull();
  });

  it('keeps a private wishlist and records back-in-stock requests', async () => {
    const customer = await account('customer');
    const other = await account('customer');
    const productId = await publishedProduct({ available: 0 });
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/wishlist/${productId}`,
          headers: customer.headers,
        })
      ).statusCode,
    ).toBe(200);
    await app.inject({
      method: 'PUT',
      url: `/api/wishlist/${productId}`,
      headers: customer.headers,
    });
    await app.inject({
      method: 'PUT',
      url: `/api/restock-alerts/${productId}`,
      headers: customer.headers,
    });
    const mine = await app.inject({
      method: 'GET',
      url: '/api/wishlist',
      headers: customer.headers,
    });
    expect(mine.json().items.map((item: { id: string }) => item.id)).toEqual([productId]);
    expect(mine.json().restockAlerts).toEqual([productId]);
    expect(
      (await app.inject({ method: 'GET', url: '/api/wishlist', headers: other.headers })).json()
        .items,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/wishlist/${randomUUID()}`,
          headers: customer.headers,
        })
      ).statusCode,
    ).toBe(404);
    await app.inject({
      method: 'DELETE',
      url: `/api/wishlist/${productId}`,
      headers: customer.headers,
    });
    expect(
      (await app.inject({ method: 'GET', url: '/api/wishlist', headers: customer.headers })).json()
        .items,
    ).toEqual([]);
  });

  it('lets a customer request cancellation, blocks shipping and lets an admin resolve it', async () => {
    const customer = await account('customer');
    const admin = await account('admin');
    const orderId = await paidOrder(customer.id, await publishedProduct({}));
    const request = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderId}/requests`,
      headers: customer.headers,
      payload: { kind: 'cancel', reason: 'Ordered the wrong colour' },
    });
    expect(request.statusCode).toBe(201);
    expect(request.json().order.requests[0]).toMatchObject({ kind: 'cancel', status: 'open' });
    const duplicate = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderId}/requests`,
      headers: customer.headers,
      payload: { kind: 'cancel', reason: 'Again' },
    });
    expect(duplicate.json().error.code).toBe('REQUEST_OPEN');
    await app.inject({
      method: 'POST',
      url: `/api/admin/orders/${orderId}/status`,
      headers: admin.headers,
      payload: { status: 'processing', idempotencyKey: randomUUID() },
    });
    const listed = await app.inject({
      method: 'GET',
      url: '/api/admin/orders?request=open',
      headers: admin.headers,
    });
    // Shipping stays blocked while the request is open, and the order desk can filter for it.
    expect(listed.json().items.some((item: { id: string }) => item.id === orderId)).toBe(true);
    const open = await pool.query<{ id: string }>(
      "SELECT id FROM commerce_order_requests WHERE order_id=$1 AND status='open'",
      [orderId],
    );
    expect(open.rowCount).toBe(1);
    const resolved = await app.inject({
      method: 'POST',
      url: `/api/admin/order-requests/${open.rows[0].id}/resolve`,
      headers: admin.headers,
      payload: { decision: 'rejected', note: 'Already packed for you' },
    });
    expect(resolved.statusCode).toBe(200);
    expect(resolved.json().order.requests[0].status).toBe('rejected');
  });

  it('only accepts cancellations before preparation and returns inside the window', async () => {
    const customer = await account('customer');
    const admin = await account('admin');
    const productId = await publishedProduct({});
    const paid = await paidOrder(customer.id, productId);
    await app.inject({
      method: 'POST',
      url: `/api/orders/${paid}/requests`,
      headers: customer.headers,
      payload: { kind: 'cancel', reason: 'Changed my mind' },
    });
    const blocked = await app.inject({
      method: 'POST',
      url: `/api/admin/orders/${paid}/status`,
      headers: admin.headers,
      payload: { status: 'processing', idempotencyKey: randomUUID() },
    });
    expect(blocked.json().error.code).toBe('CANCELLATION_PENDING');
    const delivered = await paidOrder(customer.id, productId, 'delivered');
    const lateCancel = await app.inject({
      method: 'POST',
      url: `/api/orders/${delivered}/requests`,
      headers: customer.headers,
      payload: { kind: 'cancel', reason: 'Too late now' },
    });
    expect(lateCancel.json().error.code).toBe('REQUEST_NOT_ALLOWED');
    const returned = await app.inject({
      method: 'POST',
      url: `/api/orders/${delivered}/requests`,
      headers: customer.headers,
      payload: { kind: 'return', reason: 'Card arrived bent' },
    });
    expect(returned.statusCode).toBe(201);
    expect(returned.json().order.timeline.at(-1)).toMatchObject({
      status: 'return_requested',
      note: 'Card arrived bent',
    });
    const old = await paidOrder(customer.id, productId, 'delivered');
    await pool.query(
      "UPDATE commerce_orders SET delivered_at=now()-interval '8 days' WHERE id=$1",
      [old],
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/orders/${old}/requests`,
          headers: customer.headers,
          payload: { kind: 'return', reason: 'Too late' },
        })
      ).json().error.code,
    ).toBe('REQUEST_NOT_ALLOWED');
  });

  it('applies an approved store-credit cancellation once and reverses balances', async () => {
    const customer = await account('customer');
    const admin = await account('admin');
    const productId = await publishedProduct({ available: 5 });
    const orderId = await paidOrder(customer.id, productId);
    await pool.query('UPDATE catalogue_products SET available=4 WHERE id=$1', [productId]);
    await pool.query(
      `INSERT INTO commerce_loyalty_entries
        (id,customer_id,order_id,points,kind,reason,source_key)
       VALUES($1,$2,$3,5,'earn','Order award',$4),
             ($5,$2,$3,-2,'redeem','Checkout redemption',$6)`,
      [
        randomUUID(),
        customer.id,
        orderId,
        `test:${orderId}:earn`,
        randomUUID(),
        `test:${orderId}:redeem`,
      ],
    );
    await pool.query(
      `INSERT INTO commerce_wallet_entries
        (id,customer_id,order_id,amount_paise,kind,reason,source_key)
       VALUES($1,$2,$3,-1000,'checkout','Checkout credit',$4)`,
      [randomUUID(), customer.id, orderId, `test:${orderId}:wallet`],
    );
    const requested = await app.inject({
      method: 'POST',
      url: `/api/orders/${orderId}/requests`,
      headers: customer.headers,
      payload: {
        kind: 'cancel',
        reason: 'Please add this to store credit',
        refundPreference: 'store_credit',
      },
    });
    const requestId = requested.json().order.requests[0].id;
    const approved = await app.inject({
      method: 'POST',
      url: `/api/admin/order-requests/${requestId}/resolve`,
      headers: admin.headers,
      payload: { decision: 'approved', note: 'Approved for store credit' },
    });
    expect(approved.statusCode).toBe(200);
    expect(approved.json().order.status).toBe('refunded');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/order-requests/${requestId}/resolve`,
          headers: admin.headers,
          payload: { decision: 'approved' },
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS total FROM commerce_refunds WHERE order_id=$1',
          [orderId],
        )
      ).rows[0].total,
    ).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT COALESCE(SUM(points),0)::integer AS balance FROM commerce_loyalty_entries WHERE customer_id=$1',
          [customer.id],
        )
      ).rows[0].balance,
    ).toBe(0);
    expect(
      (
        await pool.query(
          'SELECT COALESCE(SUM(amount_paise),0)::integer AS balance FROM commerce_wallet_entries WHERE customer_id=$1',
          [customer.id],
        )
      ).rows[0].balance,
    ).toBe(50000);
    expect(
      (await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [productId]))
        .rows[0].available,
    ).toBe(5);
  });

  it('records courier, tracking and recipient as the order moves', async () => {
    const customer = await account('customer');
    const admin = await account('admin');
    const orderId = await paidOrder(customer.id, await publishedProduct({}));
    const step = (payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/admin/orders/${orderId}/status`,
        headers: admin.headers,
        payload: { ...payload, idempotencyKey: randomUUID() },
      });
    await step({ status: 'processing' });
    await step({ status: 'shipped', courier: 'Blue Dart', trackingNumber: 'BD123' });
    await step({ status: 'out_for_delivery' });
    const done = await step({ status: 'delivered', recipient: 'Asha Rao' });
    expect(done.json().order).toMatchObject({
      courier: 'Blue Dart',
      trackingNumber: 'BD123',
      deliveryRecipient: 'Asha Rao',
      canReturn: true,
    });
    expect(done.json().order.timeline.map((e: { note: string }) => e.note)).toEqual([
      '',
      'Blue Dart · Tracking BD123',
      '',
      'Received by Asha Rao',
    ]);
    const search = await app.inject({
      method: 'GET',
      url: '/api/admin/orders?q=BD123',
      headers: admin.headers,
    });
    expect(search.json().items.map((item: { id: string }) => item.id)).toEqual([orderId]);
  });

  it('shows dashboard figures, customers and stock movements to admins only', async () => {
    const admin = await account('admin');
    const seller = await account('seller');
    const customer = await account('customer');
    await paidOrder(customer.id, await publishedProduct({}));
    const dashboard = await app.inject({
      method: 'GET',
      url: '/api/admin/dashboard',
      headers: admin.headers,
    });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.json().daily).toHaveLength(30);
    expect(dashboard.json().todayOrders).toBeGreaterThan(0);
    expect(dashboard.json().onlineRevenuePaise).toBeGreaterThan(0);
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/dashboard', headers: seller.headers }))
        .statusCode,
    ).toBe(403);
    const customers = await app.inject({
      method: 'GET',
      url: `/api/admin/customers?q=${encodeURIComponent(customer.id)}`,
      headers: admin.headers,
    });
    expect(customers.json().items[0]).toMatchObject({ id: customer.id, orders: 1 });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/admin/customers/${customer.id}`,
      headers: admin.headers,
    });
    expect(detail.json().orders).toHaveLength(1);
    const productId = await publishedProduct({ available: 2 });
    await app.inject({
      method: 'POST',
      url: `/api/admin/products/${productId}/stock`,
      headers: admin.headers,
      payload: { delta: 3, reason: 'Received a carton', idempotencyKey: randomUUID() },
    });
    const movements = await app.inject({
      method: 'GET',
      url: `/api/admin/inventory/movements?productId=${productId}`,
      headers: admin.headers,
    });
    expect(movements.json().items[0]).toMatchObject({
      before: 2,
      after: 5,
      delta: 3,
      reason: 'Received a carton',
    });
    const audit = await app.inject({
      method: 'GET',
      url: '/api/admin/audit-logs?action=inventory.adjusted',
      headers: admin.headers,
    });
    expect(audit.statusCode).toBe(200);
    expect(audit.json().items[0]).toMatchObject({
      action: 'inventory.adjusted',
      entityId: productId,
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/admin/audit-logs',
          headers: customer.headers,
        })
      ).statusCode,
    ).toBe(403);
  });

  it('persists a customer-owned cart without trusting stored prices', async () => {
    const customer = await account('customer');
    const other = await account('customer');
    const productId = await publishedProduct({ price: 76500, available: 4 });
    const saved = await app.inject({
      method: 'PUT',
      url: '/api/cart',
      headers: customer.headers,
      payload: { items: [{ productId, quantity: 2 }] },
    });
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toEqual({ saved: true, itemCount: 1 });
    const mine = await app.inject({ method: 'GET', url: '/api/cart', headers: customer.headers });
    expect(mine.json().items[0]).toMatchObject({
      productId,
      quantity: 2,
      pricePaise: 76500,
      purchasable: true,
    });
    expect(
      (await app.inject({ method: 'GET', url: '/api/cart', headers: other.headers })).json().items,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: '/api/cart',
          headers: customer.headers,
          payload: {
            items: [
              { productId, quantity: 1 },
              { productId, quantity: 2 },
            ],
          },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('imports rupee prices with opening stock and exports a spreadsheet-safe CSV', async () => {
    const admin = await account('admin');
    const series = `Import ${randomUUID().slice(0, 6)}`;
    const csv = [
      'name,brand,series,price,mrp,stock,rare,offer,serial_tracking,low_stock_threshold',
      `Mustang,Hot Wheels,${series},"₹1,249.50",1499,3,yes,Starter Garage,yes,2`,
      `"=HYPERLINK(""x"")",Hot Wheels,${series},249,349,0,no,,no,`,
    ].join('\n');
    const staged = await app.inject({
      method: 'POST',
      url: '/api/admin/imports',
      headers: admin.headers,
      payload: { csv },
    });
    expect(staged.statusCode).toBe(201);
    expect(staged.json().errorCount).toBe(0);
    expect(staged.json().preview[0]).toMatchObject({ pricePaise: 124950, stock: 3 });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/imports/${staged.json().jobId}/commit`,
          headers: admin.headers,
        })
      ).statusCode,
    ).toBe(200);
    const product = await pool.query<{
      id: string;
      available: number;
      rare: boolean;
      offer: string;
      low_stock_threshold: number;
    }>(
      'SELECT id,available,rare,offer,low_stock_threshold FROM catalogue_products WHERE series=$1 AND name=$2',
      [series, 'Mustang'],
    );
    expect(product.rows[0]).toMatchObject({
      available: 3,
      rare: true,
      offer: 'Starter Garage',
      low_stock_threshold: 2,
    });
    const units = await pool.query('SELECT 1 FROM inventory_units WHERE product_id=$1', [
      product.rows[0].id,
    ]);
    expect(units.rowCount).toBe(3);
    const imported = await pool.query<{ sku: string }>(
      'SELECT sku FROM catalogue_products WHERE id=$1',
      [product.rows[0].id],
    );
    const updateCsv = [
      'sku,name,brand,series,price,mrp,stock,serial_tracking,variant_group,variant_label',
      `${imported.rows[0].sku},,Hot Wheels,${series},1299.50,1499,4,yes,mustang-colours,Red`,
    ].join('\n');
    const updateStage = await app.inject({
      method: 'POST',
      url: '/api/admin/imports',
      headers: admin.headers,
      payload: { csv: updateCsv },
    });
    expect(updateStage.json().preview[0]).toMatchObject({
      action: 'update',
      name: '(Admin review required)',
      errors: [],
    });
    const updateCommit = await app.inject({
      method: 'POST',
      url: `/api/admin/imports/${updateStage.json().jobId}/commit`,
      headers: admin.headers,
    });
    expect(updateCommit.json()).toMatchObject({
      status: 'committed',
      summary: { update: 1 },
    });
    const updated = await pool.query(
      'SELECT name,available,requires_review,variant_group,variant_label FROM catalogue_products WHERE id=$1',
      [product.rows[0].id],
    );
    expect(updated.rows[0]).toMatchObject({
      name: 'IMPORT-ROW-2',
      available: 4,
      requires_review: true,
      variant_group: 'mustang-colours',
      variant_label: 'Red',
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/products/${product.rows[0].id}/publish`,
          headers: admin.headers,
        })
      ).json().error.code,
    ).toBe('REVIEW_REQUIRED');
    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/imports',
      headers: admin.headers,
      payload: { csv: `name,brand,series,price,mrp\nCar,Brand,${series},abc,10` },
    });
    expect(bad.json().preview[0].errors.join(' ')).toContain('rupee amount');
    const exported = await app.inject({
      method: 'GET',
      url: `/api/admin/products/export.csv?q=${encodeURIComponent('HYPERLINK')}`,
      headers: admin.headers,
    });
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.body).toContain(`"'=HYPERLINK(""x"")"`);
    expect(exported.body.split('\r\n')[0]).toContain('price,mrp,stock');
  });

  it('issues counter bills with address, payment, shipping and limits seller extras', async () => {
    const seller = await account('seller');
    const admin = await account('super_admin');
    const productId = await publishedProduct({ price: 100000, available: 5 });
    await pool.query('UPDATE catalogue_products SET serial_tracking=true WHERE id=$1', [productId]);
    for (let index = 1; index <= 5; index += 1)
      await pool.query('INSERT INTO inventory_units(id,product_id,serial_code) VALUES($1,$2,$3)', [
        randomUUID(),
        productId,
        `BILL-${productId.slice(0, 8)}-${index}`,
      ]);
    await pool.query('UPDATE billing_settings SET active=false WHERE active');
    await pool.query(
      `INSERT INTO billing_settings(id,legal_name,invoice_prefix,default_tax_bps,active,created_by,activated_at)
       VALUES($1,'Tiny Kars','TKS',1800,true,$2,now())`,
      [randomUUID(), admin.id],
    );
    const base = {
      channel: 'offline',
      customerName: 'Walk In',
      customerAddress: '5 Market Street, Pune',
      paymentMethod: 'upi',
      note: 'Gift wrap',
      shippingPaise: 5000,
    };
    const sellerDiscount = await app.inject({
      method: 'POST',
      url: '/api/billing/invoices',
      headers: seller.headers,
      payload: {
        ...base,
        discountPaise: 1000,
        items: [{ productId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      },
    });
    expect(sellerDiscount.statusCode).toBe(403);
    const active = await app.inject({
      method: 'GET',
      url: '/api/billing/settings/active',
      headers: seller.headers,
    });
    expect(active.json().settings).toMatchObject({ invoicePrefix: 'TKS', defaultTaxBps: 1800 });
    const sellerBill = await app.inject({
      method: 'POST',
      url: '/api/billing/invoices',
      headers: seller.headers,
      payload: {
        ...base,
        items: [{ productId, quantity: 1, hsn: '9503' }],
        idempotencyKey: randomUUID(),
      },
    });
    expect(sellerBill.statusCode).toBe(201);
    expect(sellerBill.json().invoice).toMatchObject({
      customer_address: '5 Market Street, Pune',
      payment_method: 'upi',
      note: 'Gift wrap',
      subtotal_paise: 100000,
      shipping_paise: 5000,
      tax_paise: 18000,
      total_paise: 123000,
    });
    expect(sellerBill.json().invoice.items[0].hsn).toBe('9503');
    expect(sellerBill.json().invoice.items[0].serial_codes).toHaveLength(1);
    const adminBill = await app.inject({
      method: 'POST',
      url: '/api/billing/invoices',
      headers: admin.headers,
      payload: {
        ...base,
        discountPaise: 20000,
        items: [
          { productId, quantity: 1 },
          { name: 'Display case', unitPricePaise: 30000, quantity: 1 },
        ],
        idempotencyKey: randomUUID(),
      },
    });
    expect(adminBill.statusCode).toBe(201);
    // (100000 + 30000 - 20000) × 18% tax, plus 5000 shipping.
    expect(adminBill.json().invoice).toMatchObject({
      subtotal_paise: 130000,
      discount_paise: 20000,
      tax_paise: 19800,
      total_paise: 134800,
    });
    expect(
      adminBill.json().invoice.items.find((item: { sku: string }) => item.sku !== 'CUSTOM')
        .serial_codes,
    ).toHaveLength(1);
    const sellerInvoices = await app.inject({
      method: 'GET',
      url: '/api/billing/invoices',
      headers: seller.headers,
    });
    expect(sellerInvoices.json().items.map((invoice: { id: string }) => invoice.id)).toContain(
      sellerBill.json().invoice.id,
    );
    expect(sellerInvoices.json().items.map((invoice: { id: string }) => invoice.id)).not.toContain(
      adminBill.json().invoice.id,
    );
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/billing/invoices/${adminBill.json().invoice.id}`,
          headers: seller.headers,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/billing/invoices/${adminBill.json().invoice.id}/download`,
          headers: seller.headers,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/billing/eligible-orders',
          headers: seller.headers,
        })
      ).statusCode,
    ).toBe(403);
    const sku = (
      await pool.query<{ sku: string }>('SELECT sku FROM catalogue_products WHERE id=$1', [
        productId,
      ])
    ).rows[0].sku;
    const lookup = await app.inject({
      method: 'GET',
      url: `/api/billing/products?q=${encodeURIComponent(sku)}`,
      headers: seller.headers,
    });
    expect(lookup.json().items[0]).toMatchObject({
      id: productId,
      sku,
      barcode: sku,
      pricePaise: 100000,
      available: 3,
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/products/${productId}/stock`,
          headers: seller.headers,
          payload: { delta: 1, reason: 'Not allowed', idempotencyKey: randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    for (const url of ['/api/admin/vouchers', '/api/admin/refunds'])
      expect((await app.inject({ method: 'GET', url, headers: seller.headers })).statusCode).toBe(
        403,
      );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/users/assign-role',
          headers: seller.headers,
          payload: { email: 'nobody@example.com', role: 'admin' },
        })
      ).statusCode,
    ).toBe(403);
    const dashboard = await app.inject({
      method: 'GET',
      url: '/api/admin/dashboard',
      headers: admin.headers,
    });
    expect(dashboard.json().offlineBillsToday).toBeGreaterThanOrEqual(2);
    expect(dashboard.json().offlineRevenueTodayPaise).toBeGreaterThanOrEqual(257800);
    const stock = await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [
      productId,
    ]);
    expect(stock.rows[0].available).toBe(3);
  });

  it('shows a customer the invoice for their own order only', async () => {
    const customer = await account('customer');
    const other = await account('customer');
    const admin = await account('super_admin');
    const orderId = await paidOrder(customer.id, await publishedProduct({}));
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/orders/${orderId}/invoice`,
          headers: customer.headers,
        })
      ).statusCode,
    ).toBe(404);
    const issued = await app.inject({
      method: 'POST',
      url: '/api/billing/invoices',
      headers: admin.headers,
      payload: { channel: 'online', orderId, idempotencyKey: randomUUID() },
    });
    expect(issued.statusCode).toBe(201);
    const mine = await app.inject({
      method: 'GET',
      url: `/api/orders/${orderId}/invoice`,
      headers: customer.headers,
    });
    expect(mine.json().invoice.invoice_number).toBe(issued.json().invoice.invoice_number);
    expect(mine.json().invoice.customer_address).toContain('Pune');
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/orders/${orderId}/invoice`,
          headers: other.headers,
        })
      ).statusCode,
    ).toBe(404);
    const detail = await app.inject({
      method: 'GET',
      url: `/api/orders/${orderId}`,
      headers: customer.headers,
    });
    expect(detail.json().order.invoice.invoiceNumber).toBe(issued.json().invoice.invoice_number);
  });

  it('completes the persistent commerce lifecycle from browse through delivery', async () => {
    const customer = await account('customer');
    const owner = await account('super_admin');
    const productId = await publishedProduct({ price: 25000, available: 2 });
    const local = await createApp(pool, { ...config, paymentTestMode: true });
    try {
      const shipping = await local.inject({
        method: 'POST',
        url: '/api/admin/shipping-policies',
        headers: owner.headers,
        payload: {
          mode: 'postcode',
          basePaise: 9900,
          freeAbovePaise: 100000,
          postcodeRates: [{ prefix: '560', amountPaise: 4900, name: 'Bengaluru zone' }],
        },
      });
      expect(shipping.statusCode).toBe(201);
      await local.inject({
        method: 'POST',
        url: `/api/admin/shipping-policies/${shipping.json().policy.id}/activate`,
        headers: owner.headers,
      });
      const loyalty = await local.inject({
        method: 'POST',
        url: '/api/admin/loyalty-policies',
        headers: owner.headers,
        payload: {
          earnPointsPer100Rupees: 2,
          redeemPaisePerPoint: 100,
          minimumRedeemPoints: 1,
          maximumRedeemPoints: 100,
        },
      });
      await local.inject({
        method: 'POST',
        url: `/api/admin/loyalty-policies/${loyalty.json().policy.id}/activate`,
        headers: owner.headers,
      });
      const voucherCode = `FLOW-${randomUUID().slice(0, 8).toUpperCase()}`;
      await local.inject({
        method: 'POST',
        url: '/api/admin/vouchers',
        headers: owner.headers,
        payload: {
          code: voucherCode,
          kind: 'fixed',
          value: 1000,
          useScope: 'once_per_customer',
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      await pool.query('UPDATE billing_settings SET active=false WHERE active');
      const settings = await local.inject({
        method: 'POST',
        url: '/api/admin/billing-settings',
        headers: owner.headers,
        payload: { legalName: 'Tiny Kars Test', invoicePrefix: 'TKT', defaultTaxBps: 0 },
      });
      await local.inject({
        method: 'POST',
        url: `/api/admin/billing-settings/${settings.json().settings.id}/activate`,
        headers: owner.headers,
      });

      const browse = await local.inject({
        method: 'GET',
        url: `/api/products?q=${encodeURIComponent('Test Car')}`,
        headers: customer.headers,
      });
      expect(browse.json().items.some((item: { id: string }) => item.id === productId)).toBe(true);
      expect(
        (
          await local.inject({
            method: 'PUT',
            url: '/api/cart',
            headers: customer.headers,
            payload: { items: [{ productId, quantity: 1 }] },
          })
        ).statusCode,
      ).toBe(200);
      const quote = await local.inject({
        method: 'POST',
        url: '/api/checkout/quote',
        headers: customer.headers,
        payload: {
          items: [{ productId, quantity: 1 }],
          postalCode: '560001',
          voucherCode,
        },
      });
      expect(quote.json()).toMatchObject({
        subtotalPaise: 25000,
        shippingPaise: 4900,
        shippingZone: 'Bengaluru zone',
        voucherDiscountPaise: 1000,
        totalPaise: 28900,
      });
      const checkout = await local.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        headers: customer.headers,
        payload: {
          checkoutKey: randomUUID(),
          items: [{ productId, quantity: 1 }],
          voucherCode,
          whatsappOptIn: true,
          address: {
            recipientName: 'Flow Customer',
            phone: '919876543210',
            line1: '1 Test Street',
            city: 'Bengaluru',
            state: 'Karnataka',
            postalCode: '560001',
          },
        },
      });
      expect(checkout.statusCode).toBe(201);
      const orderId = checkout.json().orderId;
      const stored = await pool.query(
        'SELECT status,shipping_paise,shipping_zone,shipping_policy_id FROM commerce_orders WHERE id=$1',
        [orderId],
      );
      expect(stored.rows[0]).toMatchObject({
        status: 'pending_payment',
        shipping_paise: 4900,
        shipping_zone: 'Bengaluru zone',
        shipping_policy_id: shipping.json().policy.id,
      });
      await local.inject({
        method: 'POST',
        url: `/api/test-payments/${orderId}/success`,
        headers: customer.headers,
      });
      expect(
        (
          await pool.query('SELECT kind FROM commerce_notification_outbox WHERE order_id=$1', [
            orderId,
          ])
        ).rows
          .map((row) => row.kind)
          .sort(),
      ).toEqual(['payment_confirmed', 'whatsapp_payment_confirmed']);
      const invoice = await local.inject({
        method: 'POST',
        url: '/api/billing/invoices',
        headers: owner.headers,
        payload: { channel: 'online', orderId, idempotencyKey: randomUUID() },
      });
      expect(invoice.statusCode).toBe(201);
      expect(invoice.json().invoice.invoice_number).toMatch(/^TKT-\d{4}-\d{6}$/);
      const finance = await local.inject({
        method: 'GET',
        url: '/api/finance',
        headers: customer.headers,
      });
      expect(finance.json().loyaltyPoints).toBeGreaterThan(0);
      const history = await local.inject({
        method: 'GET',
        url: '/api/orders',
        headers: customer.headers,
      });
      expect(history.json().items.some((item: { id: string }) => item.id === orderId)).toBe(true);
      for (const status of ['processing', 'shipped', 'out_for_delivery', 'delivered'] as const) {
        const moved = await local.inject({
          method: 'POST',
          url: `/api/admin/orders/${orderId}/status`,
          headers: owner.headers,
          payload: {
            status,
            idempotencyKey: randomUUID(),
            ...(status === 'shipped'
              ? { courier: 'Local test courier', trackingNumber: 'TEST-TRACK-1' }
              : {}),
            ...(status === 'delivered' ? { recipient: 'Flow Customer' } : {}),
          },
        });
        expect(moved.statusCode).toBe(200);
      }
      expect(
        (
          await local.inject({
            method: 'GET',
            url: `/api/orders/${orderId}`,
            headers: customer.headers,
          })
        ).json().order.status,
      ).toBe('delivered');
    } finally {
      await local.close();
    }
  });
});
