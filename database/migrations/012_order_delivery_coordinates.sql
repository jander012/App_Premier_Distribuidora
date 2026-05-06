ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(10, 7);

COMMENT ON COLUMN orders.delivery_latitude IS 'Latitude marcada pelo cliente para entrega.';
COMMENT ON COLUMN orders.delivery_longitude IS 'Longitude marcada pelo cliente para entrega.';
