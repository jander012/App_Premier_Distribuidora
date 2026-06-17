ALTER TABLE products
  ADD COLUMN sped_code VARCHAR(32) NULL AFTER name;

CREATE INDEX idx_products_store_sped ON products (store_id, sped_code);
