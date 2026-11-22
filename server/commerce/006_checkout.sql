ALTER TABLE commerce_orders
  ADD COLUMN checkout_key uuid,
  ADD COLUMN payment_expires_at timestamptz;

CREATE UNIQUE INDEX commerce_orders_customer_checkout_key
  ON commerce_orders(customer_id, checkout_key)
  WHERE checkout_key IS NOT NULL;

CREATE INDEX commerce_orders_pending_expiry_idx
  ON commerce_orders(payment_expires_at, id)
  WHERE status='pending_payment';
