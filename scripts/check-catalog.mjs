import dotenv from 'dotenv';
import { query, pool } from '../src/server/infrastructure/config/db.js';

dotenv.config();

const { rows: p } = await query('SELECT COUNT(*) AS c FROM products');
const { rows: i } = await query(
  `SELECT COUNT(*) AS c FROM products WHERE image_url IS NOT NULL AND TRIM(image_url) <> ''`
);
const { rows: cat } = await query('SELECT COUNT(*) AS c FROM categories');
const { rows: sample } = await query(
  `SELECT c.name, COUNT(*) AS n FROM categories c
   JOIN products p ON p.category_id = c.id GROUP BY c.id, c.name ORDER BY n DESC LIMIT 12`
);
console.log({ products: p[0].c, withImages: i[0].c, categories: cat[0].c });
console.log(sample);
await pool.end();
