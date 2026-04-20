-- Multi-loja, mídias com hash (dedup), vínculo admin–loja, pedidos/categorias/produtos por loja

CREATE TABLE IF NOT EXISTS stores (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(128) NOT NULL,
  slug            VARCHAR(64) NOT NULL UNIQUE,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO stores (name, slug)
SELECT 'Loja Principal', 'principal'
WHERE NOT EXISTS (SELECT 1 FROM stores WHERE slug = 'principal');

-- Mídia: UUID + content_hash SHA-256 (hex 64) para índice/dedup
CREATE TABLE IF NOT EXISTS media_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_hash    CHAR(64) NOT NULL,
  public_url      TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_media_assets_content_hash UNIQUE (content_hash)
);

CREATE INDEX IF NOT EXISTS idx_media_assets_content_hash ON media_assets (content_hash);

CREATE TABLE IF NOT EXISTS store_configs (
  store_id        INTEGER PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
  menu_base_url   TEXT,
  whatsapp_welcome_template TEXT,
  whatsapp_order_confirm_template TEXT,
  whatsapp_status_template TEXT,
  fiscal_uf       VARCHAR(2) DEFAULT 'MT',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO store_configs (store_id, delivery_fee, menu_base_url, whatsapp_welcome_template, whatsapp_order_confirm_template, whatsapp_status_template, fiscal_uf)
SELECT s.id,
  COALESCE(ss.delivery_fee, 5.00),
  ss.menu_base_url,
  ss.whatsapp_welcome_template,
  ss.whatsapp_order_confirm_template,
  ss.whatsapp_status_template,
  COALESCE(ss.fiscal_uf, 'MT')
FROM stores s
LEFT JOIN store_settings ss ON ss.id = 1
WHERE s.slug = 'principal'
ON CONFLICT (store_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_user_stores (
  admin_user_id   INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  store_id        INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (admin_user_id, store_id)
);

INSERT INTO admin_user_stores (admin_user_id, store_id)
SELECT au.id, st.id FROM admin_users au CROSS JOIN stores st WHERE st.slug = 'principal'
ON CONFLICT (admin_user_id, store_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS customer_stores (
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  store_id        INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  last_used_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, store_id)
);

ALTER TABLE categories ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id);
UPDATE categories SET store_id = (SELECT id FROM stores WHERE slug = 'principal' LIMIT 1) WHERE store_id IS NULL;
ALTER TABLE categories ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id);
UPDATE products SET store_id = (SELECT id FROM stores WHERE slug = 'principal' LIMIT 1) WHERE store_id IS NULL;
ALTER TABLE products ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE products ADD COLUMN IF NOT EXISTS image_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL;

INSERT INTO media_assets (content_hash, public_url)
SELECT encode(digest(p.image_url, 'sha256'), 'hex'), MIN(p.image_url)
FROM products p
WHERE p.image_url IS NOT NULL AND btrim(p.image_url) <> ''
GROUP BY encode(digest(p.image_url, 'sha256'), 'hex')
ON CONFLICT (content_hash) DO NOTHING;

UPDATE products p
SET image_asset_id = m.id
FROM media_assets m
WHERE p.image_url IS NOT NULL AND btrim(p.image_url) <> ''
  AND encode(digest(p.image_url, 'sha256'), 'hex') = m.content_hash
  AND (p.image_asset_id IS NULL OR p.image_asset_id <> m.id);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id);
UPDATE orders SET store_id = (SELECT id FROM stores WHERE slug = 'principal' LIMIT 1) WHERE store_id IS NULL;
ALTER TABLE orders ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE carts ADD COLUMN IF NOT EXISTS store_id INTEGER REFERENCES stores(id);

CREATE INDEX IF NOT EXISTS idx_products_store ON products (store_id);
CREATE INDEX IF NOT EXISTS idx_categories_store ON categories (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store ON orders (store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders (store_id, created_at DESC);
