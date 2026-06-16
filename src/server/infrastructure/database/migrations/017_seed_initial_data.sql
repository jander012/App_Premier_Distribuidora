-- Initial seed data moved from scripts/seed.js.

INSERT INTO admin_users (email, password_hash, is_super_admin)
VALUES (
  'admin@delivery.local',
  '$2a$10$B81uaDQlFd4Q3IxYNFFTwuuJgrzSVzYamafLJ/i.s5eu0uOz2bOT6',
  true
)
ON DUPLICATE KEY UPDATE
  password_hash = VALUES(password_hash),
  is_super_admin = true;

SET @admin_id := (
  SELECT id
  FROM admin_users
  WHERE email = 'admin@delivery.local'
  LIMIT 1
);

SET @store_id := (
  SELECT id
  FROM stores
  WHERE slug = 'principal'
  LIMIT 1
);

INSERT IGNORE INTO admin_user_stores (admin_user_id, store_id)
SELECT @admin_id, @store_id
WHERE @admin_id IS NOT NULL AND @store_id IS NOT NULL;

INSERT INTO categories (name, sort_order, store_id)
SELECT 'Pizzas', 1, @store_id
WHERE @store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM categories
    WHERE store_id = @store_id AND name = 'Pizzas'
  );

INSERT INTO categories (name, sort_order, store_id)
SELECT 'Bebidas', 2, @store_id
WHERE @store_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM categories
    WHERE store_id = @store_id AND name = 'Bebidas'
  );

SET @pizzas_id := (
  SELECT id
  FROM categories
  WHERE store_id = @store_id AND name = 'Pizzas'
  ORDER BY id
  LIMIT 1
);

SET @bebidas_id := (
  SELECT id
  FROM categories
  WHERE store_id = @store_id AND name = 'Bebidas'
  ORDER BY id
  LIMIT 1
);

SET @product_count := (
  SELECT COUNT(*)
  FROM products
  WHERE store_id = @store_id
);

INSERT INTO products (category_id, name, description, price, image_url, available, store_id)
SELECT
  @pizzas_id,
  'Margherita',
  'Molho, mussarela e manjericao',
  42.90,
  'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400',
  true,
  @store_id
WHERE @store_id IS NOT NULL
  AND @pizzas_id IS NOT NULL
  AND @product_count = 0;

INSERT INTO products (category_id, name, description, price, image_url, available, store_id)
SELECT
  @pizzas_id,
  'Calabresa',
  'Calabresa, cebola e azeitona',
  48.90,
  'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400',
  true,
  @store_id
WHERE @store_id IS NOT NULL
  AND @pizzas_id IS NOT NULL
  AND @product_count = 0;

INSERT INTO products (category_id, name, description, price, available, store_id)
SELECT
  @bebidas_id,
  'Refrigerante Lata',
  '350ml',
  6.50,
  true,
  @store_id
WHERE @store_id IS NOT NULL
  AND @bebidas_id IS NOT NULL
  AND @product_count = 0;

SET @margherita_id := (
  SELECT id
  FROM products
  WHERE store_id = @store_id AND name = 'Margherita'
  ORDER BY id
  LIMIT 1
);

INSERT INTO product_options (product_id, name, price_extra, required_choice, max_select, sort_order)
SELECT @margherita_id, 'Borda recheada', 12.00, false, 1, 1
WHERE @margherita_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM product_options
    WHERE product_id = @margherita_id AND name = 'Borda recheada'
  );

INSERT INTO product_options (product_id, name, price_extra, required_choice, max_select, sort_order)
SELECT @margherita_id, 'Tamanho familia', 18.00, false, 1, 2
WHERE @margherita_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM product_options
    WHERE product_id = @margherita_id AND name = 'Tamanho familia'
  );
