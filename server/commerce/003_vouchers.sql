CREATE TABLE commerce_vouchers (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9-]{4,32}$'),
  kind text NOT NULL CHECK (kind IN ('fixed','percent')),
  value integer NOT NULL CHECK (value > 0),
  max_discount_paise integer CHECK (max_discount_paise > 0),
  minimum_subtotal_paise integer NOT NULL DEFAULT 0 CHECK (minimum_subtotal_paise >= 0),
  use_scope text NOT NULL CHECK (use_scope IN ('global_once','once_per_customer')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > starts_at),
  CHECK (kind <> 'percent' OR value BETWEEN 1 AND 10000)
);
CREATE TABLE commerce_voucher_redemptions (
  id uuid PRIMARY KEY,
  voucher_id uuid NOT NULL REFERENCES commerce_vouchers(id),
  customer_id uuid NOT NULL REFERENCES identity_users(id),
  order_id uuid NOT NULL UNIQUE REFERENCES commerce_orders(id),
  discount_paise integer NOT NULL CHECK (discount_paise > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(voucher_id,customer_id)
);
CREATE INDEX commerce_voucher_redemptions_voucher_idx ON commerce_voucher_redemptions(voucher_id);
