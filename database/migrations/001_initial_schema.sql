-- Delivery MVP — PostgreSQL schema
-- Run in order; idempotent drops for dev only (comment in prod)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Configuração da loja (taxa entrega, templates WhatsApp)
CREATE TABLE IF NOT EXISTS store_settings (
  id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
  menu_base_url   TEXT,
  whatsapp_welcome_template TEXT,
  whatsapp_order_confirm_template TEXT,
  whatsapp_status_template TEXT,
  fiscal_uf       VARCHAR(2) DEFAULT 'MT',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO store_settings (id, delivery_fee, menu_base_url)
VALUES (1, 5.00, 'http://localhost:5173')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_users (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customers (
  id              SERIAL PRIMARY KEY,
  phone           VARCHAR(20) NOT NULL UNIQUE,
  full_name       VARCHAR(255),
  cpf             VARCHAR(14),
  email           VARCHAR(255),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone);
CREATE INDEX IF NOT EXISTS idx_customers_cpf ON customers (cpf) WHERE cpf IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  street          VARCHAR(255) NOT NULL,
  number          VARCHAR(32) NOT NULL,
  neighborhood    VARCHAR(128) NOT NULL,
  zip_code        VARCHAR(12) NOT NULL,
  complement      VARCHAR(255),
  reference_note  VARCHAR(255),
  is_default      BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses (customer_id);

CREATE TABLE IF NOT EXISTS categories (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(128) NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id              SERIAL PRIMARY KEY,
  category_id     INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
  image_url       TEXT,
  available       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_available ON products (available);

-- Opcionais / adicionais por produto
CREATE TABLE IF NOT EXISTS product_options (
  id              SERIAL PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name            VARCHAR(128) NOT NULL,
  price_extra     NUMERIC(12,2) NOT NULL DEFAULT 0,
  required_choice BOOLEAN NOT NULL DEFAULT false,
  max_select      INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_product_options_product ON product_options (product_id);

CREATE TABLE IF NOT EXISTS carts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cart_items (
  id              SERIAL PRIMARY KEY,
  cart_id         UUID NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id      INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  note            TEXT,
  option_ids      INTEGER[] NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart ON cart_items (cart_id);

-- Formas de pagamento (catálogo para relatório / futuro fiscal)
CREATE TABLE IF NOT EXISTS payment_methods (
  id              SERIAL PRIMARY KEY,
  code            VARCHAR(64) NOT NULL UNIQUE,
  label           VARCHAR(128) NOT NULL,
  requires_online BOOLEAN NOT NULL DEFAULT false
);

INSERT INTO payment_methods (code, label, requires_online) VALUES
  ('pix_online', 'PIX (online)', true),
  ('pix_delivery', 'PIX (na entrega)', false),
  ('debit_card', 'Cartão de débito (na entrega)', false),
  ('credit_card', 'Cartão de crédito (na entrega)', false),
  ('cash', 'Dinheiro (na entrega)', false)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS orders (
  id              SERIAL PRIMARY KEY,
  customer_id     INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  cart_id         UUID REFERENCES carts(id) ON DELETE SET NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','preparing','out_for_delivery','delivered','cancelled')),
  subtotal        NUMERIC(12,2) NOT NULL,
  delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL,
  payment_method_code VARCHAR(64) NOT NULL,
  payment_meta    JSONB NOT NULL DEFAULT '{}',
  -- Snapshot endereço / cliente (SEFAZ / histórico)
  delivery_street     VARCHAR(255) NOT NULL,
  delivery_number     VARCHAR(32) NOT NULL,
  delivery_neighborhood VARCHAR(128) NOT NULL,
  delivery_zip_code   VARCHAR(12) NOT NULL,
  delivery_complement VARCHAR(255),
  delivery_reference  VARCHAR(255),
  customer_full_name  VARCHAR(255) NOT NULL,
  customer_cpf        VARCHAR(14) NOT NULL,
  customer_email      VARCHAR(255) NOT NULL,
  customer_phone      VARCHAR(20) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders (customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name    VARCHAR(255) NOT NULL,
  unit_price      NUMERIC(12,2) NOT NULL,
  quantity        INTEGER NOT NULL CHECK (quantity > 0),
  note            TEXT,
  options_snapshot JSONB NOT NULL DEFAULT '[]',
  line_total      NUMERIC(12,2) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);

CREATE TABLE IF NOT EXISTS payments (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  method_code     VARCHAR(64) NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  status          VARCHAR(32) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','authorized','paid','failed','refunded')),
  provider        VARCHAR(64),
  provider_ref    TEXT,
  meta            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order ON payments (order_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status          VARCHAR(32) NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order ON order_status_history (order_id);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  direction       VARCHAR(8) NOT NULL CHECK (direction IN ('inbound','outbound')),
  template_key    VARCHAR(64),
  to_phone        VARCHAR(20),
  body            TEXT,
  provider_ref    TEXT,
  payload         JSONB NOT NULL DEFAULT '{}',
  status          VARCHAR(32) NOT NULL DEFAULT 'queued',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_order ON whatsapp_messages (order_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_to ON whatsapp_messages (to_phone);
