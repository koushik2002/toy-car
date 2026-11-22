ALTER TABLE commerce_orders DROP CONSTRAINT commerce_orders_status_check;
ALTER TABLE commerce_orders ADD CONSTRAINT commerce_orders_status_check
  CHECK (status IN ('pending_payment','paid','processing','shipped','out_for_delivery',
    'delivered','cancelled','refund_pending','refunded'));

ALTER TABLE commerce_orders
  ADD COLUMN shipping_policy_id uuid REFERENCES commerce_shipping_policies(id),
  ADD COLUMN shipping_zone text NOT NULL DEFAULT '' CHECK (char_length(shipping_zone) <= 100),
  ADD COLUMN out_for_delivery_at timestamptz,
  ADD COLUMN out_for_delivery_by uuid REFERENCES identity_users(id);

ALTER TABLE commerce_order_requests
  ADD COLUMN refund_preference text NOT NULL DEFAULT 'source'
    CHECK (refund_preference IN ('source','store_credit'));

ALTER TABLE commerce_payments DROP CONSTRAINT commerce_payments_status_check;
ALTER TABLE commerce_payments ADD CONSTRAINT commerce_payments_status_check
  CHECK (status IN ('pending','captured','failed','cancelled','refunded'));
CREATE UNIQUE INDEX commerce_one_pending_payment_attempt
  ON commerce_payments(order_id) WHERE status='pending';
