ALTER TABLE categories
  ADD COLUMN is_age_restricted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX idx_categories_store_age_restricted
  ON categories (store_id, is_age_restricted, active, sort_order);
