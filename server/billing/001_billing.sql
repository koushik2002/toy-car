CREATE SEQUENCE billing_invoice_number_seq START WITH 1;

CREATE TABLE billing_settings (
  id uuid PRIMARY KEY,
  legal_name text NOT NULL CHECK (char_length(legal_name) BETWEEN 2 AND 200),
  gstin text CHECK (gstin IS NULL OR gstin ~ '^[0-9A-Z]{15}$'),
  invoice_prefix text NOT NULL CHECK (invoice_prefix ~ '^[A-Z0-9-]{2,12}$'),
  default_tax_bps integer NOT NULL DEFAULT 0 CHECK (default_tax_bps BETWEEN 0 AND 10000),
  active boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz
);
CREATE UNIQUE INDEX billing_one_active_setting ON billing_settings(active) WHERE active;

CREATE TABLE billing_invoices (
  id uuid PRIMARY KEY,
  idempotency_key uuid NOT NULL UNIQUE,
  invoice_number text NOT NULL UNIQUE,
  order_id uuid UNIQUE REFERENCES commerce_orders(id),
  customer_id uuid REFERENCES identity_users(id),
  channel text NOT NULL CHECK (channel IN ('online','offline')),
  customer_name text NOT NULL CHECK (char_length(customer_name) BETWEEN 2 AND 200),
  customer_email text NOT NULL DEFAULT '',
  customer_phone text NOT NULL DEFAULT '',
  subtotal_paise integer NOT NULL CHECK (subtotal_paise >= 0),
  shipping_paise integer NOT NULL DEFAULT 0 CHECK (shipping_paise >= 0),
  discount_paise integer NOT NULL DEFAULT 0 CHECK (discount_paise >= 0),
  tax_paise integer NOT NULL CHECK (tax_paise >= 0),
  total_paise integer NOT NULL CHECK (total_paise = subtotal_paise + shipping_paise + tax_paise - discount_paise),
  settings_snapshot jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_invoices_created_idx ON billing_invoices(created_at DESC,id DESC);

CREATE TABLE billing_invoice_items (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES billing_invoices(id),
  product_id uuid REFERENCES catalogue_products(id),
  sku text NOT NULL,
  name text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  unit_price_paise integer NOT NULL CHECK (unit_price_paise >= 0),
  line_total_paise integer NOT NULL CHECK (line_total_paise = unit_price_paise * quantity)
);
CREATE INDEX billing_invoice_items_invoice_idx ON billing_invoice_items(invoice_id,id);

CREATE TABLE billing_tally_jobs (
  id uuid PRIMARY KEY,
  invoice_id uuid NOT NULL UNIQUE REFERENCES billing_invoices(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_owner uuid,
  external_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX billing_tally_pending_idx ON billing_tally_jobs(status,available_at);

CREATE FUNCTION billing_protect_invoice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Issued invoices are immutable'; END;
$$;
CREATE TRIGGER billing_invoice_immutable BEFORE UPDATE OR DELETE ON billing_invoices
  FOR EACH ROW EXECUTE FUNCTION billing_protect_invoice();
CREATE TRIGGER billing_invoice_item_immutable BEFORE UPDATE OR DELETE ON billing_invoice_items
  FOR EACH ROW EXECUTE FUNCTION billing_protect_invoice();
