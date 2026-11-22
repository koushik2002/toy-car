CREATE TABLE catalogue_series_codes (
  series_key text PRIMARY KEY CHECK (char_length(series_key) BETWEEN 3 AND 201),
  brand_name text NOT NULL CHECK (char_length(brand_name) BETWEEN 1 AND 100),
  series_name text NOT NULL CHECK (char_length(series_name) BETWEEN 1 AND 100),
  prefix char(6) NOT NULL UNIQUE CHECK (prefix ~ '^[0-9]{6}$'),
  next_product_number integer NOT NULL DEFAULT 1 CHECK (next_product_number > 0),
  next_unit_number integer NOT NULL DEFAULT 1 CHECK (next_unit_number > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
