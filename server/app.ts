import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import type { Pool } from 'pg';
import { registerCatalogueRoutes } from './catalogue/routes.js';
import { registerAdminCatalogueRoutes } from './catalogue/admin.js';
import { registerImportRoutes } from './catalogue/import.js';
import { registerMediaRoutes } from './catalogue/media.js';
import { registerOrderRoutes } from './commerce/orders.js';
import { registerShippingRoutes } from './commerce/shipping.js';
import { registerVoucherRoutes } from './commerce/vouchers.js';
import { registerRazorpayWebhook } from './commerce/webhook.js';
import { registerCheckoutRoutes } from './commerce/checkout.js';
import { registerFinanceRoutes } from './commerce/finance.js';
import { registerBillingRoutes } from './billing/routes.js';
import { registerStorefrontRoutes } from './commerce/storefront.js';
import { registerOperationsRoutes } from './commerce/operations.js';
import { registerCartRoutes } from './commerce/carts.js';
import { registerTestPaymentRoutes } from './commerce/test-payments.js';
import { registerIdentityRoutes, requireIdentityRole } from './identity/routes.js';
import { registerPrivilegedIdentityRoutes } from './identity/privileged.js';
import { registerAuditRoutes } from './identity/audit.js';
import type { ServerConfig } from './config.js';

