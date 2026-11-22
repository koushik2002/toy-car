CREATE TABLE commerce_notification_outbox (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES commerce_orders(id),
  kind text NOT NULL CHECK (kind IN ('payment_confirmed')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_owner uuid,
  provider_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE(order_id,kind)
);
CREATE INDEX commerce_notification_outbox_pending_idx
  ON commerce_notification_outbox(status,available_at);
