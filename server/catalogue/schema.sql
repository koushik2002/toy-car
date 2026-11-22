CREATE TABLE catalogue_products (
  id uuid PRIMARY KEY,
  sku text NOT NULL UNIQUE CHECK (char_length(sku) BETWEEN 1 AND 80),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  brand text NOT NULL CHECK (char_length(brand) BETWEEN 1 AND 100),
  series text NOT NULL DEFAULT '',
  manufacture_year integer CHECK (manufacture_year BETWEEN 1886 AND 2100),
  scale text NOT NULL DEFAULT '',
  condition text NOT NULL DEFAULT 'New',
  price_paise integer NOT NULL CHECK (price_paise >= 0),
  mrp_paise integer NOT NULL CHECK (mrp_paise >= price_paise),
  available integer NOT NULL DEFAULT 0 CHECK (available >= 0),
  rare boolean NOT NULL DEFAULT false,
  popularity_score integer NOT NULL DEFAULT 0 CHECK (popularity_score >= 0),
  description text NOT NULL DEFAULT '',
  offer text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalogue_published_new_idx ON catalogue_products(created_at DESC, id DESC) WHERE published_at IS NOT NULL;
CREATE INDEX catalogue_published_brand_idx ON catalogue_products(brand, series) WHERE published_at IS NOT NULL;
CREATE INDEX catalogue_published_price_idx ON catalogue_products(price_paise) WHERE published_at IS NOT NULL;
CREATE INDEX catalogue_published_popular_idx ON catalogue_products(popularity_score DESC, id DESC) WHERE published_at IS NOT NULL;

CREATE TABLE catalogue_product_images (
  product_id uuid NOT NULL REFERENCES catalogue_products(id) ON DELETE CASCADE,
  slot smallint NOT NULL CHECK (slot BETWEEN 1 AND 5),
  url text NOT NULL CHECK (char_length(url) BETWEEN 1 AND 2048),
  alt text NOT NULL DEFAULT '',
  PRIMARY KEY (product_id, slot)
);
