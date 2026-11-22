import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export type PayableOrder = {
  id: string;
  status: string;
  customer_id: string;
  subtotal_paise: number;
  total_paise: number;
  voucher_discount_paise: number;
  wallet_applied_paise: number;
  loyalty_applied_paise: number;
  whatsapp_opt_in: boolean;
  gateway_payment_id: string | null;
};

/**
 * Applies the provider-independent effects of a confirmed payment inside the caller's transaction.
 * The caller must lock and verify the order and payment before invoking this function.
 */
export async function confirmPaidOrder(
  client: PoolClient,
  order: PayableOrder,
  paymentId: string,
  sourceKey: string,
  note: string,
  enqueueNotifications = true,
) {
  await client.query(
    `UPDATE commerce_orders SET status='paid',gateway_payment_id=$2,
       paid_at=now(),payment_expires_at=NULL,updated_at=now() WHERE id=$1`,
    [order.id, paymentId],
  );
  const provider = paymentId.startsWith('test_pay_') ? 'test' : 'razorpay';
  const payment = await client.query(
    `UPDATE commerce_payments SET status='captured',provider_payment_id=$3,captured_at=now()
       WHERE order_id=$1 AND provider=$2 AND status='pending' RETURNING id`,
    [order.id, provider, paymentId],
  );
  if (!payment.rowCount)
    await client.query(
      `INSERT INTO commerce_payments
        (id,order_id,provider,provider_payment_id,amount_paise,status,source_key,captured_at)
       VALUES($1,$2,$3,$4,$5,'captured',$6,now()) ON CONFLICT(source_key) DO NOTHING`,
      [randomUUID(), order.id, provider, paymentId, order.total_paise, sourceKey],
    );
  await client.query(
    `UPDATE inventory_units SET state='sold',sold_at=now()
      WHERE sale_reference=$1 AND state='reserved'`,
    [order.id],
  );
  await client.query(
    `INSERT INTO commerce_order_item_units(order_item_id,unit_id,serial_code)
     SELECT oi.id,u.id,u.serial_code FROM inventory_units u
       JOIN commerce_order_items oi ON oi.order_id=$1::uuid AND oi.product_id=u.product_id
      WHERE u.sale_reference=$1::text AND u.state='sold'
     ON CONFLICT(unit_id) DO NOTHING`,
    [order.id],
  );
  const loyalty = await client.query<{ earn_points_per_100_rupees: number }>(
    'SELECT earn_points_per_100_rupees FROM commerce_loyalty_policies WHERE active=true',
  );
  if (loyalty.rowCount) {
    const eligiblePaise = Math.max(
      0,
      order.subtotal_paise -
        order.voucher_discount_paise -
        order.wallet_applied_paise -
        order.loyalty_applied_paise,
    );
    const points = Math.floor(eligiblePaise / 10000) * loyalty.rows[0].earn_points_per_100_rupees;
    if (points > 0)
      await client.query(
        `INSERT INTO commerce_loyalty_entries
          (id,customer_id,order_id,points,kind,reason,source_key)
         VALUES($1,$2,$3,$4,'earn','Earned from paid order',$5)
         ON CONFLICT (source_key) DO NOTHING`,
        [randomUUID(), order.customer_id, order.id, points, `order:${order.id}:earn`],
      );
  }
  await client.query(
    `INSERT INTO commerce_order_events(id,order_id,status,note,source_key)
     VALUES ($1,$2,'paid',$3,$4)`,
    [randomUUID(), order.id, note, sourceKey],
  );
  if (enqueueNotifications)
    await client.query(
      `INSERT INTO commerce_notification_outbox(id,order_id,kind)
       VALUES ($1,$2,'payment_confirmed') ON CONFLICT (order_id,kind) DO NOTHING`,
      [randomUUID(), order.id],
    );
  if (enqueueNotifications && order.whatsapp_opt_in)
    await client.query(
      `INSERT INTO commerce_notification_outbox(id,order_id,kind)
       VALUES ($1,$2,'whatsapp_payment_confirmed')
       ON CONFLICT (order_id,kind) DO NOTHING`,
      [randomUUID(), order.id],
    );
}
