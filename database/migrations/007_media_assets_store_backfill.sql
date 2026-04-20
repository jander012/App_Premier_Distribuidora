-- Garante store_id em mídias órfãs (delete/list usam store_id = loja ativa)
UPDATE media_assets
SET store_id = (SELECT id FROM stores ORDER BY id LIMIT 1)
WHERE store_id IS NULL;
