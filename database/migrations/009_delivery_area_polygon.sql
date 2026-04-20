-- Área de entrega como polígono (GeoJSON Polygon em JSONB)

ALTER TABLE store_configs
  ADD COLUMN IF NOT EXISTS delivery_area_polygon JSONB;

COMMENT ON COLUMN store_configs.delivery_area_polygon IS 'GeoJSON Polygon (coordinates em [lng,lat]). Se preenchido, pedido exige ponto no mapa dentro da área.';
