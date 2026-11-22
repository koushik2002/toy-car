ALTER TABLE commerce_orders
  ADD COLUMN voucher_discount_paise integer NOT NULL DEFAULT 0 CHECK (voucher_discount_paise >= 0),
  ADD COLUMN wallet_applied_paise integer NOT NULL DEFAULT 0 CHECK (wallet_applied_paise >= 0),
  ADD COLUMN loyalty_applied_paise integer NOT NULL DEFAULT 0 CHECK (loyalty_applied_paise >= 0);

CREATE TABLE commerce_loyalty_policies (
  id uuid PRIMARY KEY,
  earn_points_per_100_rupees integer NOT NULL CHECK (earn_points_per_100_rupees BETWEEN 0 AND 100000),
  redeem_paise_per_point integer NOT NULL CHECK (redeem_paise_per_point BETWEEN 1 AND 100000),
  minimum_redeem_points integer NOT NULL DEFAULT 0 CHECK (minimum_redeem_points >= 0),
  maximum_redeem_points integer CHECK (maximum_redeem_points > 0),
  active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);
CREATE UNIQUE INDEX commerce_one_active_loyalty_policy
  ON commerce_loyalty_policies(active) WHERE active;

CREATE TABLE commerce_loyalty_entries (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES identity_users(id),
  order_id uuid REFERENCES commerce_orders(id),
  points integer NOT NULL CHECK (points <> 0),
  kind text NOT NULL CHECK (kind IN ('earn','redeem','reversal','adjustment','expire')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  source_key text NOT NULL UNIQUE,
  created_by uuid REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commerce_loyalty_customer_idx
  ON commerce_loyalty_entries(customer_id,created_at,id);

CREATE TABLE commerce_wallet_entries (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES identity_users(id),
  order_id uuid REFERENCES commerce_orders(id),
  amount_paise integer NOT NULL CHECK (amount_paise <> 0),
  kind text NOT NULL CHECK (kind IN ('refund','checkout','reversal','adjustment')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  source_key text NOT NULL UNIQUE,
  created_by uuid REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commerce_wallet_customer_idx
  ON commerce_wallet_entries(customer_id,created_at,id);

CREATE TABLE commerce_refunds (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES commerce_orders(id),
  customer_id uuid NOT NULL REFERENCES identity_users(id),
  amount_paise integer NOT NULL CHECK (amount_paise > 0),
  method text NOT NULL CHECK (method IN ('store_credit','source')),
  status text NOT NULL CHECK (status IN ('processing','succeeded','failed')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  provider_refund_id text UNIQUE,
  idempotency_key uuid NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX commerce_refunds_order_idx ON commerce_refunds(order_id,created_at,id);

CREATE FUNCTION commerce_protect_financial_entry() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Financial ledger entries are append-only'; END;
$$;
CREATE TRIGGER commerce_loyalty_entry_immutable BEFORE UPDATE OR DELETE ON commerce_loyalty_entries
  FOR EACH ROW EXECUTE FUNCTION commerce_protect_financial_entry();
CREATE TRIGGER commerce_wallet_entry_immutable BEFORE UPDATE OR DELETE ON commerce_wallet_entries
  FOR EACH ROW EXECUTE FUNCTION commerce_protect_financial_entry();
