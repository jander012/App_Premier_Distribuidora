ALTER TABLE delivery_drivers
  ADD COLUMN external_email VARCHAR(255) NULL,
  ADD COLUMN external_source VARCHAR(32) NULL;

CREATE INDEX idx_delivery_drivers_store_external_email ON delivery_drivers (store_id, external_email);