export async function createApp(
  pool: Pool,
  config: ServerConfig,
  dependencies: { razorpayTransport?: typeof fetch } = {},
) {
  if (config.production && config.paymentTestMode)
    throw new Error('PAYMENT_TEST_MODE cannot be enabled in production.');
  const app = Fastify({
    logger:
      process.env.NODE_ENV === 'test'
        ? false
        : {
            redact: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers.set-cookie',
              'req.body.password',
              'req.body.token',
            ],
          },
    trustProxy: (_address: string, hop: number) => hop === 0,
    bodyLimit: 16384,
    ajv: { customOptions: { removeAdditional: false } },
  });
  await app.register(cookie);
  await app.register(cors, { origin: config.allowedOrigins, credentials: true });
  // A storefront page makes several reads (session, menus, cart, wishlist) and shoppers on a shared
  // mobile network share an IP, so the general ceiling is generous; sign-in has its own throttle.
  await app.register(rateLimit, { max: 600, timeWindow: '1 minute' });
  await app.register(swagger, { openapi: { info: { title: 'Tiny Kars API', version: '0.1.0' } } });
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Request failed');
    const failure = error instanceof Error ? (error as Error & { statusCode?: number }) : null;
    const status = failure?.statusCode && failure.statusCode < 500 ? failure.statusCode : 500;
    const message =
      status >= 500
        ? 'The shop could not complete this request. Please try again.'
        : failure?.message || 'Invalid request.';
    reply.code(status).send({
      error: { code: status >= 500 ? 'SERVER_ERROR' : 'INVALID_REQUEST', message },
      requestId: request.id,
    });
  });
  app.get('/api/health/live', { schema: { tags: ['Operations'] } }, async () => ({ status: 'ok' }));
  app.get('/api/openapi.json', { schema: { tags: ['Operations'] } }, async () => app.swagger());
  app.get('/api/health/ready', { schema: { tags: ['Operations'] } }, async (_request, reply) => {
    await pool.query('SELECT 1');
    return reply.send({ status: 'ready' });
  });
  app.get('/api/config', { schema: { tags: ['Store'] } }, async () => ({
    auth: { emailPassword: true },
    commerce: {
      checkoutEnabled: Boolean(
        config.paymentTestMode ||
        (config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret),
      ),
      paymentMode: config.paymentTestMode
        ? 'test'
        : config.razorpayKeyId && config.razorpayKeySecret && config.razorpayWebhookSecret
          ? 'razorpay'
          : 'disabled',
    },
    catalogue: { publicBrowsing: config.publicBrowsing === true },
  }));
  app.addHook('preHandler', async (request, reply) => {
    const path = request.url.split('?')[0];
    if (
      (path === '/api/products' || path.startsWith('/api/products/')) &&
      !(config.publicBrowsing && request.method === 'GET')
    ) {
      const session = await requireIdentityRole(
        pool,
        request,
        reply,
        {
          ...config,
          emailPasswordEnabled: true,
        },
        ['customer', 'seller', 'staff', 'admin', 'super_admin'],
      );
      if (!session) return reply;
    }
  });
  await registerCatalogueRoutes(app, pool);
  await registerIdentityRoutes(app, pool, {
    emailPasswordEnabled: true,
    production: config.production,
    allowedOrigins: config.allowedOrigins,
    publicWebUrl: config.publicWebUrl,
    outboxEncryptionKey: config.outboxEncryptionKey,
  });
  await registerPrivilegedIdentityRoutes(app, pool, {
    emailPasswordEnabled: true,
    production: config.production,
    allowedOrigins: config.allowedOrigins,
    publicWebUrl: config.publicWebUrl,
    outboxEncryptionKey: config.outboxEncryptionKey,
  });
  await registerAdminCatalogueRoutes(app, pool, {
    emailPasswordEnabled: true,
    production: config.production,
    allowedOrigins: config.allowedOrigins,
    publicWebUrl: config.publicWebUrl,
    outboxEncryptionKey: config.outboxEncryptionKey,
  });
  await registerImportRoutes(app, pool, {
    emailPasswordEnabled: true,
    production: config.production,
    allowedOrigins: config.allowedOrigins,
    publicWebUrl: config.publicWebUrl,
    outboxEncryptionKey: config.outboxEncryptionKey,
  });
  await registerMediaRoutes(app, pool, config);
  await registerOrderRoutes(app, pool, {
    emailPasswordEnabled: true,
    production: config.production,
    allowedOrigins: config.allowedOrigins,
    publicWebUrl: config.publicWebUrl,
    outboxEncryptionKey: config.outboxEncryptionKey,
  });
  await registerShippingRoutes(app, pool, {
    emailPasswordEnabled: true,
    production: config.production,
    allowedOrigins: config.allowedOrigins,
    publicWebUrl: config.publicWebUrl,
    outboxEncryptionKey: config.outboxEncryptionKey,
  });
  await registerVoucherRoutes(app, pool, {
    emailPasswordEnabled: true,
    production: config.production,
    allowedOrigins: config.allowedOrigins,
    publicWebUrl: config.publicWebUrl,
    outboxEncryptionKey: config.outboxEncryptionKey,
  });
  await registerCheckoutRoutes(
    app,
    pool,
    {
      emailPasswordEnabled: true,
      production: config.production,
      allowedOrigins: config.allowedOrigins,
      publicWebUrl: config.publicWebUrl,
      outboxEncryptionKey: config.outboxEncryptionKey,
    },
    config,
    dependencies.razorpayTransport,
  );
  await registerFinanceRoutes(
    app,
    pool,
    {
      emailPasswordEnabled: true,
      production: config.production,
      allowedOrigins: config.allowedOrigins,
      publicWebUrl: config.publicWebUrl,
      outboxEncryptionKey: config.outboxEncryptionKey,
    },
    config,
    dependencies.razorpayTransport,
  );
  await registerBillingRoutes(
    app,
    pool,
    {
      emailPasswordEnabled: true,
      production: config.production,
      allowedOrigins: config.allowedOrigins,
      publicWebUrl: config.publicWebUrl,
      outboxEncryptionKey: config.outboxEncryptionKey,
    },
    config,
  );
  const identity = {
    emailPasswordEnabled: true,
    production: config.production,
    allowedOrigins: config.allowedOrigins,
    publicWebUrl: config.publicWebUrl,
    outboxEncryptionKey: config.outboxEncryptionKey,
  };
  await registerStorefrontRoutes(app, pool, identity);
  await registerCartRoutes(app, pool, identity);
  await registerTestPaymentRoutes(app, pool, identity, config);
  await registerOperationsRoutes(app, pool, identity);
  await registerAuditRoutes(app, pool, identity);
  await registerRazorpayWebhook(app, pool, config, dependencies.razorpayTransport);
  return app;
}
