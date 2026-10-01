import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const STORE_ID = Number(process.env.IMPORT_STORE_ID || 1);
const DRY_RUN = process.argv.includes('--dry-run');
const xlsxPath = process.argv.find((a) => a.toLowerCase().endsWith('.xlsx') || a.toLowerCase().endsWith('.xls'));

if (!xlsxPath) {
  console.error('Uso: node scripts/import-premier-local.mjs "<arquivo.xlsx>" [--dry-run]');
  process.exit(1);
}

function clean(raw) {
  return String(raw ?? '').replace(/\s+/g, ' ').trim();
}

function titleCase(raw) {
  return clean(raw)
    .toLowerCase()
    .replace(/(^|[\s/\-])([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function parsePrice(raw) {
  const n = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function readItems(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheet = wb.Sheets['Itens'] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const items = [];
  for (const row of rows) {
    const keys = Object.keys(row);
    const get = (needle) => {
      const k = keys.find((h) => clean(h).toLowerCase().includes(needle));
      return k ? row[k] : '';
    };
    const name = clean(get('descri'));
    const categoryRaw = clean(get('categoria'));
    if (!name || !categoryRaw) continue;
    const code = clean(get('código') || get('codigo'));
    const ncm = clean(get('ncm'));
    const unit = clean(get('unid'));
    const image = clean(get('imagem'));
    const price = parsePrice(get('preço venda') || get('preco venda') || get('venda'));
    const descParts = [];
    if (code) descParts.push(`Cód.: ${code}`);
    if (ncm) descParts.push(`NCM: ${ncm}`);
    if (unit) descParts.push(`Unid.: ${unit}`);
    items.push({
      name,
      categoryName: titleCase(categoryRaw),
      code: code || null,
      price,
      imageUrl: image || null,
      description: descParts.join(' · ') || null,
    });
  }
  return items;
}

async function main() {
  const absPath = path.resolve(xlsxPath);
  if (!fs.existsSync(absPath)) throw new Error(`Arquivo não encontrado: ${absPath}`);

  console.log(`Lendo ${absPath}...`);
  const items = readItems(absPath);
  console.log(`Produtos válidos na planilha: ${items.length}`);

  const byCat = new Map();
  for (const it of items) byCat.set(it.categoryName, (byCat.get(it.categoryName) || 0) + 1);
  const categories = [...byCat.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`Categorias na planilha: ${categories.length}`);
  categories.forEach(([n, c], i) => console.log(`  ${i + 1}. ${n}: ${c}`));

  if (DRY_RUN) {
    console.log('\n(dry-run — nenhuma alteração no banco)');
    return;
  }

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    multipleStatements: false,
  });

  try {
    await conn.beginTransaction();

    await conn.query(
      `DELETE FROM product_options WHERE product_id IN (SELECT id FROM products WHERE store_id = ?)`,
      [STORE_ID]
    ).catch(() => {});
    await conn.query(
      `DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE store_id = ?)`,
      [STORE_ID]
    ).catch(() => {});
    await conn.query(`DELETE FROM products WHERE store_id = ?`, [STORE_ID]);
    await conn.query(`DELETE FROM categories WHERE store_id = ?`, [STORE_ID]);

    const categoryId = new Map();
    let sort = 1;
    for (const [name] of categories) {
      const [res] = await conn.query(
        `INSERT INTO categories (name, sort_order, active, store_id) VALUES (?, ?, 1, ?)`,
        [name, sort, STORE_ID]
      );
      categoryId.set(name, res.insertId);
      sort += 1;
    }

    let inserted = 0;
    for (const it of items) {
      const catId = categoryId.get(it.categoryName);
      await conn.query(
        `INSERT INTO products (category_id, name, sped_code, description, price, image_url, available, store_id)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
        [catId, it.name, it.code, it.description, it.price, it.imageUrl, STORE_ID]
      );
      inserted += 1;
      if (inserted % 300 === 0) console.log(`  ... ${inserted}/${items.length}`);
    }

    await conn.commit();
    console.log('\nResumo:');
    console.log(`  Categorias criadas: ${categories.length}`);
    console.log(`  Produtos inseridos: ${inserted}`);
    console.log(`  Com imagem: ${items.filter((i) => i.imageUrl).length}`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
