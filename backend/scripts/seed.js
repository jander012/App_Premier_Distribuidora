import bcrypt from 'bcryptjs';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definido');
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

try {
  const hash = await bcrypt.hash('admin123', 10);
  await client.query(
    `INSERT INTO admin_users (email, password_hash, is_super_admin) VALUES ($1, $2, true)
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_super_admin = true`,
    ['admin@delivery.local', hash]
  );

  const { rows: st } = await client.query(`SELECT id FROM stores WHERE slug = 'principal' LIMIT 1`);
  const storeId = st[0]?.id;
  if (!storeId) {
    console.error('Loja principal não encontrada — execute npm run migrate antes do seed.');
    process.exit(1);
  }

  let pid;
  let bid;
  const cats = await client.query(`SELECT id, name FROM categories WHERE store_id = $1 ORDER BY id`, [storeId]);
  const byName = Object.fromEntries(cats.rows.map((r) => [r.name, r.id]));
  if (!byName['Pizzas']) {
    const r = await client.query(
      `INSERT INTO categories (name, sort_order, store_id) VALUES ('Pizzas', 1, $1) RETURNING id`,
      [storeId]
    );
    pid = r.rows[0].id;
  } else pid = byName['Pizzas'];
  if (!byName['Bebidas']) {
    const r = await client.query(
      `INSERT INTO categories (name, sort_order, store_id) VALUES ('Bebidas', 2, $1) RETURNING id`,
      [storeId]
    );
    bid = r.rows[0].id;
  } else bid = byName['Bebidas'];

  const existing = await client.query('SELECT COUNT(*)::int AS c FROM products WHERE store_id = $1', [storeId]);
  if (existing.rows[0].c === 0) {
    const p1 = await client.query(
      `INSERT INTO products (category_id, name, description, price, image_url, available, store_id)
       VALUES ($1, 'Margherita', 'Molho, mussarela e manjericão', 42.90, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', true, $2)
       RETURNING id`,
      [pid, storeId]
    );
    await client.query(
      `INSERT INTO products (category_id, name, description, price, image_url, available, store_id)
       VALUES ($1, 'Calabresa', 'Calabresa, cebola e azeitona', 48.90, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400', true, $2)`,
      [pid, storeId]
    );
    await client.query(
      `INSERT INTO products (category_id, name, description, price, available, store_id)
       VALUES ($1, 'Refrigerante Lata', '350ml', 6.50, true, $2)`,
      [bid, storeId]
    );

    await client.query(
      `INSERT INTO product_options (product_id, name, price_extra, required_choice, max_select, sort_order)
       VALUES ($1, 'Borda recheada', 12.00, false, 1, 1),
              ($1, 'Tamanho família', 18.00, false, 1, 2)`,
      [p1.rows[0].id]
    );
  }

  console.log('Seed OK — admin: admin@delivery.local / admin123');
} finally {
  await client.end();
}
