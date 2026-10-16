-- Posição do entregador visível ao cliente + código curto de confirmação
ALTER TABLE orders ADD COLUMN driver_lat DOUBLE NULL;
ALTER TABLE orders ADD COLUMN driver_lng DOUBLE NULL;
ALTER TABLE orders ADD COLUMN driver_location_at TIMESTAMP NULL;
ALTER TABLE orders ADD COLUMN delivery_confirmation_code VARCHAR(8) NULL;

CREATE INDEX idx_orders_delivery_confirmation_code ON orders (delivery_confirmation_code);
