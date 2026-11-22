CREATE TABLE commerce_shipping_policies (
  id uuid PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('flat','postcode')),
  base_paise integer NOT NULL CHECK (base_paise BETWEEN 0 AND 2147483647),
  free_above_paise integer CHECK (free_above_paise >= 0),
  postcode_rates jsonb NOT NULL DEFAULT '[]'::jsonb,
  active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  CHECK (jsonb_typeof(postcode_rates) = 'array')
);
CREATE UNIQUE INDEX commerce_one_active_shipping_policy ON commerce_shipping_policies(active) WHERE active;
