import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { Pool, PoolClient } from 'pg';
import type { ServerConfig } from '../config.js';
import type { IdentityConfig } from '../identity/routes.js';
import { requireIdentityRole } from '../identity/routes.js';
import { configuredPaymentGateway } from './payment-gateway.js';
import { shippingCharge } from './shipping.js';

type CheckoutItem = { productId: string; quantity: number };
type Address = {
  recipientName: string;
  phone: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
};
type ProductRow = {
  id: string;
  sku: string;
  name: string;
  price_paise: number;
  available: number;
  serial_tracking: boolean;
};
type VoucherRow = {
  id: string;
  code: string;
  kind: 'fixed' | 'percent';
  value: number;
  max_discount_paise: number | null;
  minimum_subtotal_paise: number;
  use_scope: 'global_once' | 'once_per_customer';
};
type PolicyRow = {
  id: string;
  mode: 'flat' | 'postcode';
  base_paise: number;
  free_above_paise: number | null;
  postcode_rates: { prefix: string; amountPaise: number; name?: string }[];
};
type ExistingOrder = {
  id: string;
  gateway_order_id: string | null;
  total_paise: number;
  subtotal_paise: number;
  shipping_paise: number;
  discount_paise: number;
  voucher_discount_paise: number;
  wallet_applied_paise: number;
  loyalty_applied_paise: number;
  payment_expires_at: Date | null;
};

export class CheckoutFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function fail(reply: FastifyReply, status: number, code: string, message: string) {
  return reply.code(status).send({ error: { code, message }, requestId: reply.request.id });
}

function checkoutResponse(order: ExistingOrder, paymentMode: 'test' | 'razorpay', keyId?: string) {
  return {
    orderId: order.id,
    providerOrderId: order.gateway_order_id,
    keyId: keyId || null,
    paymentMode,
    currency: 'INR',
    amountPaise: order.total_paise,
    subtotalPaise: order.subtotal_paise,
    shippingPaise: order.shipping_paise,
    discountPaise: order.discount_paise,
    voucherDiscountPaise: order.voucher_discount_paise,
    walletAppliedPaise: order.wallet_applied_paise,
    loyaltyAppliedPaise: order.loyalty_applied_paise,
    expiresAt: order.payment_expires_at,
  };
}

const itemSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['productId', 'quantity'],
  properties: {
    productId: { type: 'string', format: 'uuid' },
    quantity: { type: 'integer', minimum: 1, maximum: 100 },
  },
} as const;

export type PricingInput = {
  items: CheckoutItem[];
  postalCode?: string;
  voucherCode?: string;
  walletPaise?: number;
  redeemPoints?: number;
};

