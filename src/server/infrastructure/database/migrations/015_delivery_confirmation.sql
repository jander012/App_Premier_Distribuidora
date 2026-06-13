ALTER TABLE orders ADD COLUMN delivery_confirmation_token VARCHAR(128);
ALTER TABLE orders ADD COLUMN delivery_confirmation_expires_at TIMESTAMP NULL;
ALTER TABLE orders ADD COLUMN delivery_confirmed_at TIMESTAMP NULL;
CREATE UNIQUE INDEX uq_orders_delivery_confirmation_token ON orders (delivery_confirmation_token);
