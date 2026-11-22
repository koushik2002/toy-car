CREATE TABLE commerce_payment_events (
  body_sha256 char(64) PRIMARY KEY,
  provider_payment_id text NOT NULL,
  provider_order_id text NOT NULL,
  order_id uuid REFERENCES commerce_orders(id),
  outcome text NOT NULL CHECK (outcome IN ('paid','duplicate','requires_review')),
  reason text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commerce_payment_events_order_idx ON commerce_payment_events(order_id,received_at DESC);
