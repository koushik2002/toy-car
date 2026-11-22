ALTER TABLE catalogue_products ADD COLUMN serial_tracking boolean NOT NULL DEFAULT false;
ALTER TABLE catalogue_product_images ADD COLUMN object_key text UNIQUE;
CREATE SEQUENCE catalogue_generated_sku_seq START WITH 100000;
CREATE SEQUENCE catalogue_generated_unit_seq START WITH 100000;

CREATE TABLE inventory_units (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES catalogue_products(id),
  serial_code text NOT NULL UNIQUE CHECK (char_length(serial_code) BETWEEN 1 AND 80),
  state text NOT NULL DEFAULT 'available' CHECK (state IN ('available','reserved','sold','quarantine')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz,
  sale_reference text
);
CREATE INDEX inventory_units_available_idx ON inventory_units(product_id,state);

CREATE TABLE inventory_movements (
  id uuid PRIMARY KEY,
  product_id uuid NOT NULL REFERENCES catalogue_products(id),
  unit_id uuid REFERENCES inventory_units(id),
  delta integer NOT NULL,
  after_available integer NOT NULL CHECK (after_available >= 0),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 500),
  source_key text NOT NULL UNIQUE,
  actor_id uuid REFERENCES identity_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements(product_id,created_at DESC);
CREATE FUNCTION inventory_protect_movement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Inventory movements are append-only'; END;
$$;
CREATE TRIGGER inventory_movement_immutable BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW EXECUTE FUNCTION inventory_protect_movement();

CREATE TABLE catalogue_import_jobs (
  id uuid PRIMARY KEY,
  content_sha256 char(64) NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES identity_users(id),
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged','committed','failed')),
  row_count integer NOT NULL CHECK (row_count BETWEEN 0 AND 5000),
  error_count integer NOT NULL CHECK (error_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz
);
CREATE TABLE catalogue_import_rows (
  job_id uuid NOT NULL REFERENCES catalogue_import_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  action text NOT NULL CHECK (action IN ('create','update','invalid')),
  raw jsonb NOT NULL,
  normalized jsonb NOT NULL,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY(job_id,row_number)
);
