ALTER TABLE catalogue_products
  ADD COLUMN variant_group text NOT NULL DEFAULT ''
    CHECK (char_length(variant_group) <= 160),
  ADD COLUMN variant_label text NOT NULL DEFAULT ''
    CHECK (char_length(variant_label) <= 160);

CREATE INDEX catalogue_variant_group_idx
  ON catalogue_products(variant_group, published_at, id)
  WHERE variant_group <> '' AND published_at IS NOT NULL;
