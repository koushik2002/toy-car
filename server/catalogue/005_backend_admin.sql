-- Normalized catalogue reference data. The text columns on catalogue_products remain immutable
-- sale/display snapshots; these foreign keys provide canonical management relationships.
CREATE TABLE identity_roles (
  code text PRIMARY KEY CHECK (code IN ('customer','seller','staff','admin','super_admin')),
  privileged boolean NOT NULL
);
INSERT INTO identity_roles(code,privileged) VALUES
  ('customer',false),('seller',true),('staff',true),('admin',true),('super_admin',true);
ALTER TABLE identity_users ADD CONSTRAINT identity_users_role_fk
  FOREIGN KEY(role) REFERENCES identity_roles(code);

CREATE TABLE catalogue_brands (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  name_key text NOT NULL UNIQUE CHECK (name_key = lower(name_key)),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalogue_series (
  id uuid PRIMARY KEY,
  brand_id uuid NOT NULL REFERENCES catalogue_brands(id),
  name text NOT NULL CHECK (char_length(name) <= 100),
  name_key text NOT NULL CHECK (name_key = lower(name_key)),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand_id, name_key)
);

CREATE TABLE catalogue_variant_groups (
  id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (char_length(code) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE catalogue_product_variants (
  product_id uuid PRIMARY KEY REFERENCES catalogue_products(id) ON DELETE CASCADE,
  group_id uuid REFERENCES catalogue_variant_groups(id),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 160),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalogue_product_variants_group_idx ON catalogue_product_variants(group_id, product_id);

ALTER TABLE catalogue_products
  ADD COLUMN brand_id uuid REFERENCES catalogue_brands(id),
  ADD COLUMN series_id uuid REFERENCES catalogue_series(id),
  ADD COLUMN requires_review boolean NOT NULL DEFAULT false;
CREATE INDEX catalogue_products_brand_id_idx ON catalogue_products(brand_id);
CREATE INDEX catalogue_products_series_id_idx ON catalogue_products(series_id);
CREATE INDEX catalogue_products_review_idx ON catalogue_products(requires_review, created_at DESC)
  WHERE requires_review;

CREATE FUNCTION catalogue_sync_references() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  next_brand_id uuid := md5('brand:' || lower(trim(NEW.brand)))::uuid;
  next_series_id uuid := md5('series:' || lower(trim(NEW.brand)) || ':' || lower(trim(NEW.series)))::uuid;
  next_group_id uuid;
BEGIN
  INSERT INTO catalogue_brands(id,name,name_key) VALUES(next_brand_id,trim(NEW.brand),lower(trim(NEW.brand)))
    ON CONFLICT (name_key) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO next_brand_id;
  INSERT INTO catalogue_series(id,brand_id,name,name_key)
    VALUES(next_series_id,next_brand_id,trim(NEW.series),lower(trim(NEW.series)))
    ON CONFLICT (brand_id,name_key) DO UPDATE SET name=EXCLUDED.name RETURNING id INTO next_series_id;
  NEW.brand_id := next_brand_id;
  NEW.series_id := next_series_id;
  RETURN NEW;
END;
$$;
CREATE TRIGGER catalogue_product_reference_sync
  BEFORE INSERT OR UPDATE OF brand,series ON catalogue_products
  FOR EACH ROW EXECUTE FUNCTION catalogue_sync_references();

INSERT INTO catalogue_brands(id,name,name_key)
SELECT md5('brand:' || lower(trim(brand)))::uuid,min(brand),lower(trim(brand))
FROM catalogue_products GROUP BY lower(trim(brand)) ON CONFLICT DO NOTHING;
INSERT INTO catalogue_series(id,brand_id,name,name_key)
SELECT md5('series:' || lower(trim(brand)) || ':' || lower(trim(series)))::uuid,
       md5('brand:' || lower(trim(brand)))::uuid,min(series),lower(trim(series))
FROM catalogue_products GROUP BY lower(trim(brand)),lower(trim(series)) ON CONFLICT DO NOTHING;
UPDATE catalogue_products SET
  brand_id=md5('brand:' || lower(trim(brand)))::uuid,
  series_id=md5('series:' || lower(trim(brand)) || ':' || lower(trim(series)))::uuid;
ALTER TABLE catalogue_products ALTER COLUMN brand_id SET NOT NULL;
ALTER TABLE catalogue_products ALTER COLUMN series_id SET NOT NULL;

INSERT INTO catalogue_variant_groups(id,code)
SELECT md5('variant:' || variant_group)::uuid,variant_group FROM catalogue_products
WHERE variant_group<>'' GROUP BY variant_group ON CONFLICT DO NOTHING;
INSERT INTO catalogue_product_variants(product_id,group_id,label)
SELECT id,CASE WHEN variant_group='' THEN NULL ELSE md5('variant:' || variant_group)::uuid END,variant_label
FROM catalogue_products;

CREATE FUNCTION catalogue_sync_variant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE next_group_id uuid;
BEGIN
  IF NEW.variant_group <> '' THEN
    next_group_id := md5('variant:' || NEW.variant_group)::uuid;
    INSERT INTO catalogue_variant_groups(id,code) VALUES(next_group_id,NEW.variant_group)
      ON CONFLICT (code) DO UPDATE SET code=EXCLUDED.code RETURNING id INTO next_group_id;
  END IF;
  INSERT INTO catalogue_product_variants(product_id,group_id,label)
    VALUES(NEW.id,next_group_id,NEW.variant_label)
    ON CONFLICT (product_id) DO UPDATE SET group_id=EXCLUDED.group_id,label=EXCLUDED.label;
  RETURN NEW;
END;
$$;
CREATE TRIGGER catalogue_product_variant_sync
  AFTER INSERT OR UPDATE OF variant_group,variant_label ON catalogue_products
  FOR EACH ROW EXECUTE FUNCTION catalogue_sync_variant();

-- Signed-in carts are durable and customer-owned. Checkout remains authoritative for all prices.
CREATE TABLE commerce_carts (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL UNIQUE REFERENCES identity_users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE commerce_cart_items (
  cart_id uuid NOT NULL REFERENCES commerce_carts(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES catalogue_products(id),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 100),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(cart_id,product_id)
);
CREATE INDEX commerce_cart_items_product_idx ON commerce_cart_items(product_id);

CREATE TABLE commerce_payments (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES commerce_orders(id),
  provider text NOT NULL CHECK (provider IN ('razorpay','test','cash','upi','card','bank_transfer')),
  provider_payment_id text,
  amount_paise integer NOT NULL CHECK (amount_paise >= 0),
  status text NOT NULL CHECK (status IN ('pending','captured','failed','refunded')),
  source_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  captured_at timestamptz,
  UNIQUE(provider,provider_payment_id)
);
CREATE INDEX commerce_payments_order_idx ON commerce_payments(order_id,created_at DESC);

CREATE TABLE commerce_order_item_units (
  order_item_id uuid NOT NULL REFERENCES commerce_order_items(id),
  unit_id uuid NOT NULL UNIQUE REFERENCES inventory_units(id),
  serial_code text NOT NULL,
  PRIMARY KEY(order_item_id,unit_id)
);
CREATE TABLE billing_invoice_item_units (
  invoice_item_id uuid NOT NULL REFERENCES billing_invoice_items(id),
  unit_id uuid REFERENCES inventory_units(id),
  serial_code text NOT NULL,
  PRIMARY KEY(invoice_item_id,serial_code)
);

CREATE INDEX identity_audit_action_idx ON identity_audit_log(action,created_at DESC,id DESC);
CREATE INDEX identity_audit_entity_idx ON identity_audit_log(entity_id,created_at DESC,id DESC);
