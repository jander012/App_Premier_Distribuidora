-- Frete: valor mínimo de corrida + faixas por horário (R$/km) × distância
ALTER TABLE store_configs
  ADD COLUMN IF NOT EXISTS delivery_min_trip_fee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_use_per_km_pricing BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS store_delivery_time_rates (
  id              SERIAL PRIMARY KEY,
  store_id        INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  time_start      TIME NOT NULL,
  time_end        TIME NOT NULL,
  price_per_km    NUMERIC(12, 2) NOT NULL CHECK (price_per_km >= 0),
  sort_order      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_store_delivery_time_rates_store
  ON store_delivery_time_rates (store_id, sort_order);

-- Cupons por loja
CREATE TABLE IF NOT EXISTS coupons (
  id                          SERIAL PRIMARY KEY,
  store_id                    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code                        VARCHAR(64) NOT NULL,
  active                      BOOLEAN NOT NULL DEFAULT true,
  discount_type               VARCHAR(16) NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  percent_value               NUMERIC(8, 2),
  max_discount_per_order      NUMERIC(12, 2),
  fixed_amount                NUMERIC(12, 2),
  max_uses_per_user           INTEGER,
  max_total_discount_per_user NUMERIC(12, 2),
  valid_from                  TIMESTAMPTZ,
  valid_until                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_store_code_lower
  ON coupons (store_id, (lower(code)));

CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id               SERIAL PRIMARY KEY,
  coupon_id        INTEGER NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
  customer_id      INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  order_id         INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  discount_amount  NUMERIC(12, 2) NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_customer
  ON coupon_redemptions (coupon_id, customer_id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS coupon_id INTEGER REFERENCES coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_discount NUMERIC(12, 2) NOT NULL DEFAULT 0;