/** Prices a checkout inside the caller's transaction. Shared by the quote and order routes. */
export async function priceCheckout(client: PoolClient, customerId: string, input: PricingInput) {
  const items = input.items;
  const ids = items.map((item) => item.productId);
  const products = await client.query<ProductRow>(
    `SELECT id,sku,name,price_paise,available,serial_tracking
       FROM catalogue_products
      WHERE id=ANY($1::uuid[]) AND published_at IS NOT NULL
      ORDER BY id FOR UPDATE`,
    [ids],
  );
  if (products.rows.length !== ids.length)
    throw new CheckoutFailure(409, 'PRODUCT_UNAVAILABLE', 'A product is no longer available.');
  const byId = new Map(products.rows.map((row) => [row.id, row]));
  let subtotalPaise = 0;
  for (const item of items) {
    const product = byId.get(item.productId)!;
    if (product.available < item.quantity)
      throw new CheckoutFailure(
        409,
        'INSUFFICIENT_STOCK',
        `${product.name} does not have enough stock.`,
      );
    subtotalPaise += product.price_paise * item.quantity;
  }
  if (!Number.isSafeInteger(subtotalPaise) || subtotalPaise > 2147483647)
    throw new CheckoutFailure(400, 'ORDER_TOO_LARGE', 'This order total is too large.');

  const policy = await client.query<PolicyRow>(
    'SELECT * FROM commerce_shipping_policies WHERE active=true FOR SHARE',
  );
  if (!policy.rowCount)
    throw new CheckoutFailure(
      503,
      'SHIPPING_NOT_CONFIGURED',
      'Shipping charges are not available yet.',
    );
  let shipping: ReturnType<typeof shippingCharge>;
  try {
    shipping = shippingCharge(policy.rows[0], subtotalPaise, input.postalCode);
  } catch (error) {
    throw new CheckoutFailure(400, 'POSTAL_CODE_REQUIRED', (error as Error).message);
  }
  const shippingPaise = shipping.amountPaise;
  let voucherDiscountPaise = 0;
  let voucher: VoucherRow | undefined;
  if (input.voucherCode) {
    const result = await client.query<VoucherRow>(
      `SELECT id,code,kind,value,max_discount_paise,minimum_subtotal_paise,use_scope
         FROM commerce_vouchers
        WHERE code=$1 AND active=true AND starts_at<=now() AND expires_at>now()
        FOR UPDATE`,
      [input.voucherCode.toUpperCase()],
    );
    if (!result.rowCount)
      throw new CheckoutFailure(409, 'VOUCHER_UNAVAILABLE', 'This code is not available.');
    voucher = result.rows[0];
    const used = await client.query<{ any_use: boolean; customer_use: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM commerce_voucher_redemptions WHERE voucher_id=$1) AS any_use,
        EXISTS(SELECT 1 FROM commerce_voucher_redemptions
          WHERE voucher_id=$1 AND customer_id=$2) AS customer_use`,
      [voucher.id, customerId],
    );
    if ((voucher.use_scope === 'global_once' && used.rows[0].any_use) || used.rows[0].customer_use)
      throw new CheckoutFailure(409, 'VOUCHER_USED', 'This code has already been used.');
    if (subtotalPaise < voucher.minimum_subtotal_paise)
      throw new CheckoutFailure(
        409,
        'MINIMUM_NOT_MET',
        'This order does not reach the code minimum.',
      );
    const raw =
      voucher.kind === 'fixed'
        ? voucher.value
        : Math.floor((subtotalPaise * voucher.value) / 10000);
    voucherDiscountPaise = Math.min(subtotalPaise, raw, voucher.max_discount_paise ?? 2147483647);
  }
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [customerId]);
  const walletPaise = input.walletPaise || 0;
  if (walletPaise) {
    const balance = await client.query<{ balance: number }>(
      `SELECT COALESCE(SUM(amount_paise),0)::integer AS balance
         FROM commerce_wallet_entries WHERE customer_id=$1`,
      [customerId],
    );
    if (balance.rows[0].balance < walletPaise)
      throw new CheckoutFailure(
        409,
        'INSUFFICIENT_CREDIT',
        'Your store-credit balance is too low.',
      );
  }
  const redeemPoints = input.redeemPoints || 0;
  let loyaltyAppliedPaise = 0;
  if (redeemPoints) {
    const result = await client.query<{
      redeem_paise_per_point: number;
      minimum_redeem_points: number;
      maximum_redeem_points: number | null;
    }>('SELECT * FROM commerce_loyalty_policies WHERE active=true');
    if (!result.rowCount)
      throw new CheckoutFailure(409, 'LOYALTY_UNAVAILABLE', 'Loyalty redemption is not active.');
    const rule = result.rows[0];
    if (redeemPoints < rule.minimum_redeem_points)
      throw new CheckoutFailure(
        409,
        'LOYALTY_MINIMUM',
        `Redeem at least ${rule.minimum_redeem_points} points.`,
      );
    if (rule.maximum_redeem_points && redeemPoints > rule.maximum_redeem_points)
      throw new CheckoutFailure(
        409,
        'LOYALTY_MAXIMUM',
        `Redeem no more than ${rule.maximum_redeem_points} points.`,
      );
    const balance = await client.query<{ balance: number }>(
      `SELECT COALESCE(SUM(points),0)::integer AS balance
         FROM commerce_loyalty_entries WHERE customer_id=$1`,
      [customerId],
    );
    if (balance.rows[0].balance < redeemPoints)
      throw new CheckoutFailure(
        409,
        'INSUFFICIENT_POINTS',
        'Your loyalty-points balance is too low.',
      );
    loyaltyAppliedPaise = redeemPoints * rule.redeem_paise_per_point;
  }
  const discountPaise = voucherDiscountPaise + walletPaise + loyaltyAppliedPaise;
  const totalPaise = subtotalPaise + shippingPaise - discountPaise;
  if (totalPaise < 100)
    throw new CheckoutFailure(
      409,
      'PAYMENT_AMOUNT_TOO_LOW',
      'The amount payable must be at least ₹1.',
    );
  return {
    byId,
    subtotalPaise,
    shippingPaise,
    freeShippingApplied: shipping.freeShippingApplied,
    freeAbovePaise: policy.rows[0].free_above_paise,
    shippingPolicyId: policy.rows[0].id,
    shippingZone: shipping.zone,
    voucher,
    voucherDiscountPaise,
    walletPaise,
    redeemPoints,
    loyaltyAppliedPaise,
    discountPaise,
    totalPaise,
  };
}

export async function registerCheckoutRoutes(
  app: FastifyInstance,
  pool: Pool,
  auth: IdentityConfig,
  config: ServerConfig,
  transport: typeof fetch = fetch,
) {
  app.post<{
    Body: {
      checkoutKey: string;
      items: CheckoutItem[];
      address: Address;
      voucherCode?: string;
      walletPaise?: number;
      redeemPoints?: number;
      whatsappOptIn?: boolean;
    };
  }>(
    '/api/checkout/orders',
    {
      schema: {
        tags: ['Checkout'],
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['checkoutKey', 'items', 'address'],
          properties: {
            checkoutKey: { type: 'string', format: 'uuid' },
            items: { type: 'array', minItems: 1, maxItems: 20, items: itemSchema },
            voucherCode: { type: 'string', pattern: '^[A-Za-z0-9-]{4,32}$' },
            walletPaise: { type: 'integer', minimum: 0, maximum: 2147483647 },
            redeemPoints: { type: 'integer', minimum: 0, maximum: 2147483647 },
            whatsappOptIn: { type: 'boolean' },
            address: {
              type: 'object',
              additionalProperties: false,
              required: ['recipientName', 'phone', 'line1', 'city', 'state', 'postalCode'],
              properties: {
                recipientName: { type: 'string', minLength: 2, maxLength: 120 },
                phone: { type: 'string', pattern: '^\\+?[1-9][0-9]{7,14}$' },
                line1: { type: 'string', minLength: 3, maxLength: 200 },
                line2: { type: 'string', maxLength: 200 },
                city: { type: 'string', minLength: 2, maxLength: 100 },
                state: { type: 'string', minLength: 2, maxLength: 100 },
                postalCode: { type: 'string', pattern: '^[1-9][0-9]{5}$' },
              },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const session = await requireIdentityRole(pool, request, reply, auth, ['customer']);
      if (!session) return reply;
      const gateway = configuredPaymentGateway(config, transport);
      if (!gateway)
        return fail(
          reply,
          503,
          'PAYMENTS_NOT_CONFIGURED',
          'Online payment is not available yet. Please try again later.',
        );
      const paymentMode = gateway.provider;
      const { checkoutKey, items, address } = request.body;
      const ids = items.map((item) => item.productId);
      if (new Set(ids).size !== ids.length)
        return fail(reply, 400, 'DUPLICATE_PRODUCT', 'List each product once.');

      const previous = await pool.query<ExistingOrder>(
        `SELECT id,gateway_order_id,total_paise,subtotal_paise,shipping_paise,
          discount_paise,voucher_discount_paise,wallet_applied_paise,
          loyalty_applied_paise,payment_expires_at FROM commerce_orders
         WHERE customer_id=$1 AND checkout_key=$2`,
        [session.user.id, checkoutKey],
      );
      if (previous.rowCount && previous.rows[0].gateway_order_id)
        return reply
          .header('Cache-Control', 'no-store')
          .send(checkoutResponse(previous.rows[0], paymentMode, config.razorpayKeyId));

      const orderId = randomUUID();
      const expiry = new Date(Date.now() + 15 * 60 * 1000);
      const client = await pool.connect();
      let created: ExistingOrder | undefined;
      try {
        await client.query('BEGIN');
        const {
          byId,
          subtotalPaise,
          shippingPaise,
          voucher,
          voucherDiscountPaise,
          walletPaise,
          redeemPoints,
          loyaltyAppliedPaise,
          discountPaise,
          totalPaise,
          shippingPolicyId,
          shippingZone,
        } = await priceCheckout(client, session.user.id, {
          items,
          postalCode: address.postalCode,
          voucherCode: request.body.voucherCode,
          walletPaise: request.body.walletPaise,
          redeemPoints: request.body.redeemPoints,
        });

        await client.query(
          `INSERT INTO commerce_orders
            (id,customer_id,channel,status,subtotal_paise,shipping_paise,tax_paise,
             discount_paise,total_paise,address_snapshot,checkout_key,payment_expires_at,
             voucher_discount_paise,wallet_applied_paise,loyalty_applied_paise,whatsapp_opt_in,
             shipping_policy_id,shipping_zone)
           VALUES($1,$2,'online','pending_payment',$3,$4,0,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            orderId,
            session.user.id,
            subtotalPaise,
            shippingPaise,
            discountPaise,
            totalPaise,
            JSON.stringify(address),
            checkoutKey,
            expiry,
            voucherDiscountPaise,
            walletPaise,
            loyaltyAppliedPaise,
            request.body.whatsappOptIn === true,
            shippingPolicyId,
            shippingZone,
          ],
        );
        for (const item of items) {
          const product = byId.get(item.productId)!;
          await client.query(
            `INSERT INTO commerce_order_items
              (id,order_id,product_id,sku,name,quantity,unit_price_paise,line_total_paise)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              randomUUID(),
              orderId,
              product.id,
              product.sku,
              product.name,
              item.quantity,
              product.price_paise,
              product.price_paise * item.quantity,
            ],
          );
          const updated = await client.query<{ available: number }>(
            `UPDATE catalogue_products SET available=available-$2,updated_at=now()
              WHERE id=$1 RETURNING available`,
            [product.id, item.quantity],
          );
          await client.query(
            `INSERT INTO inventory_movements
              (id,product_id,delta,after_available,reason,source_key,actor_id)
             VALUES($1,$2,$3,$4,'Reserved for online checkout',$5,$6)`,
            [
              randomUUID(),
              product.id,
              -item.quantity,
              updated.rows[0].available,
              `checkout:${orderId}:${product.id}`,
              session.user.id,
            ],
          );
          if (product.serial_tracking) {
            const reserved = await client.query(
              `UPDATE inventory_units SET state='reserved',sale_reference=$2
                WHERE id IN (
                  SELECT id FROM inventory_units
                   WHERE product_id=$1 AND state='available'
                   ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT $3
                ) RETURNING id`,
              [product.id, orderId, item.quantity],
            );
            if (reserved.rows.length !== item.quantity)
              throw new CheckoutFailure(
                409,
                'SERIAL_STOCK_MISMATCH',
                `${product.name} inventory needs an administrator to reconcile its serials.`,
              );
          }
        }
        if (voucher)
          await client.query(
            `INSERT INTO commerce_voucher_redemptions
              (id,voucher_id,customer_id,order_id,discount_paise)
             VALUES($1,$2,$3,$4,$5)`,
            [randomUUID(), voucher.id, session.user.id, orderId, voucherDiscountPaise],
          );
        if (walletPaise)
          await client.query(
            `INSERT INTO commerce_wallet_entries
              (id,customer_id,order_id,amount_paise,kind,reason,source_key)
             VALUES($1,$2,$3,$4,'checkout','Applied to online checkout',$5)`,
            [randomUUID(), session.user.id, orderId, -walletPaise, `checkout:${orderId}`],
          );
        if (redeemPoints)
          await client.query(
            `INSERT INTO commerce_loyalty_entries
              (id,customer_id,order_id,points,kind,reason,source_key)
             VALUES($1,$2,$3,$4,'redeem','Applied to online checkout',$5)`,
            [randomUUID(), session.user.id, orderId, -redeemPoints, `checkout:${orderId}`],
          );
        await client.query(
          `INSERT INTO commerce_order_events(id,order_id,status,note,source_key)
           VALUES($1,$2,'pending_payment','Checkout created',$3)`,
          [randomUUID(), orderId, `checkout:${checkoutKey}`],
        );

        const providerOrder = await gateway.createOrder(
          totalPaise,
          `tk_${orderId.replaceAll('-', '')}`,
          orderId,
        );
        const providerOrderId = providerOrder.id;
        const result = await client.query<ExistingOrder>(
          `UPDATE commerce_orders SET gateway_order_id=$2,updated_at=now()
            WHERE id=$1 RETURNING id,gateway_order_id,total_paise,subtotal_paise,
              shipping_paise,discount_paise,voucher_discount_paise,wallet_applied_paise,
              loyalty_applied_paise,payment_expires_at`,
          [orderId, providerOrderId],
        );
        created = result.rows[0];
        await client.query(
          `INSERT INTO commerce_payments
            (id,order_id,provider,amount_paise,status,source_key)
           VALUES($1,$2,$3,$4,'pending',$5)`,
          [randomUUID(), orderId, gateway.provider, totalPaise, `payment-order:${orderId}`],
        );
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        if ((error as { code?: string }).code === '23505') {
          const existing = await pool.query<ExistingOrder>(
            `SELECT id,gateway_order_id,total_paise,subtotal_paise,shipping_paise,
              discount_paise,voucher_discount_paise,wallet_applied_paise,
              loyalty_applied_paise,payment_expires_at FROM commerce_orders
             WHERE customer_id=$1 AND checkout_key=$2`,
            [session.user.id, checkoutKey],
          );
          if (existing.rowCount && existing.rows[0].gateway_order_id)
            return reply
              .header('Cache-Control', 'no-store')
              .send(checkoutResponse(existing.rows[0], paymentMode, config.razorpayKeyId));
        }
        if (error instanceof CheckoutFailure)
          return fail(reply, error.status, error.code, error.message);
        request.log.error({ err: error }, 'Checkout creation failed');
        return fail(
          reply,
          503,
          'CHECKOUT_UNAVAILABLE',
          'Checkout is temporarily unavailable. No payment was taken.',
        );
      } finally {
        client.release();
      }
      return reply
        .code(201)
        .header('Cache-Control', 'no-store')
        .send(checkoutResponse(created!, paymentMode, config.razorpayKeyId));
    },
  );
}

export async function expirePendingCheckouts(pool: Pool, limit = 20) {
  const client = await pool.connect();
  let expired = 0;
  try {
    await client.query('BEGIN');
    const orders = await client.query<{ id: string }>(
      `SELECT id FROM commerce_orders
        WHERE status='pending_payment' AND payment_expires_at<now()
        ORDER BY payment_expires_at,id FOR UPDATE SKIP LOCKED LIMIT $1`,
      [limit],
    );
    for (const order of orders.rows) {
      const items = await client.query<{ product_id: string; quantity: number }>(
        `SELECT product_id,quantity FROM commerce_order_items WHERE order_id=$1 ORDER BY product_id`,
        [order.id],
      );
      for (const item of items.rows) {
        const product = await client.query<{ available: number }>(
          `UPDATE catalogue_products SET available=available+$2,updated_at=now()
            WHERE id=$1 RETURNING available`,
          [item.product_id, item.quantity],
        );
        await client.query(
          `INSERT INTO inventory_movements
            (id,product_id,delta,after_available,reason,source_key)
           VALUES($1,$2,$3,$4,'Released expired online checkout',$5)`,
          [
            randomUUID(),
            item.product_id,
            item.quantity,
            product.rows[0].available,
            `checkout-expired:${order.id}:${item.product_id}`,
          ],
        );
      }
      await client.query(
        `UPDATE inventory_units SET state='available',sale_reference=NULL
          WHERE sale_reference=$1 AND state='reserved'`,
        [order.id],
      );
      await client.query('DELETE FROM commerce_voucher_redemptions WHERE order_id=$1', [order.id]);
      await client.query(
        `INSERT INTO commerce_wallet_entries
          (id,customer_id,order_id,amount_paise,kind,reason,source_key)
         SELECT $2,customer_id,order_id,-amount_paise,'reversal','Released expired checkout',$3
           FROM commerce_wallet_entries WHERE order_id=$1 AND kind='checkout'
         ON CONFLICT (source_key) DO NOTHING`,
        [order.id, randomUUID(), `checkout-expired:${order.id}`],
      );
      await client.query(
        `INSERT INTO commerce_loyalty_entries
          (id,customer_id,order_id,points,kind,reason,source_key)
         SELECT $2,customer_id,order_id,-points,'reversal','Released expired checkout',$3
           FROM commerce_loyalty_entries WHERE order_id=$1 AND kind='redeem'
         ON CONFLICT (source_key) DO NOTHING`,
        [order.id, randomUUID(), `checkout-expired:${order.id}`],
      );
      await client.query(
        `UPDATE commerce_orders SET status='cancelled',updated_at=now() WHERE id=$1`,
        [order.id],
      );
      await client.query(
        `INSERT INTO commerce_order_events(id,order_id,status,note,source_key)
         VALUES($1,$2,'cancelled','Payment window expired',$3)`,
        [randomUUID(), order.id, `checkout-expired:${order.id}`],
      );
      expired += 1;
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return expired;
}
