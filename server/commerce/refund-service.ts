import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

export async function issueFullStoreCreditRefund(
  client: PoolClient,
  input: {
    orderId: string;
    customerId: string;
    amountPaise: number;
    reason: string;
    idempotencyKey: string;
    actorId: string;
    restock: boolean;
  },
) {
  const refundId = randomUUID();
  await client.query(
    `INSERT INTO commerce_refunds
      (id,order_id,customer_id,amount_paise,method,status,reason,idempotency_key,
       created_by,completed_at)
     VALUES($1,$2,$3,$4,'store_credit','succeeded',$5,$6,$7,now())`,
    [
      refundId,
      input.orderId,
      input.customerId,
      input.amountPaise,
      input.reason,
      input.idempotencyKey,
      input.actorId,
    ],
  );
  await client.query(
    `INSERT INTO commerce_wallet_entries
      (id,customer_id,order_id,amount_paise,kind,reason,source_key,created_by)
     VALUES($1,$2,$3,$4,'refund',$5,$6,$7)`,
    [
      randomUUID(),
      input.customerId,
      input.orderId,
      input.amountPaise,
      input.reason,
      `refund:${refundId}`,
      input.actorId,
    ],
  );
  await client.query(
    `INSERT INTO commerce_loyalty_entries
      (id,customer_id,order_id,points,kind,reason,source_key,created_by)
     SELECT $2,$3,$1,-SUM(points)::integer,'reversal','Reversed after full refund',$4,$5
       FROM commerce_loyalty_entries WHERE order_id=$1 AND kind='earn' HAVING SUM(points)>0
     ON CONFLICT(source_key) DO NOTHING`,
    [input.orderId, randomUUID(), input.customerId, `refund:${refundId}:earn`, input.actorId],
  );
  await client.query(
    `INSERT INTO commerce_loyalty_entries
      (id,customer_id,order_id,points,kind,reason,source_key,created_by)
     SELECT $2,$3,$1,-SUM(points)::integer,'reversal','Restored after full refund',$4,$5
       FROM commerce_loyalty_entries WHERE order_id=$1 AND kind='redeem' HAVING SUM(points)<0
     ON CONFLICT(source_key) DO NOTHING`,
    [input.orderId, randomUUID(), input.customerId, `refund:${refundId}:redeem`, input.actorId],
  );
  await client.query(
    `INSERT INTO commerce_wallet_entries
      (id,customer_id,order_id,amount_paise,kind,reason,source_key,created_by)
     SELECT $2,$3,$1,-SUM(amount_paise)::integer,'reversal','Restored after full refund',$4,$5
       FROM commerce_wallet_entries WHERE order_id=$1 AND kind='checkout'
     HAVING SUM(amount_paise)<0 ON CONFLICT(source_key) DO NOTHING`,
    [input.orderId, randomUUID(), input.customerId, `refund:${refundId}:wallet`, input.actorId],
  );
  if (input.restock) {
    const items = await client.query<{ product_id: string; quantity: number }>(
      'SELECT product_id,quantity FROM commerce_order_items WHERE order_id=$1',
      [input.orderId],
    );
    for (const item of items.rows) {
      const stock = await client.query<{ available: number }>(
        `UPDATE catalogue_products SET available=available+$2,updated_at=now()
          WHERE id=$1 RETURNING available`,
        [item.product_id, item.quantity],
      );
      await client.query(
        `INSERT INTO inventory_movements
          (id,product_id,delta,after_available,reason,source_key,actor_id)
         VALUES($1,$2,$3,$4,'Restocked after approved cancellation',$5,$6)`,
        [
          randomUUID(),
          item.product_id,
          item.quantity,
          stock.rows[0].available,
          `refund:${refundId}:${item.product_id}`,
          input.actorId,
        ],
      );
    }
    await client.query(
      `UPDATE inventory_units SET state='available',sold_at=NULL,sale_reference=NULL
        WHERE sale_reference=$1 AND state='sold'`,
      [input.orderId],
    );
    await client.query('DELETE FROM commerce_voucher_redemptions WHERE order_id=$1', [
      input.orderId,
    ]);
  }
  await client.query("UPDATE commerce_orders SET status='refunded',updated_at=now() WHERE id=$1", [
    input.orderId,
  ]);
  await client.query(
    `INSERT INTO commerce_order_events(id,order_id,status,note,actor_id,source_key)
     VALUES($1,$2,'refunded',$3,$4,$5)`,
    [randomUUID(), input.orderId, input.reason, input.actorId, `refund:${refundId}`],
  );
  return refundId;
}
