-- Polígono de entrega por loja (empresa) — fonte principal; legado em store_configs.delivery_area_polygon ainda é lido se esta tabela estiver vazia

CREATE TABLE IF NOT EXISTS store_delivery_polygons (
  store_id    INTEGER PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  geojson     JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_delivery_polygons_updated ON store_delivery_polygons (updated_at);

INSERT INTO store_delivery_polygons (store_id, geojson, updated_at)
SELECT c.store_id, c.delivery_area_polygon, now()
FROM store_configs c
WHERE c.delivery_area_polygon IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM store_delivery_polygons p WHERE p.store_id = c.store_id);
