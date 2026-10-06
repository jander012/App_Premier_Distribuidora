DELETE FROM cart_items WHERE quantity < 1 OR quantity > 999;

ALTER TABLE cart_items ADD CONSTRAINT chk_cart_items_quantity CHECK (quantity BETWEEN 1 AND 999);
