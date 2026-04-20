-- Faixas de distância, ajuste por dia da semana, origem opcional; mídia com título e loja

ALTER TABLE store_configs
  ADD COLUMN IF NOT EXISTS delivery_use_distance_zones BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_require_distance_km BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_origin_lat NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS delivery_origin_lng NUMERIC(10, 7);

CREATE TABLE IF NOT EXISTS store_delivery_zones (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  max_km          NUMERIC(10, 2) NOT NULL CHECK (max_km > 0),
  fee             NUMERIC(12, 2) NOT NULL CHECK (fee >= 0),
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_store_delivery_zones_store ON store_delivery_zones (store_id, sort_order, max_km);

-- dia: 0=domingo … 6=sábado (igual JS Date.getDay())
CREATE TABLE IF NOT EXISTS store_delivery_day_modifiers (
  store_id        INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day_of_week     SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  fee_multiplier  NUMERIC(10, 4) NOT NULL DEFAULT 1 CHECK (fee_multiplier >= 0),
  fee_add         NUMERIC(12, 2) NOT NULL DEFAULT 0,
  PRIMARY KEY (store_id, day_of_week)
);

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id) ON DELETE SET NULL;

UPDATE media_assets
SET store_id = (SELECT id FROM stores WHERE slug = 'principal' LIMIT 1)
WHERE store_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_media_assets_store ON media_assets (store_id);

ALTER TABLE customer_addresses
  ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS longitude NUMERIC(10, 7);
