CREATE TABLE commerce_orders (
  id uuid PRIMARY KEY,
  customer_id uuid REFERENCES identity_users(id),
  channel text NOT NULL CHECK (channel IN ('online','offline')),
  status text NOT NULL CHECK (status IN ('pending_payment','paid','processing','shipped','delivered','cancelled','refund_pending','refunded')),
  subtotal_paise integer NOT NULL CHECK (subtotal_paise >= 0),
  shipping_paise integer NOT NULL CHECK (shipping_paise >= 0),
  tax_paise integer NOT NULL CHECK (tax_paise >= 0),
  discount_paise integer NOT NULL CHECK (discount_paise >= 0),
  total_paise integer NOT NULL CHECK (total_paise >= 0),
  address_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  gateway_order_id text UNIQUE,
  gateway_payment_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  delivered_at timestamptz,
  delivered_by uuid REFERENCES identity_users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (total_paise = subtotal_paise + shipping_paise + tax_paise - discount_paise),
  CHECK (channel <> 'online' OR customer_id IS NOT NULL)
);
CREATE INDEX commerce_orders_customer_idx ON commerce_orders(customer_id,created_at DESC,id DESC);
CREATE INDEX commerce_orders_status_idx ON commerce_orders(status,created_at DESC);

CREATE TABLE commerce_order_items (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES commerce_orders(id),
  product_id uuid NOT NULL REFERENCES catalogue_products(id),
  sku text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  unit_price_paise integer NOT NULL CHECK (unit_price_paise >= 0),
  line_total_paise integer NOT NULL CHECK (line_total_paise = unit_price_paise * quantity)
);
CREATE INDEX commerce_order_items_order_idx ON commerce_order_items(order_id);

CREATE TABLE commerce_order_events (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES commerce_orders(id),
  status text NOT NULL,
  note text NOT NULL DEFAULT '',
  actor_id uuid REFERENCES identity_users(id),
  source_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commerce_order_events_order_idx ON commerce_order_events(order_id,created_at,id);
CREATE FUNCTION commerce_protect_order_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Order events are append-only'; END;
$$;
CREATE TRIGGER commerce_order_event_immutable BEFORE UPDATE OR DELETE ON commerce_order_events
  FOR EACH ROW EXECUTE FUNCTION commerce_protect_order_event();
