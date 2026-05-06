import bcrypt from 'bcryptjs';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL não definido');
  process.exit(1);
}

const connection = await mysql.createConnection({ uri: url });

async function query(sql, params = []) {
  const nextParams = [];
  const statement = sql.replace(/\$(\d+)/g, (_, index) => {
    nextParams.push(params[Number(index) - 1]);
    return '?';
  });
  const [rows] = await connection.execute(statement, nextParams);
  return { rows: Array.isArray(rows) ? rows : [], insertId: rows.insertId, rowCount: rows.affectedRows ?? rows.length ?? 0 };
}

try {
  const hash = await bcrypt.hash('admin123', 10);
  await query(
    `INSERT INTO admin_users (email, password_hash, is_super_admin) VALUES ($1, $2, true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), is_super_admin = true`,
    ['admin@delivery.local', hash]
  );

  const { rows: adminRows } = await query(`SELECT id FROM admin_users WHERE email = 'admin@delivery.local' LIMIT 1`);
  const adminId = adminRows[0]?.id;

  const { rows: st } = await query(`SELECT id FROM stores WHERE slug = 'principal' LIMIT 1`);
  const storeId = st[0]?.id;
  if (!storeId) {
    console.error('Loja principal não encontrada — execute npm run migrate antes do seed.');
    process.exit(1);
  }
  if (adminId) {
    await query(`INSERT IGNORE INTO admin_user_stores (admin_user_id, store_id) VALUES ($1, $2)`, [adminId, storeId]);
  }

  let pid;
  let bid;
  const cats = await query(`SELECT id, name FROM categories WHERE store_id = $1 ORDER BY id`, [storeId]);
  const byName = Object.fromEntries(cats.rows.map((r) => [r.name, r.id]));
  if (!byName['Pizzas']) {
    const r = await query(
      `INSERT INTO categories (name, sort_order, store_id) VALUES ('Pizzas', 1, $1)`,
      [storeId]
    );
    pid = r.insertId;
  } else pid = byName['Pizzas'];
  if (!byName['Bebidas']) {
    const r = await query(
      `INSERT INTO categories (name, sort_order, store_id) VALUES ('Bebidas', 2, $1)`,
      [storeId]
    );
    bid = r.insertId;
  } else bid = byName['Bebidas'];

  const existing = await query('SELECT COUNT(*) AS c FROM products WHERE store_id = $1', [storeId]);
  if (existing.rows[0].c === 0) {
    const p1 = await query(
      `INSERT INTO products (category_id, name, description, price, image_url, available, store_id)
       VALUES ($1, 'Margherita', 'Molho, mussarela e manjericão', 42.90, 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400', true, $2)
       `,
      [pid, storeId]
    );
    await query(
      `INSERT INTO products (category_id, name, description, price, image_url, available, store_id)
       VALUES ($1, 'Calabresa', 'Calabresa, cebola e azeitona', 48.90, 'https://images.unsplash.com/photo-1628840042765-356cda07504e?w=400', true, $2)`,
      [pid, storeId]
    );
    await query(
      `INSERT INTO products (category_id, name, description, price, available, store_id)
       VALUES ($1, 'Refrigerante Lata', '350ml', 6.50, true, $2)`,
      [bid, storeId]
    );

    await query(
      `INSERT INTO product_options (product_id, name, price_extra, required_choice, max_select, sort_order)
       VALUES ($1, 'Borda recheada', 12.00, false, 1, 1),
              ($1, 'Tamanho família', 18.00, false, 1, 2)`,
      [p1.insertId]
    );
  }

  console.log('Seed OK — admin: admin@delivery.local / admin123');
} finally {
  await connection.end();
}
