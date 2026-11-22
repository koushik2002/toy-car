import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from './app.js';
import { migrate } from './migrate.js';
import { decryptPayload, hashToken } from './identity/security.js';
import argon2 from 'argon2';
import { pruneIdentity, sendPendingEmails } from './notifications/worker.js';
import type { ServerConfig } from './config.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { registerRazorpayWebhook } from './commerce/webhook.js';
import { sendOrderConfirmations } from './commerce/notification-worker.js';
import { expirePendingCheckouts } from './commerce/checkout.js';

const url = process.env.TEST_DATABASE_URL;
const suite = describe.skipIf(!url);
suite('production catalogue and identity against PostgreSQL', () => {
  const schema = `tinykars_test_${randomBytes(5).toString('hex')}`;
  const config: ServerConfig = {
    databaseUrl: url!,
    port: 3001,
    production: false,
    allowedOrigins: ['http://localhost:5173'],
    publicWebUrl: 'http://localhost:5173',
    outboxEncryptionKey: randomBytes(32).toString('hex'),
    resendApiKey: 'test-key',
    emailFrom: 'Tiny Kars <test@example.com>',
  };
  let adminPool: pg.Pool;
  let pool: pg.Pool;
  let app: Awaited<ReturnType<typeof createApp>>;
  const origin = { origin: config.allowedOrigins[0] };
  const email = `buyer-${randomUUID()}@example.com`;

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
    await migrate(pool);
    app = await createApp(pool, config);
  }, 30000);
  afterAll(async () => {
    await app?.close();
    await pool?.end();
    if (adminPool) {
      if (process.env.TEST_DATABASE_ISOLATED !== '1')
        await adminPool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await adminPool.end();
    }
    vi.unstubAllGlobals();
  });

  it('rejects draft products and handles filters, prices, galleries and bad input', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/products' })).statusCode).toBe(401);
    const readerId = randomUUID();
    const readerToken = randomBytes(32).toString('base64url');
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,email_verified_at) VALUES($1,'Reader',$2,'unused',now())`,
      [readerId, `reader-${readerId}@example.com`],
    );
    await pool.query(
      `INSERT INTO identity_sessions(token_hash,user_id,auth_version,role_at_issue,expires_at) VALUES($1,$2,1,'customer',now()+interval '1 hour')`,
      [hashToken(readerToken), readerId],
    );
    const headers = { cookie: `tk_session=${readerToken}` };
    const visible = randomUUID();
    const secondVisible = randomUUID();
    const draft = randomUUID();
    await pool.query(
      `INSERT INTO catalogue_products
        (id,sku,name,brand,series,manufacture_year,scale,condition,price_paise,mrp_paise,
         available,rare,offer,popularity_score,published_at)
      VALUES ($1,'TK-101','Blue Sports Car','Acme','Road',2025,'1:64','Mint',129900,149900,
              2,true,'QA Deal',99,now()),
             ($2,'TK-103','Budget Sports Car','Other','Track',2024,'1:43','New',89900,99900,
              1,false,NULL,1,now()),
             ($3,'TK-102','Secret Draft','Acme','Road',2025,'1:64','New',90000,90000,
              1,false,NULL,0,NULL)`,
      [visible, secondVisible, draft],
    );
    await pool.query(
      `INSERT INTO catalogue_product_images(product_id,slot,url,alt) VALUES ($1,1,'https://example.com/one.jpg','Front'),($1,5,'https://example.com/five.jpg','Back')`,
      [visible],
    );
    const response = await app.inject({
      method: 'GET',
      url: '/api/products?brand=Acme&year=2025&maxPrice=130000&inStock=true',
      headers,
    });
    expect(response.statusCode).toBe(200);
    const contract = await app.inject({ method: 'GET', url: '/api/openapi.json' });
    expect(contract.statusCode).toBe(200);
    expect(contract.json().paths['/api/products']).toBeDefined();
    expect(response.json().total).toBe(1);
    expect(response.json().items[0].images.map((image: { slot: number }) => image.slot)).toEqual([
      1, 5,
    ]);
    const everyFilter = await app.inject({
      method: 'GET',
      url: '/api/products?series=Road&scale=1%3A64&condition=Mint&minPrice=120000&rare=true&offer=QA%20Deal&sort=price-desc',
      headers,
    });
    expect(everyFilter.statusCode).toBe(200);
    expect(everyFilter.json().items.map((item: { id: string }) => item.id)).toEqual([visible]);
    const firstPage = await app.inject({
      method: 'GET',
      url: '/api/products?sort=price-asc&limit=1',
      headers,
    });
    expect(firstPage.json()).toMatchObject({ total: 2, nextCursor: '1' });
    expect(firstPage.json().items[0].id).toBe(secondVisible);
    const secondPage = await app.inject({
      method: 'GET',
      url: `/api/products?sort=price-asc&limit=1&cursor=${firstPage.json().nextCursor}`,
      headers,
    });
    expect(secondPage.json()).toMatchObject({ total: 2, nextCursor: null });
    expect(secondPage.json().items[0].id).toBe(visible);
    expect(
      (await app.inject({ method: 'GET', url: `/api/products/${draft}`, headers })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/products?minPrice=200000&maxPrice=100000',
          headers,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/products?sort=evil', headers })).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/products?q=%27%20OR%201%3D1--', headers })
      ).json().total,
    ).toBe(0);
  });

  it('requires email verification, protects sessions, and revokes reset sessions', async () => {
    const password = 'a secure passphrase 123';
    const register = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: origin,
      payload: { name: 'Buyer', email, password, role: 'admin' },
    });
    expect(register.statusCode).toBe(400);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          headers: origin,
          payload: { name: 'Buyer', email, password },
        })
      ).statusCode,
    ).toBe(202);
    const user = await pool.query<{ role: string }>(
      'SELECT role FROM identity_users WHERE email=$1',
      [email],
    );
    expect(user.rows[0].role).toBe('customer');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: origin,
          payload: { email, password },
        })
      ).statusCode,
    ).toBe(403);
    const mail = await pool.query<{ encrypted_payload: string }>(
      "SELECT encrypted_payload FROM identity_outbox WHERE kind='verify_email' ORDER BY created_at DESC LIMIT 1",
    );
    const verifyUrl = new URL(
      decryptPayload(mail.rows[0].encrypted_payload, config.outboxEncryptionKey).url,
    );
    const verifyToken = new URLSearchParams(verifyUrl.hash.slice(1)).get('token');
    expect(verifyToken).toBeTruthy();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/verify-email',
          headers: origin,
          payload: { token: verifyToken },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/verify-email',
          headers: origin,
          payload: { token: verifyToken },
        })
      ).statusCode,
    ).toBe(400);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    const csrf = login.json().csrfToken;
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().user
        .email,
    ).toBe(email);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { ...origin, cookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/forgot-password',
          headers: origin,
          payload: { email },
        })
      ).statusCode,
    ).toBe(202);
    const resetMail = await pool.query<{ encrypted_payload: string }>(
      "SELECT encrypted_payload FROM identity_outbox WHERE kind='reset_password' ORDER BY created_at DESC LIMIT 1",
    );
    const resetUrl = new URL(
      decryptPayload(resetMail.rows[0].encrypted_payload, config.outboxEncryptionKey).url,
    );
    const resetToken = new URLSearchParams(resetUrl.hash.slice(1)).get('token');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/reset-password',
          headers: origin,
          payload: { token: resetToken, password: 'a new secure passphrase 456' },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/reset-password',
          headers: origin,
          payload: { token: resetToken, password: 'another password 789' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().user,
    ).toBeNull();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: origin,
          payload: { email, password },
        })
      ).statusCode,
    ).toBe(401);
    const freshLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email, password: 'a new secure passphrase 456' },
    });
    expect(freshLogin.statusCode).toBe(200);
    const freshCookie = String(freshLogin.headers['set-cookie']).split(';')[0];
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/logout',
          headers: { ...origin, cookie: freshCookie, 'x-csrf-token': freshLogin.json().csrfToken },
          payload: {},
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: freshCookie } })
      ).json().user,
    ).toBeNull();
    expect(csrf).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects expired verification links and signs team members in with a password', async () => {
    const another = `staff-${randomUUID()}@example.com`;
    const password = 'a long unique passphrase 345';
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          headers: origin,
          payload: { name: 'Another Buyer', email: another, password },
        })
      ).statusCode,
    ).toBe(202);
    const result = await pool.query<{ encrypted_payload: string; token_hash: string }>(
      `SELECT o.encrypted_payload,t.token_hash FROM identity_outbox o
      JOIN identity_tokens t ON o.event_key=t.purpose || ':' || t.token_hash JOIN identity_users u ON u.id=t.user_id WHERE u.email=$1`,
      [another],
    );
    const link = new URL(
      decryptPayload(result.rows[0].encrypted_payload, config.outboxEncryptionKey).url,
    );
    const token = new URLSearchParams(link.hash.slice(1)).get('token');
    await pool.query(
      "UPDATE identity_tokens SET expires_at=now()-interval '1 second' WHERE token_hash=$1",
      [result.rows[0].token_hash],
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/verify-email',
          headers: origin,
          payload: { token },
        })
      ).statusCode,
    ).toBe(400);
    await pool.query(
      "UPDATE identity_users SET email_verified_at=now(),role='admin' WHERE email=$1",
      [another],
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: origin,
          payload: { email: another, password },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('signs an admin in with a password and invalidates role-changed sessions', async () => {
    const adminEmail = `admin-${randomUUID()}@example.com`;
    const password = 'a long administrator password 123';
    const id = randomUUID();
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
      VALUES ($1,'Test Admin',$2,$3,'admin',now())`,
      [id, adminEmail, hash],
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          headers: origin,
          payload: { email: adminEmail, password: 'not the right password' },
        })
      ).statusCode,
    ).toBe(401);
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: adminEmail, password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().user.role).toBe('admin');
    const cookie = String(login.headers['set-cookie']).split(';')[0];
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().user
        .role,
    ).toBe('admin');
    await pool.query("UPDATE identity_users SET role='customer' WHERE id=$1", [id]);
    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } })).json().user,
    ).toBeNull();
  });

  it('lets only the super admin assign a team role and signs the person out', async () => {
    const adminEmail = `owner-${randomUUID()}@example.com`;
    const adminId = randomUUID();
    const candidateEmail = `staff-${randomUUID()}@example.com`;
    const candidateId = randomUUID();
    const password = 'a long role test password 123';
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
      VALUES($1,'Owner',$2,$3,'super_admin',now()),($4,'Staff Candidate',$5,$3,'customer',now())`,
      [adminId, adminEmail, passwordHash, candidateId, candidateEmail],
    );
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: adminEmail, password },
    });
    expect(adminLogin.statusCode).toBe(200);
    const adminHeaders = {
      ...origin,
      cookie: String(adminLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': adminLogin.json().csrfToken,
    };
    const candidateLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: candidateEmail, password },
    });
    expect(candidateLogin.statusCode).toBe(200);
    const candidateCookie = String(candidateLogin.headers['set-cookie']).split(';')[0];
    const candidateHeaders = {
      ...origin,
      cookie: candidateCookie,
      'x-csrf-token': candidateLogin.json().csrfToken,
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/users/assign-role',
          headers: candidateHeaders,
          payload: { email: candidateEmail, role: 'admin' },
        })
      ).statusCode,
    ).toBe(403);
    const assigned = await app.inject({
      method: 'POST',
      url: '/api/admin/users/assign-role',
      headers: adminHeaders,
      payload: { email: candidateEmail, role: 'staff' },
    });
    expect(assigned.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/auth/me',
          headers: { cookie: candidateCookie },
        })
      ).json().user,
    ).toBeNull();
    const again = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: candidateEmail, password },
    });
    expect(again.json().user.role).toBe('staff');
  });

  it('keeps order history private and allows only valid staff delivery transitions', async () => {
    const password = 'order history password 123';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const customerId = randomUUID();
    const otherId = randomUUID();
    const staffId = randomUUID();
    const adminId = randomUUID();
    const customerEmail = `order-${randomUUID()}@example.com`;
    const otherEmail = `other-${randomUUID()}@example.com`;
    const staffEmail = `delivery-${randomUUID()}@example.com`;
    const adminEmail = `fulfilment-${randomUUID()}@example.com`;
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
      VALUES($1,'Order Buyer',$2,$7,'customer',now()),($3,'Other Buyer',$4,$7,'customer',now()),
      ($5,'Delivery Staff',$6,$7,'staff',now()),($8,'Fulfilment Admin',$9,$7,'admin',now())`,
      [
        customerId,
        customerEmail,
        otherId,
        otherEmail,
        staffId,
        staffEmail,
        hash,
        adminId,
        adminEmail,
      ],
    );
    const login = async (emailAddress: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: origin,
        payload: { email: emailAddress, password },
      });
      expect(response.statusCode).toBe(200);
      return {
        ...origin,
        cookie: String(response.headers['set-cookie']).split(';')[0],
        'x-csrf-token': response.json().csrfToken,
      };
    };
    const customerHeaders = await login(customerEmail);
    const otherHeaders = await login(otherEmail);
    const staffHeaders = await login(staffEmail);
    const adminHeaders = await login(adminEmail);
    const productId = randomUUID();
    const orderId = randomUUID();
    await pool.query(
      `INSERT INTO catalogue_products(id,sku,name,brand,price_paise,mrp_paise)
      VALUES($1,$2,'Order Car','Acme',12000,12000)`,
      [productId, `ORDER-${randomUUID()}`],
    );
    await pool.query(
      `INSERT INTO commerce_orders(id,customer_id,channel,status,subtotal_paise,
      shipping_paise,tax_paise,discount_paise,total_paise,address_snapshot,paid_at)
      VALUES($1,$2,'online','paid',12000,500,0,0,12500,$3,now())`,
      [orderId, customerId, JSON.stringify({ city: 'Hyderabad' })],
    );
    await pool.query(
      `INSERT INTO commerce_order_items(id,order_id,product_id,sku,name,quantity,
      unit_price_paise,line_total_paise) VALUES($1,$2,$3,'ORDER-CAR','Order Car',1,12000,12000)`,
      [randomUUID(), orderId, productId],
    );
    await pool.query(`INSERT INTO commerce_order_events(id,order_id,status) VALUES($1,$2,'paid')`, [
      randomUUID(),
      orderId,
    ]);
    expect(
      (await app.inject({ method: 'GET', url: '/api/orders', headers: customerHeaders })).json()
        .items,
    ).toHaveLength(1);
    expect(
      (await app.inject({ method: 'GET', url: '/api/orders', headers: otherHeaders })).json().items,
    ).toHaveLength(0);
    expect(
      (await app.inject({ method: 'GET', url: `/api/orders/${orderId}`, headers: otherHeaders }))
        .statusCode,
    ).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/orders', headers: otherHeaders }))
        .statusCode,
    ).toBe(403);
    const statusUrl = `/api/admin/orders/${orderId}/status`;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: statusUrl,
          headers: staffHeaders,
          payload: { status: 'shipped', idempotencyKey: randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: statusUrl,
          headers: staffHeaders,
          payload: { status: 'delivered', idempotencyKey: randomUUID() },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: statusUrl,
          headers: adminHeaders,
          payload: { status: 'processing', idempotencyKey: randomUUID() },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: statusUrl,
          headers: adminHeaders,
          payload: { status: 'shipped', idempotencyKey: randomUUID() },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: statusUrl,
          headers: staffHeaders,
          payload: { status: 'out_for_delivery', idempotencyKey: randomUUID() },
        })
      ).statusCode,
    ).toBe(200);
    const key = randomUUID();
    const delivered = await app.inject({
      method: 'POST',
      url: statusUrl,
      headers: staffHeaders,
      payload: { status: 'delivered', note: 'Handed to customer', idempotencyKey: key },
    });
    expect(delivered.statusCode).toBe(200);
    expect(delivered.json().order.status).toBe('delivered');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: statusUrl,
          headers: staffHeaders,
          payload: { status: 'delivered', note: 'Handed to customer', idempotencyKey: key },
        })
      ).json().status,
    ).toBe('existing');
    const detail = await app.inject({
      method: 'GET',
      url: `/api/orders/${orderId}`,
      headers: customerHeaders,
    });
    expect(detail.json().order.timeline.map((event: { status: string }) => event.status)).toEqual([
      'paid',
      'processing',
      'shipped',
      'out_for_delivery',
      'delivered',
    ]);
    expect(detail.json().order.address.city).toBe('Hyderabad');
    const queued = await pool.query<{ kind: string }>(
      'SELECT kind FROM commerce_notification_outbox WHERE order_id=$1 ORDER BY kind',
      [orderId],
    );
    expect(queued.rows.map((row) => row.kind)).toEqual(['order_delivered', 'order_shipped']);
    // Later mail tests count the whole outbox, so this order's progress emails are cleared here.
    await pool.query('DELETE FROM commerce_notification_outbox WHERE order_id=$1', [orderId]);
  });

  it('lets only the super admin activate shipping and prices quotes from server products', async () => {
    const password = 'shipping policy password 123';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const ownerId = randomUUID();
    const buyerId = randomUUID();
    const ownerEmail = `shipping-owner-${randomUUID()}@example.com`;
    const buyerEmail = `shipping-buyer-${randomUUID()}@example.com`;
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
      VALUES($1,'Shipping Owner',$2,$5,'super_admin',now()),
        ($3,'Shipping Buyer',$4,$5,'customer',now())`,
      [ownerId, ownerEmail, buyerId, buyerEmail, hash],
    );
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: {
        email: ownerEmail,
        password,
      },
    });
    const buyerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: buyerEmail, password },
    });
    expect(ownerLogin.statusCode).toBe(200);
    expect(buyerLogin.statusCode).toBe(200);
    const ownerHeaders = {
      ...origin,
      cookie: String(ownerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': ownerLogin.json().csrfToken,
    };
    const buyerHeaders = {
      ...origin,
      cookie: String(buyerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': buyerLogin.json().csrfToken,
    };
    const productId = randomUUID();
    await pool.query(
      `INSERT INTO catalogue_products(id,sku,name,brand,series,price_paise,mrp_paise,
      available,published_at) VALUES($1,$2,'Shipping Car','Acme','Road',12000,12000,2,now())`,
      [productId, `SHIP-${randomUUID()}`],
    );
    const quotePayload = { items: [{ productId, quantity: 1 }], postalCode: '500001' };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/shipping/quote',
          headers: buyerHeaders,
          payload: quotePayload,
        })
      ).statusCode,
    ).toBe(503);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/shipping-policies',
          headers: buyerHeaders,
          payload: { mode: 'flat', basePaise: 500 },
        })
      ).statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/shipping-policies',
      headers: ownerHeaders,
      payload: {
        mode: 'postcode',
        basePaise: 1000,
        freeAbovePaise: 20000,
        postcodeRates: [
          { prefix: '50', amountPaise: 800 },
          { prefix: '5000', amountPaise: 600 },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const policyId = created.json().policy.id;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/shipping-policies/${policyId}/activate`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    const quote = await app.inject({
      method: 'POST',
      url: '/api/shipping/quote',
      headers: buyerHeaders,
      payload: quotePayload,
    });
    expect(quote.statusCode).toBe(200);
    expect(quote.json()).toMatchObject({
      shippingPaise: 600,
      subtotalPaise: 12000,
      policyId,
      quoteOnly: true,
    });
    const free = await app.inject({
      method: 'POST',
      url: '/api/shipping/quote',
      headers: buyerHeaders,
      payload: { items: [{ productId, quantity: 2 }], postalCode: '500001' },
    });
    expect(free.json().shippingPaise).toBe(0);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/shipping/quote',
          headers: buyerHeaders,
          payload: { items: [{ productId, quantity: 3 }], postalCode: '500001' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/shipping/quote',
          headers: buyerHeaders,
          payload: {
            items: [
              { productId, quantity: 1 },
              { productId, quantity: 1 },
            ],
            postalCode: '500001',
          },
        })
      ).statusCode,
    ).toBe(400);
  });

  it('lets the super admin create a one-use voucher and previews only eligible discounts', async () => {
    const password = 'voucher policy password 123';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const ownerId = randomUUID();
    const buyerId = randomUUID();
    const ownerEmail = `voucher-owner-${randomUUID()}@example.com`;
    const buyerEmail = `voucher-buyer-${randomUUID()}@example.com`;
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
      VALUES($1,'Voucher Owner',$2,$5,'super_admin',now()),
        ($3,'Voucher Buyer',$4,$5,'customer',now())`,
      [ownerId, ownerEmail, buyerId, buyerEmail, hash],
    );
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: {
        email: ownerEmail,
        password,
      },
    });
    const buyerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: buyerEmail, password },
    });
    expect(ownerLogin.statusCode).toBe(200);
    expect(buyerLogin.statusCode).toBe(200);
    const ownerHeaders = {
      ...origin,
      cookie: String(ownerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': ownerLogin.json().csrfToken,
    };
    const buyerHeaders = {
      ...origin,
      cookie: String(buyerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': buyerLogin.json().csrfToken,
    };
    const productId = randomUUID();
    await pool.query(
      `INSERT INTO catalogue_products(id,sku,name,brand,series,price_paise,mrp_paise,
      available,published_at) VALUES($1,$2,'Voucher Car','Acme','Road',12000,12000,2,now())`,
      [productId, `VOUCHER-${randomUUID()}`],
    );
    const code = `SAVE-${randomUUID().slice(0, 8).toUpperCase()}`;
    const body = {
      code,
      kind: 'fixed',
      value: 500,
      minimumSubtotalPaise: 10000,
      useScope: 'global_once',
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/vouchers',
          headers: buyerHeaders,
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/vouchers',
      headers: ownerHeaders,
      payload: body,
    });
    expect(created.statusCode).toBe(201);
    const voucherId = created.json().voucher.id;
    const preview = await app.inject({
      method: 'POST',
      url: '/api/vouchers/preview',
      headers: buyerHeaders,
      payload: { code, items: [{ productId, quantity: 1 }] },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toMatchObject({
      discountPaise: 500,
      subtotalPaise: 12000,
      quoteOnly: true,
      useScope: 'global_once',
    });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/vouchers',
          headers: ownerHeaders,
          payload: body,
        })
      ).statusCode,
    ).toBe(409);
    const orderId = randomUUID();
    await pool.query(
      `INSERT INTO commerce_orders(id,customer_id,channel,status,subtotal_paise,
      shipping_paise,tax_paise,discount_paise,total_paise)
      VALUES($1,$2,'online','paid',12000,0,0,500,11500)`,
      [orderId, buyerId],
    );
    await pool.query(
      `INSERT INTO commerce_voucher_redemptions(id,voucher_id,customer_id,order_id,
      discount_paise) VALUES($1,$2,$3,$4,500)`,
      [randomUUID(), voucherId, buyerId, orderId],
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/vouchers/preview',
          headers: buyerHeaders,
          payload: { code, items: [{ productId, quantity: 1 }] },
        })
      ).statusCode,
    ).toBe(409);
  });

  it('protects catalogue writes, stages CSV, commits once and generates unique SKUs and serials', async () => {
    const adminEmail = `catalogue-${randomUUID()}@example.com`;
    const password = 'a long catalogue password 123';
    const id = randomUUID();
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
      VALUES($1,'Catalogue Admin',$2,$3,'super_admin',now())`,
      [id, adminEmail, await argon2.hash(password, { type: argon2.argon2id })],
    );
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: {
        email: adminEmail,
        password,
      },
    });
    expect(login.statusCode).toBe(200);
    const headers = {
      ...origin,
      cookie: String(login.headers['set-cookie']).split(';')[0],
      'x-csrf-token': login.json().csrfToken,
    };
    const body = {
      name: 'Classic Car',
      brand: 'Acme',
      series: 'Road Legends',
      pricePaise: 150000,
      mrpPaise: 180000,
      serialTracking: true,
    };
    expect(
      (await app.inject({ method: 'POST', url: '/api/admin/products', payload: body })).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/products',
          headers: { ...origin, cookie: headers.cookie },
          payload: body,
        })
      ).statusCode,
    ).toBe(403);
    const created = await app.inject({
      method: 'POST',
      url: '/api/admin/products',
      headers,
      payload: body,
    });
    expect(created.statusCode).toBe(201);
    const productId = created.json().product.id;
    expect(created.json().product.sku).toMatch(/^\d{6}-P\d{6}$/);
    const seriesPrefix = created.json().product.sku.slice(0, 6);
    const prefixes = await app.inject({ method: 'GET', url: '/api/admin/series-codes', headers });
    expect(prefixes.statusCode).toBe(200);
    expect(prefixes.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ brand: 'Acme', series: 'Road Legends', prefix: seriesPrefix }),
      ]),
    );
    const otherSeries = await app.inject({
      method: 'POST',
      url: '/api/admin/products',
      headers,
      payload: { ...body, name: 'Racing Car', series: 'Racing Legends' },
    });
    expect(otherSeries.statusCode).toBe(201);
    expect(otherSeries.json().product.sku.slice(0, 6)).not.toBe(seriesPrefix);
    const otherBrand = await app.inject({
      method: 'POST',
      url: '/api/admin/products',
      headers,
      payload: { ...body, name: 'Another Brand Car', brand: 'Other', series: 'Road Legends' },
    });
    expect(otherBrand.statusCode).toBe(201);
    expect(otherBrand.json().product.sku.slice(0, 6)).not.toBe(seriesPrefix);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/products/${productId}/publish`,
          headers,
        })
      ).statusCode,
    ).toBe(409);
    const key = randomUUID();
    const stock = await app.inject({
      method: 'POST',
      url: `/api/admin/products/${productId}/stock`,
      headers,
      payload: { delta: 2, reason: 'Initial stock intake', idempotencyKey: key },
    });
    expect(stock.statusCode).toBe(200);
    expect(stock.json().available).toBe(2);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/products/${productId}/stock`,
          headers,
          payload: { delta: 2, reason: 'Initial stock intake', idempotencyKey: key },
        })
      ).json().kind,
    ).toBe('existing');
    const units = await pool.query<{ serial_code: string }>(
      'SELECT serial_code FROM inventory_units WHERE product_id=$1',
      [productId],
    );
    expect(units.rows).toHaveLength(2);
    expect(new Set(units.rows.map((unit) => unit.serial_code)).size).toBe(2);
    expect(units.rows.every((unit) => unit.serial_code.startsWith(`${seriesPrefix}-U`))).toBe(true);
    const listedUnits = await app.inject({
      method: 'GET',
      url: `/api/admin/products/${productId}/units`,
      headers,
    });
    expect(listedUnits.statusCode).toBe(200);
    expect(listedUnits.json().units).toHaveLength(2);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/admin/units/${listedUnits.json().units[0].id}/label.svg`,
          headers,
        })
      ).body,
    ).toContain('<svg');
    const label = await app.inject({
      method: 'GET',
      url: `/api/admin/products/${productId}/label.svg`,
      headers,
    });
    expect(label.statusCode).toBe(200);
    expect(label.body).toContain('<svg');
    const csv =
      'name,brand,series,price_paise,mrp_paise,serial_tracking\nToy Racer,Acme,Road Legends,10000,12000,true\nToy Coupe,Acme,Road Legends,20000,20000,false\n';
    const staged = await app.inject({
      method: 'POST',
      url: '/api/admin/imports',
      headers,
      payload: { csv },
    });
    expect(staged.statusCode).toBe(201);
    expect(staged.json().errorCount).toBe(0);
    const jobId = staged.json().jobId;
    expect(
      (await app.inject({ method: 'POST', url: `/api/admin/imports/${jobId}/commit`, headers }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({ method: 'POST', url: `/api/admin/imports/${jobId}/commit`, headers })
      ).json().status,
    ).toBe('committed');
    const imported = await pool.query<{ sku: string }>(
      "SELECT sku FROM catalogue_products WHERE name IN ('Toy Racer','Toy Coupe')",
    );
    expect(imported.rows).toHaveLength(2);
    expect(new Set(imported.rows.map((row) => row.sku)).size).toBe(2);
    expect(imported.rows.every((row) => row.sku.startsWith(`${seriesPrefix}-P`))).toBe(true);
    const invalid = await app.inject({
      method: 'POST',
      url: '/api/admin/imports',
      headers,
      payload: { csv: 'name,brand,series,price_paise,mrp_paise\nBad,Acme,Road Legends,20,10\n' },
    });
    expect(invalid.statusCode).toBe(201);
    expect(invalid.json().errorCount).toBe(1);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/imports/${invalid.json().jobId}/commit`,
          headers,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'PUT',
          url: `/api/admin/products/${productId}/images/1`,
          headers,
        })
      ).statusCode,
    ).toBe(503);

    const send = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async () => ({}) as never);
    const mediaApp = await createApp(pool, {
      ...config,
      mediaPublicBaseUrl: 'https://cdn.example.com',
      r2Endpoint: 'https://r2.example.com',
      r2AccessKeyId: 'test',
      r2SecretAccessKey: 'test-secret',
      r2Bucket: 'catalogue',
    });
    try {
      const png = await sharp({
        create: { width: 400, height: 400, channels: 3, background: '#dd0000' },
      })
        .png()
        .toBuffer();
      for (const slot of [1, 2, 3, 4, 5]) {
        const boundary = `----tinykars-${randomUUID()}`;
        const upload = Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="car.png"\r\nContent-Type: image/png\r\n\r\n`,
          ),
          png,
          Buffer.from(`\r\n--${boundary}--\r\n`),
        ]);
        const response = await mediaApp.inject({
          method: 'PUT',
          url: `/api/admin/products/${productId}/images/${slot}`,
          headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
          payload: upload,
        });
        expect(response.statusCode).toBe(201);
        expect(response.json().image.url).toContain('.webp');
      }
      expect(send.mock.calls.some((call) => call[0] instanceof PutObjectCommand)).toBe(true);
      expect(
        (
          await mediaApp.inject({
            method: 'POST',
            url: `/api/admin/products/${productId}/publish`,
            headers,
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await mediaApp.inject({ method: 'GET', url: `/api/products/${productId}`, headers }))
          .statusCode,
      ).toBe(200);
    } finally {
      await mediaApp.close();
      send.mockRestore();
    }
  });

  it('sends the encrypted outbox with stable provider idempotency keys', async () => {
    const deliverTo = `deliver-${randomUUID()}@example.com`;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          headers: origin,
          payload: {
            name: 'Delivery Test',
            email: deliverTo,
            password: 'a long delivery password 123',
          },
        })
      ).statusCode,
    ).toBe(202);
    const job = await pool.query<{ id: string }>(
      `SELECT o.id FROM identity_outbox o
      JOIN identity_tokens t ON o.event_key=t.purpose || ':' || t.token_hash
      JOIN identity_users u ON u.id=t.user_id WHERE u.email=$1`,
      [deliverTo],
    );
    const calls: { headers: Headers; body: string }[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: RequestInit) => {
        calls.push({ headers: new Headers(options.headers), body: String(options.body) });
        return new Response(JSON.stringify({ id: 'email_test_1' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    expect(await sendPendingEmails(pool, config)).toBeGreaterThan(0);
    expect(calls[0].headers.get('Idempotency-Key')).toMatch(/^[a-f0-9-]{36}$/);
    expect(calls.some((call) => call.body.includes(deliverTo))).toBe(true);
    const sent = await pool.query<{ status: string; encrypted_payload: string }>(
      'SELECT status,encrypted_payload FROM identity_outbox WHERE id=$1',
      [job.rows[0].id],
    );
    expect(sent.rows[0]).toEqual({ status: 'sent', encrypted_payload: '' });
    const inactive = await pool.query<{ encrypted_payload: string }>(
      "SELECT encrypted_payload FROM identity_outbox WHERE last_error='action_link_inactive'",
    );
    expect(inactive.rowCount).toBeGreaterThan(0);
    expect(inactive.rows.every((row) => row.encrypted_payload === '')).toBe(true);
  });

  it('retains encrypted failed mail for a bounded retry with the same provider key', async () => {
    const retryTo = `retry-${randomUUID()}@example.com`;
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/auth/register',
          headers: origin,
          payload: { name: 'Retry Test', email: retryTo, password: 'a long retry password 123' },
        })
      ).statusCode,
    ).toBe(202);
    const job = await pool.query<{ id: string }>(
      `SELECT o.id FROM identity_outbox o
      JOIN identity_tokens t ON o.event_key=t.purpose || ':' || t.token_hash
      JOIN identity_users u ON u.id=t.user_id WHERE u.email=$1`,
      [retryTo],
    );
    const id = job.rows[0].id;
    const keys: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, options: RequestInit) => {
        keys.push(new Headers(options.headers).get('Idempotency-Key') || '');
        return new Response('{}', {
          status: keys.length === 1 ? 503 : 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }),
    );
    expect(await sendPendingEmails(pool, config)).toBe(1);
    const failed = await pool.query<{
      status: string;
      attempts: number;
      last_error: string;
      encrypted_payload: string;
    }>('SELECT status,attempts,last_error,encrypted_payload FROM identity_outbox WHERE id=$1', [
      id,
    ]);
    expect(failed.rows[0]).toMatchObject({
      status: 'pending',
      attempts: 1,
      last_error: 'provider_http_503',
    });
    expect(failed.rows[0].encrypted_payload).not.toBe('');
    await pool.query('UPDATE identity_outbox SET available_at=now() WHERE id=$1', [id]);
    expect(await sendPendingEmails(pool, config)).toBe(1);
    expect(keys).toEqual([id, id]);
    const sent = await pool.query<{ status: string; encrypted_payload: string }>(
      'SELECT status,encrypted_payload FROM identity_outbox WHERE id=$1',
      [id],
    );
    expect(sent.rows[0]).toEqual({ status: 'sent', encrypted_payload: '' });
  });

  it('erases stale account-link payloads and expired attempt buckets', async () => {
    const id = randomUUID();
    const key = randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO identity_outbox(id,event_key,kind,encrypted_payload,created_at)
      VALUES ($1,$2,'verify_email','encrypted-old-link',now()-interval '8 days')`,
      [id, `old:${id}`],
    );
    await pool.query(
      `INSERT INTO identity_throttle(key_hash,window_start)
      VALUES ($1,now()-interval '2 days')`,
      [key],
    );
    await pruneIdentity(pool);
    const old = await pool.query<{ status: string; encrypted_payload: string }>(
      'SELECT status,encrypted_payload FROM identity_outbox WHERE id=$1',
      [id],
    );
    expect(old.rows[0]).toEqual({ status: 'failed', encrypted_payload: '' });
    expect(
      (await pool.query('SELECT 1 FROM identity_throttle WHERE key_hash=$1', [key])).rowCount,
    ).toBe(0);
  });

  it('creates checkout atomically, reuses idempotency keys and releases abandoned stock', async () => {
    const buyerId = randomUUID();
    const buyerEmail = `checkout-${randomUUID()}@example.com`;
    const password = 'checkout customer password 123';
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
       VALUES($1,'Checkout Buyer',$2,$3,'customer',now())`,
      [buyerId, buyerEmail, await argon2.hash(password, { type: argon2.argon2id })],
    );
    const productId = randomUUID();
    await pool.query(
      `INSERT INTO catalogue_products
        (id,sku,name,brand,series,price_paise,mrp_paise,available,published_at)
       VALUES($1,$2,'Checkout Car','Acme','Road',12000,12000,2,now())`,
      [productId, `CHECKOUT-${randomUUID()}`],
    );
    await pool.query('UPDATE commerce_shipping_policies SET active=false WHERE active=true');
    const policyOwner = await pool.query<{ id: string }>(
      "SELECT id FROM identity_users WHERE role='super_admin' LIMIT 1",
    );
    const ownerId = policyOwner.rows[0]?.id || buyerId;
    const policyId = randomUUID();
    await pool.query(
      `INSERT INTO commerce_shipping_policies
        (id,mode,base_paise,free_above_paise,created_by,active,activated_at)
       VALUES($1,'flat',600,NULL,$2,true,now())`,
      [policyId, ownerId],
    );
    const voucherId = randomUUID();
    const voucherCode = `PAY-${randomUUID().slice(0, 8).toUpperCase()}`;
    await pool.query(
      `INSERT INTO commerce_vouchers
        (id,code,kind,value,minimum_subtotal_paise,use_scope,expires_at,created_by)
       VALUES($1,$2,'fixed',500,10000,'once_per_customer',now()+interval '1 day',$3)`,
      [voucherId, voucherCode, ownerId],
    );
    const provider = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { amount: number };
      return new Response(
        JSON.stringify({
          id: `order_${randomBytes(8).toString('hex')}`,
          amount: body.amount,
          currency: 'INR',
          status: 'created',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    const checkoutConfig = {
      ...config,
      razorpayKeyId: 'rzp_test_checkout',
      razorpayKeySecret: 'checkout-secret',
      razorpayWebhookSecret: 'checkout-webhook-secret',
    };
    const checkoutApp = await createApp(pool, checkoutConfig, { razorpayTransport: provider });
    try {
      const login = await checkoutApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: origin,
        payload: { email: buyerEmail, password },
      });
      expect(login.statusCode).toBe(200);
      const headers = {
        ...origin,
        cookie: String(login.headers['set-cookie']).split(';')[0],
        'x-csrf-token': login.json().csrfToken,
      };
      const checkoutKey = randomUUID();
      const payload = {
        checkoutKey,
        items: [{ productId, quantity: 1 }],
        voucherCode,
        address: {
          recipientName: 'Checkout Buyer',
          phone: '919876543210',
          line1: '10 Collector Street',
          city: 'Hyderabad',
          state: 'Telangana',
          postalCode: '500001',
        },
      };
      const first = await checkoutApp.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        headers,
        payload,
      });
      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({
        subtotalPaise: 12000,
        shippingPaise: 600,
        discountPaise: 500,
        amountPaise: 12100,
        currency: 'INR',
      });
      const retry = await checkoutApp.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        headers,
        payload,
      });
      expect(retry.statusCode).toBe(200);
      expect(retry.json().orderId).toBe(first.json().orderId);
      expect(provider).toHaveBeenCalledTimes(1);
      expect(
        (await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [productId]))
          .rows[0].available,
      ).toBe(1);
      expect(
        (
          await pool.query('SELECT 1 FROM commerce_voucher_redemptions WHERE order_id=$1', [
            first.json().orderId,
          ])
        ).rowCount,
      ).toBe(1);
      await pool.query(
        "UPDATE commerce_orders SET payment_expires_at=now()-interval '1 second' WHERE id=$1",
        [first.json().orderId],
      );
      expect(await expirePendingCheckouts(pool)).toBe(1);
      expect(
        (await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [productId]))
          .rows[0].available,
      ).toBe(2);
      expect(
        (await pool.query('SELECT status FROM commerce_orders WHERE id=$1', [first.json().orderId]))
          .rows[0].status,
      ).toBe('cancelled');
      expect(
        (
          await pool.query('SELECT 1 FROM commerce_voucher_redemptions WHERE order_id=$1', [
            first.json().orderId,
          ])
        ).rowCount,
      ).toBe(0);
    } finally {
      await checkoutApp.close();
    }

    const testCheckoutApp = await createApp(pool, { ...config, paymentTestMode: true });
    try {
      const login = await testCheckoutApp.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: origin,
        payload: { email: buyerEmail, password },
      });
      const headers = {
        ...origin,
        cookie: String(login.headers['set-cookie']).split(';')[0],
        'x-csrf-token': login.json().csrfToken,
      };
      expect(
        (await testCheckoutApp.inject({ method: 'GET', url: '/api/config' })).json().commerce,
      ).toMatchObject({ checkoutEnabled: true, paymentMode: 'test' });
      const response = await testCheckoutApp.inject({
        method: 'POST',
        url: '/api/checkout/orders',
        headers,
        payload: {
          checkoutKey: randomUUID(),
          items: [{ productId, quantity: 1 }],
          address: {
            recipientName: 'Checkout Buyer',
            phone: '919876543210',
            line1: '10 Collector Street',
            city: 'Hyderabad',
            state: 'Telangana',
            postalCode: '500001',
          },
        },
      });
      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ paymentMode: 'test', amountPaise: 12600 });
      expect(
        (
          await pool.query('SELECT status FROM commerce_orders WHERE id=$1', [
            response.json().orderId,
          ])
        ).rows[0].status,
      ).toBe('pending_payment');
      const confirmed = await testCheckoutApp.inject({
        method: 'POST',
        url: `/api/test-payments/${response.json().orderId}/success`,
        headers,
      });
      expect(confirmed.json()).toEqual({ status: 'paid', duplicate: false });
      expect(
        (
          await testCheckoutApp.inject({
            method: 'POST',
            url: `/api/test-payments/${response.json().orderId}/success`,
            headers,
          })
        ).json(),
      ).toEqual({ status: 'paid', duplicate: true });
      const paid = await pool.query<{ status: string; gateway_payment_id: string }>(
        'SELECT status,gateway_payment_id FROM commerce_orders WHERE id=$1',
        [response.json().orderId],
      );
      expect(paid.rows[0].status).toBe('paid');
      expect(paid.rows[0].gateway_payment_id).toMatch(/^test_pay_/);
      expect(
        (
          await pool.query(
            "SELECT 1 FROM commerce_payments WHERE order_id=$1 AND provider='test' AND status='captured'",
            [response.json().orderId],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await pool.query(
            "SELECT 1 FROM commerce_order_events WHERE order_id=$1 AND status='paid'",
            [response.json().orderId],
          )
        ).rowCount,
      ).toBe(1);
      expect(
        (
          await pool.query('SELECT 1 FROM commerce_notification_outbox WHERE order_id=$1', [
            response.json().orderId,
          ])
        ).rowCount,
      ).toBe(1);
      await pool.query('DELETE FROM commerce_notification_outbox WHERE order_id=$1', [
        response.json().orderId,
      ]);
      for (const action of ['failure', 'cancel'] as const) {
        const pending = await testCheckoutApp.inject({
          method: 'POST',
          url: '/api/checkout/orders',
          headers,
          payload: {
            checkoutKey: randomUUID(),
            items: [{ productId, quantity: 1 }],
            address: {
              recipientName: 'Checkout Buyer',
              phone: '919876543210',
              line1: '10 Collector Street',
              city: 'Hyderabad',
              state: 'Telangana',
              postalCode: '500001',
            },
          },
        });
        expect(pending.statusCode).toBe(201);
        expect(
          (await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [productId]))
            .rows[0].available,
        ).toBe(0);
        const resolved = await testCheckoutApp.inject({
          method: 'POST',
          url: `/api/test-payments/${pending.json().orderId}/${action}`,
          headers,
        });
        expect(resolved.json()).toEqual({ status: 'cancelled', duplicate: false });
        expect(
          (
            await pool.query(
              "SELECT status FROM commerce_payments WHERE order_id=$1 AND provider='test'",
              [pending.json().orderId],
            )
          ).rows[0].status,
        ).toBe(action === 'failure' ? 'failed' : 'cancelled');
        expect(
          (await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [productId]))
            .rows[0].available,
        ).toBe(1);
        expect(
          (
            await testCheckoutApp.inject({
              method: 'POST',
              url: `/api/test-payments/${pending.json().orderId}/${action}`,
              headers,
            })
          ).json().duplicate,
        ).toBe(true);
      }
    } finally {
      await testCheckoutApp.close();
    }
  });

  it('configures loyalty, exposes customer balances and issues idempotent store-credit refunds', async () => {
    const password = 'finance workflow password 123';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const ownerId = randomUUID();
    const buyerId = randomUUID();
    const ownerEmail = `finance-owner-${randomUUID()}@example.com`;
    const buyerEmail = `finance-buyer-${randomUUID()}@example.com`;
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
       VALUES($1,'Finance Owner',$2,$5,'super_admin',now()),
         ($3,'Finance Buyer',$4,$5,'customer',now())`,
      [ownerId, ownerEmail, buyerId, buyerEmail, hash],
    );
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: {
        email: ownerEmail,
        password,
      },
    });
    const buyerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: buyerEmail, password },
    });
    const ownerHeaders = {
      ...origin,
      cookie: String(ownerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': ownerLogin.json().csrfToken,
    };
    const buyerHeaders = {
      ...origin,
      cookie: String(buyerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': buyerLogin.json().csrfToken,
    };
    const policy = await app.inject({
      method: 'POST',
      url: '/api/admin/loyalty-policies',
      headers: ownerHeaders,
      payload: {
        earnPointsPer100Rupees: 5,
        redeemPaisePerPoint: 100,
        minimumRedeemPoints: 10,
        maximumRedeemPoints: 500,
      },
    });
    expect(policy.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/loyalty-policies/${policy.json().policy.id}/activate`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/loyalty-adjustments',
          headers: ownerHeaders,
          payload: {
            customerId: buyerId,
            points: 100,
            reason: 'Opening loyalty balance',
            idempotencyKey: randomUUID(),
          },
        })
      ).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/wallet-adjustments',
          headers: ownerHeaders,
          payload: {
            customerId: buyerId,
            amountPaise: 2000,
            reason: 'Opening store credit',
            idempotencyKey: randomUUID(),
          },
        })
      ).statusCode,
    ).toBe(201);
    const before = await app.inject({ method: 'GET', url: '/api/finance', headers: buyerHeaders });
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json()).toMatchObject({ loyaltyPoints: 100, walletPaise: 2000 });
    const orderId = randomUUID();
    await pool.query(
      `INSERT INTO commerce_orders(id,customer_id,channel,status,subtotal_paise,
        shipping_paise,tax_paise,discount_paise,total_paise)
       VALUES($1,$2,'online','paid',10000,0,0,0,10000)`,
      [orderId, buyerId],
    );
    await pool.query(
      `INSERT INTO commerce_loyalty_entries
        (id,customer_id,order_id,points,kind,reason,source_key)
       VALUES($1,$2,$3,5,'earn','Earned from paid order',$4)`,
      [randomUUID(), buyerId, orderId, `order:${orderId}:earn`],
    );
    const idempotencyKey = randomUUID();
    const refunded = await app.inject({
      method: 'POST',
      url: '/api/admin/refunds',
      headers: ownerHeaders,
      payload: {
        orderId,
        amountPaise: 10000,
        method: 'store_credit',
        reason: 'Customer approved store credit',
        idempotencyKey,
      },
    });
    expect(refunded.statusCode).toBe(201);
    expect(refunded.json().refund).toMatchObject({ status: 'succeeded', method: 'store_credit' });
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/refunds',
          headers: ownerHeaders,
          payload: {
            orderId,
            amountPaise: 10000,
            method: 'store_credit',
            reason: 'Customer approved store credit',
            idempotencyKey,
          },
        })
      ).statusCode,
    ).toBe(409);
    const after = await app.inject({ method: 'GET', url: '/api/finance', headers: buyerHeaders });
    expect(after.json()).toMatchObject({ loyaltyPoints: 100, walletPaise: 12000 });
    expect(
      (await pool.query('SELECT status FROM commerce_orders WHERE id=$1', [orderId])).rows[0]
        .status,
    ).toBe('refunded');
  });

  it('lets a seller issue an offline invoice and safely hands it to a Tally connector', async () => {
    const password = 'billing workflow password 123';
    const hash = await argon2.hash(password, { type: argon2.argon2id });
    const ownerId = randomUUID();
    const sellerId = randomUUID();
    const customerId = randomUUID();
    const ownerEmail = `billing-owner-${randomUUID()}@example.com`;
    const sellerEmail = `billing-seller-${randomUUID()}@example.com`;
    const customerEmail = `billing-customer-${randomUUID()}@example.com`;
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
       VALUES($1,'Billing Owner',$2,$5,'super_admin',now()),
         ($3,'Billing Seller',$4,$5,'seller',now())`,
      [ownerId, ownerEmail, sellerId, sellerEmail, hash],
    );
    await pool.query(
      `INSERT INTO identity_users(id,name,email,password_hash,role,email_verified_at)
       VALUES($1,'Billing Customer',$2,$3,'customer',now())`,
      [customerId, customerEmail, hash],
    );
    const ownerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: {
        email: ownerEmail,
        password,
      },
    });
    const sellerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: sellerEmail, password },
    });
    const customerLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: origin,
      payload: { email: customerEmail, password },
    });
    expect(sellerLogin.statusCode).toBe(200);
    const ownerHeaders = {
      ...origin,
      cookie: String(ownerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': ownerLogin.json().csrfToken,
    };
    const sellerHeaders = {
      ...origin,
      cookie: String(sellerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': sellerLogin.json().csrfToken,
    };
    const customerHeaders = {
      ...origin,
      cookie: String(customerLogin.headers['set-cookie']).split(';')[0],
      'x-csrf-token': customerLogin.json().csrfToken,
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/admin/billing-settings',
          headers: sellerHeaders,
          payload: {
            legalName: 'Tiny Kars',
            invoicePrefix: 'TK',
            defaultTaxBps: 0,
          },
        })
      ).statusCode,
    ).toBe(403);
    const settings = await app.inject({
      method: 'POST',
      url: '/api/admin/billing-settings',
      headers: ownerHeaders,
      payload: { legalName: 'Tiny Kars', invoicePrefix: 'TK', defaultTaxBps: 1800 },
    });
    expect(settings.statusCode).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/billing-settings/${settings.json().settings.id}/activate`,
          headers: ownerHeaders,
        })
      ).statusCode,
    ).toBe(200);
    const productId = randomUUID();
    const productSku = `INVOICE-${randomUUID()}`;
    await pool.query(
      `INSERT INTO catalogue_products
        (id,sku,name,brand,series,price_paise,mrp_paise,available,published_at)
       VALUES($1,$2,'Invoice Car','Acme','Billing',10000,10000,3,now())`,
      [productId, productSku],
    );
    const barcodeLookup = await app.inject({
      method: 'GET',
      url: `/api/billing/products?q=${encodeURIComponent(productSku)}`,
      headers: sellerHeaders,
    });
    expect(barcodeLookup.statusCode).toBe(200);
    expect(barcodeLookup.json().items).toEqual([
      expect.objectContaining({
        id: productId,
        sku: productSku,
        barcode: productSku,
        pricePaise: 10000,
        available: 3,
      }),
    ]);
    const idempotencyKey = randomUUID();
    const issued = await app.inject({
      method: 'POST',
      url: '/api/billing/invoices',
      headers: sellerHeaders,
      payload: {
        channel: 'offline',
        customerName: 'Walk-in Collector',
        customerPhone: '919876543210',
        paymentMethod: 'upi',
        items: [{ productId, quantity: 2 }],
        idempotencyKey,
      },
    });
    expect(issued.statusCode, issued.body).toBe(201);
    expect(issued.json().invoice).toMatchObject({
      channel: 'offline',
      subtotal_paise: 20000,
      tax_paise: 3600,
      total_paise: 23600,
    });
    expect(String(issued.json().invoice.invoice_number)).toMatch(/^TK-\d{4}-\d{6}$/);
    expect(
      (await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [productId]))
        .rows[0].available,
    ).toBe(1);
    const repeated = await app.inject({
      method: 'POST',
      url: '/api/billing/invoices',
      headers: sellerHeaders,
      payload: {
        channel: 'offline',
        customerName: 'Walk-in Collector',
        items: [{ productId, quantity: 2 }],
        idempotencyKey,
      },
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().invoice.id).toBe(issued.json().invoice.id);
    expect(
      (await pool.query('SELECT available FROM catalogue_products WHERE id=$1', [productId]))
        .rows[0].available,
    ).toBe(1);
    const downloaded = await app.inject({
      method: 'GET',
      url: `/api/billing/invoices/${issued.json().invoice.id}/download`,
      headers: sellerHeaders,
    });
    expect(downloaded.statusCode).toBe(200);
    expect(downloaded.headers['content-disposition']).toContain('.html');
    expect(downloaded.body).toContain(productSku);
    const onlineOrderId = randomUUID();
    await pool.query(
      `INSERT INTO commerce_orders
        (id,customer_id,channel,status,subtotal_paise,shipping_paise,tax_paise,discount_paise,
         total_paise,address_snapshot,paid_at,gateway_payment_id)
       VALUES($1,$2,'online','paid',10000,600,0,0,10600,$3,now(),'test_pay_invoice')`,
      [
        onlineOrderId,
        customerId,
        JSON.stringify({
          recipientName: 'Billing Customer',
          phone: '9876543210',
          line1: '1 Invoice Road',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
        }),
      ],
    );
    await pool.query(
      `INSERT INTO commerce_order_items
        (id,order_id,product_id,sku,name,quantity,unit_price_paise,line_total_paise)
       VALUES($1,$2,$3,$4,'Invoice Car',1,10000,10000)`,
      [randomUUID(), onlineOrderId, productId, productSku],
    );
    const onlineInvoice = await app.inject({
      method: 'POST',
      url: '/api/billing/invoices',
      headers: ownerHeaders,
      payload: { channel: 'online', orderId: onlineOrderId, idempotencyKey: randomUUID() },
    });
    expect(onlineInvoice.statusCode, onlineInvoice.body).toBe(201);
    expect(onlineInvoice.json().invoice.payment_method).toBe('test');
    const customerDownload = await app.inject({
      method: 'GET',
      url: `/api/orders/${onlineOrderId}/invoice/download`,
      headers: customerHeaders,
    });
    expect(customerDownload.statusCode).toBe(200);
    expect(customerDownload.headers['content-disposition']).toContain('.html');
    expect(customerDownload.body).toContain(productSku);
    expect(customerDownload.body).toContain('Local test payment');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/billing/invoices',
          headers: sellerHeaders,
          payload: {
            channel: 'online',
            orderId: randomUUID(),
            idempotencyKey: randomUUID(),
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/billing/invoices/${issued.json().invoice.id}/corrections`,
          headers: sellerHeaders,
          payload: {
            kind: 'note',
            reason: 'Seller must not alter invoice history',
            idempotencyKey: randomUUID(),
          },
        })
      ).statusCode,
    ).toBe(403);
    const correctionKey = randomUUID();
    const correction = await app.inject({
      method: 'POST',
      url: `/api/admin/billing/invoices/${issued.json().invoice.id}/corrections`,
      headers: ownerHeaders,
      payload: {
        kind: 'credit_note',
        reason: 'Accountant-approved correction record',
        amountPaise: 1000,
        idempotencyKey: correctionKey,
      },
    });
    expect(correction.statusCode).toBe(201);
    expect(correction.json().correction.correction_number).toMatch(/-C\d{4}$/);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/admin/billing/invoices/${issued.json().invoice.id}/corrections`,
          headers: ownerHeaders,
          payload: {
            kind: 'credit_note',
            reason: 'Accountant-approved correction record',
            amountPaise: 1000,
            idempotencyKey: correctionKey,
          },
        })
      ).statusCode,
    ).toBe(200);
    const correctedInvoice = await app.inject({
      method: 'GET',
      url: `/api/billing/invoices/${issued.json().invoice.id}`,
      headers: ownerHeaders,
    });
    expect(correctedInvoice.json().invoice.total_paise).toBe(23600);
    expect(correctedInvoice.json().invoice.corrections).toHaveLength(1);
    const secondInvoice = await app.inject({
      method: 'POST',
      url: '/api/billing/invoices',
      headers: sellerHeaders,
      payload: {
        channel: 'offline',
        customerName: 'Second Walk-in Collector',
        paymentMethod: 'cash',
        items: [{ productId, quantity: 1 }],
        idempotencyKey: randomUUID(),
      },
    });
    expect(secondInvoice.statusCode).toBe(201);
    const connectorApp = await createApp(pool, {
      ...config,
      tallyConnectorSecret: 'a-strong-tally-connector-secret',
    });
    try {
      expect(
        (
          await connectorApp.inject({
            method: 'POST',
            url: '/api/connectors/tally/claim',
            headers: { authorization: 'Bearer wrong-secret' },
          })
        ).statusCode,
      ).toBe(401);
      const claim = await connectorApp.inject({
        method: 'POST',
        url: '/api/connectors/tally/claim',
        headers: { authorization: 'Bearer a-strong-tally-connector-secret' },
      });
      expect(claim.statusCode).toBe(200);
      const job = claim
        .json()
        .jobs.find(
          (item: { invoice: { id: string } }) => item.invoice.id === issued.json().invoice.id,
        );
      expect(job).toBeTruthy();
      expect(job.exportReference).toBe(job.id);
      expect(job.payload).toMatchObject({
        format: 'tiny-kars-tally-v1',
        exportReference: job.id,
        sale: { channel: 'offline', paymentMethod: 'upi' },
        amounts: { subtotalPaise: 20000, taxPaise: 3600, totalPaise: 23600 },
      });
      const secondJob = claim
        .json()
        .jobs.find(
          (item: { invoice: { id: string } }) =>
            item.invoice.id === secondInvoice.json().invoice.id,
        );
      expect(secondJob).toBeTruthy();
      const completed = await connectorApp.inject({
        method: 'POST',
        url: `/api/connectors/tally/${job.id}/complete`,
        headers: { authorization: 'Bearer a-strong-tally-connector-secret' },
        payload: {
          leaseToken: claim.json().leaseToken,
          success: true,
          externalId: 'TALLY-VOUCHER-1',
        },
      });
      expect(completed.statusCode).toBe(200);
      expect(completed.json().job.status).toBe('sent');
      const duplicateReference = await connectorApp.inject({
        method: 'POST',
        url: `/api/connectors/tally/${secondJob.id}/complete`,
        headers: { authorization: 'Bearer a-strong-tally-connector-secret' },
        payload: {
          leaseToken: claim.json().leaseToken,
          success: true,
          externalId: 'TALLY-VOUCHER-1',
        },
      });
      expect(duplicateReference.statusCode).toBe(409);
      expect(duplicateReference.json().error.code).toBe('TALLY_REFERENCE_EXISTS');
    } finally {
      await connectorApp.close();
    }
  });

  it('sends an opted-in WhatsApp confirmation through the approved template contract', async () => {
    const customer = await pool.query<{ id: string }>(
      'SELECT id FROM identity_users WHERE email=$1',
      [email],
    );
    const orderId = randomUUID();
    await pool.query(
      `INSERT INTO commerce_orders(id,customer_id,channel,status,subtotal_paise,
        shipping_paise,tax_paise,discount_paise,total_paise,address_snapshot,whatsapp_opt_in)
       VALUES($1,$2,'online','paid',12000,500,0,0,12500,$3,true)`,
      [orderId, customer.rows[0].id, JSON.stringify({ phone: '+91 98765 43210' })],
    );
    await pool.query(
      `INSERT INTO commerce_notification_outbox(id,order_id,kind)
       VALUES($1,$2,'whatsapp_payment_confirmed')`,
      [randomUUID(), orderId],
    );
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const transport = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.test-1' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    expect(
      await sendOrderConfirmations(
        pool,
        {
          ...config,
          resendApiKey: undefined,
          emailFrom: undefined,
          metaWhatsAppToken: 'meta-test-token',
          metaWhatsAppPhoneNumberId: '1234567890',
          metaWhatsAppTemplateName: 'tiny_kars_payment_confirmed',
          metaWhatsAppTemplateLanguage: 'en',
          metaGraphApiVersion: 'v24.0',
        },
        transport,
      ),
    ).toBe(1);
    expect(calls[0].url).toBe('https://graph.facebook.com/v24.0/1234567890/messages');
    expect(calls[0].body).toMatchObject({
      messaging_product: 'whatsapp',
      to: '919876543210',
      type: 'template',
      template: { name: 'tiny_kars_payment_confirmed' },
    });
    expect(
      (
        await pool.query(
          'SELECT status,provider_id FROM commerce_notification_outbox WHERE order_id=$1',
          [orderId],
        )
      ).rows[0],
    ).toEqual({ status: 'sent', provider_id: 'wamid.test-1' });
  });

  it('reconciles only signed captured Razorpay payments and handles retries safely', async () => {
    await pool.query('DELETE FROM commerce_notification_outbox');
    const customer = await pool.query<{ id: string }>(
      'SELECT id FROM identity_users WHERE email=$1',
      [email],
    );
    const orderId = randomUUID();
    const gatewayOrderId = `order_${randomBytes(8).toString('hex')}`;
    const paymentId = `pay_${randomBytes(8).toString('hex')}`;
    await pool.query(
      `INSERT INTO commerce_orders(id,customer_id,channel,status,subtotal_paise,
       shipping_paise,tax_paise,discount_paise,total_paise,gateway_order_id)
       VALUES($1,$2,'online','pending_payment',12000,500,0,0,12500,$3)`,
      [orderId, customer.rows[0].id, gatewayOrderId],
    );
    let amount = 12500;
    let providerFails = false;
    const transport = vi.fn(async () => {
      if (providerFails) return new Response('{}', { status: 503 });
      return new Response(
        JSON.stringify({
          id: paymentId,
          order_id: gatewayOrderId,
          amount,
          currency: 'INR',
          status: 'captured',
          captured: true,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }) as unknown as typeof fetch;
    const webhookApp = Fastify();
    const webhookConfig = {
      ...config,
      razorpayKeyId: 'rzp_test_example',
      razorpayKeySecret: 'test-secret',
      razorpayWebhookSecret: 'webhook-secret',
    };
    await registerRazorpayWebhook(webhookApp, pool, webhookConfig, transport);
    const event = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: paymentId, order_id: gatewayOrderId } } },
    });
    const signed = (body: string) => ({
      'content-type': 'application/json',
      'x-razorpay-signature': createHmac('sha256', webhookConfig.razorpayWebhookSecret)
        .update(body)
        .digest('hex'),
    });
    const send = (body: string, signature = signed(body)) =>
      webhookApp.inject({
        method: 'POST',
        url: '/api/webhooks/razorpay',
        headers: signature,
        payload: body,
      });
    try {
      expect(
        (await send(event, { ...signed(event), 'x-razorpay-signature': 'bad' })).statusCode,
      ).toBe(401);
      expect(transport).not.toHaveBeenCalled();
      providerFails = true;
      expect((await send(event)).statusCode).toBe(503);
      expect(
        (await pool.query('SELECT status FROM commerce_orders WHERE id=$1', [orderId])).rows[0]
          .status,
      ).toBe('pending_payment');
      providerFails = false;
      amount = 12000;
      expect((await send(event)).statusCode).toBe(200);
      expect(
        (await pool.query('SELECT status FROM commerce_orders WHERE id=$1', [orderId])).rows[0]
          .status,
      ).toBe('pending_payment');
      const review = await pool.query(
        'SELECT outcome FROM commerce_payment_events WHERE order_id=$1',
        [orderId],
      );
      expect(review.rows[0].outcome).toBe('requires_review');
      // A later valid provider event can still settle the order after the mismatch is resolved.
      amount = 12500;
      const retryEvent = JSON.stringify({ ...JSON.parse(event), created_at: Date.now() });
      expect((await send(retryEvent)).statusCode).toBe(200);
      expect((await send(retryEvent)).json()).toMatchObject({ accepted: true, duplicate: true });
      const settled = await pool.query(
        'SELECT status,gateway_payment_id,paid_at FROM commerce_orders WHERE id=$1',
        [orderId],
      );
      expect(settled.rows[0].status).toBe('paid');
      expect(settled.rows[0].gateway_payment_id).toBe(paymentId);
      expect(settled.rows[0].paid_at).toBeTruthy();
      expect(
        (
          await pool.query(
            "SELECT 1 FROM commerce_order_events WHERE order_id=$1 AND status='paid'",
            [orderId],
          )
        ).rowCount,
      ).toBe(1);
      const notices = await pool.query<{ id: string; status: string }>(
        'SELECT id,status FROM commerce_notification_outbox WHERE order_id=$1',
        [orderId],
      );
      expect(notices.rows).toHaveLength(1);
      expect(notices.rows[0].status).toBe('pending');
      const mailTransport = vi.fn(async (_url: string, init: RequestInit) => {
        const mail = JSON.parse(String(init.body)) as { to: string[]; text: string };
        expect(mail.to).toEqual([email]);
        expect(mail.text).toContain(orderId);
        expect(mail.text).toContain('₹125.00');
        return new Response(JSON.stringify({ id: 'email_provider_1' }), { status: 200 });
      }) as unknown as typeof fetch;
      expect(await sendOrderConfirmations(pool, webhookConfig, mailTransport)).toBe(1);
      expect(await sendOrderConfirmations(pool, webhookConfig, mailTransport)).toBe(0);
      expect(
        (
          await pool.query('SELECT status FROM commerce_notification_outbox WHERE order_id=$1', [
            orderId,
          ])
        ).rows[0].status,
      ).toBe('sent');
    } finally {
      await webhookApp.close();
    }
  });
});
