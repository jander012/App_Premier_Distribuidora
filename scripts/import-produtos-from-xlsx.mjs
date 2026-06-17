import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import dotenv from 'dotenv';
import { query, pool } from '../src/server/infrastructure/config/db.js';

dotenv.config();

const STORE_ID = Number(process.env.IMPORT_STORE_ID || 1);
const DRY_RUN = process.argv.includes('--dry-run');

const CATEGORY_ORDER = [
  'Bebidas Alcoólicas',
  'Bebidas Não Alcoólicas',
  'Mercearia',
  'Biscoitos e Snacks',
  'Bomboniere',
  'Congelados',
  'Padaria',
  'Tabaco',
  'Casa e Limpeza',
  'Higiene e Cuidado Pessoal',
  'Pet Shop',
  'Festas e Lembrancinhas',
  'Bazar',
  'Brinquedos',
  'Outros',
];

const xlsxPath = process.argv.find((a) => a.endsWith('.xlsx') || a.endsWith('.xls'));
if (!xlsxPath) {
  console.error('Uso: node scripts/import-produtos-from-xlsx.mjs <arquivo.xlsx> [--dry-run]');
  process.exit(1);
}

function normalizeTopKey(raw) {
  return String(raw || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/,/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function consolidateCategory(raw) {
  const parts = String(raw || '')
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  const top = normalizeTopKey(parts[0] || 'NAO VINCULADO');

  const map = {
    'BEBIDAS ALCOOLICAS': 'Bebidas Alcoólicas',
    'BEBIDAS NAO ALCOOLICAS': 'Bebidas Não Alcoólicas',
    'BOMBONIERE': 'Bomboniere',
    'BISCOITOS E SKINE': 'Biscoitos e Snacks',
    MERCEARIA: 'Mercearia',
    CONGELADOS: 'Congelados',
    TABACO: 'Tabaco',
    'CASA MOVEIS E DECORACAO': 'Casa e Limpeza',
    'FESTAS E LEMBRANCINHAS': 'Festas e Lembrancinhas',
    'NAO VINCULADO': 'Outros',
    'HIGIENE PESSOAL': 'Higiene e Cuidado Pessoal',
    'CUIDADO PESSOAL': 'Higiene e Cuidado Pessoal',
    ANIMAIS: 'Pet Shop',
    BAZAR: 'Bazar',
    'BRINQUEDOS E HOBBIES': 'Brinquedos',
    PADARIA: 'Padaria',
    CORROSIVOS: 'Outros',
  };

  return map[top] || 'Outros';
}

function normalizeMerchandisingPath(raw) {
  return String(raw || '')
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' > ') || 'Não vinculado';
}

function normalizeSped(raw) {
  return String(raw ?? '').trim();
}

function normalizeName(raw) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ');
}

function normalizePrice(raw) {
  const n = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

function readRows(filePath) {
  const wb = XLSX.readFile(filePath, { cellDates: false });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const header = rows[0].map((h) => String(h).trim().toLowerCase());
  const idx = {
    name: header.findIndex((h) => h.includes('descri')),
    category: header.findIndex((h) => h.includes('estrutura')),
    sped: header.findIndex((h) => h.includes('sped')),
    price: header.findIndex((h) => h.includes('pre') && h.includes('venda')),
    saleUnit: header.findIndex((h) => h.includes('unid') && h.includes('venda')),
    buyUnit: header.findIndex((h) => h.includes('unid') && h.includes('compra')),
  };
  if (idx.name < 0 || idx.category < 0 || idx.sped < 0 || idx.price < 0) {
    throw new Error(`Colunas esperadas não encontradas. Header: ${JSON.stringify(rows[0])}`);
  }
  const items = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i];
    const name = normalizeName(row[idx.name]);
    const sped = normalizeSped(row[idx.sped]);
    if (!name || !sped) continue;
    const merchandisingPath = normalizeMerchandisingPath(row[idx.category]);
    items.push({
      name,
      categoryName: consolidateCategory(row[idx.category]),
      merchandisingPath,
      sped,
      price: normalizePrice(row[idx.price]),
      saleUnit: String(row[idx.saleUnit] ?? '').trim(),
      buyUnit: String(row[idx.buyUnit] ?? '').trim(),
    });
  }
  return items;
}

async function ensureCategories(categoryNames) {
  const ordered = [
    ...CATEGORY_ORDER.filter((name) => categoryNames.has(name)),
    ...[...categoryNames].filter((name) => !CATEGORY_ORDER.includes(name)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
  ];
  const map = new Map();
  for (const name of ordered) {
    const sortOrder = CATEGORY_ORDER.indexOf(name) >= 0 ? CATEGORY_ORDER.indexOf(name) + 1 : 99;
    if (DRY_RUN) {
      map.set(name, sortOrder);
      continue;
    }
    const existing = await query(
      `SELECT id FROM categories WHERE store_id = $1 AND name = $2 LIMIT 1`,
      [STORE_ID, name]
    );
    if (existing.rows[0]) {
      await query(`UPDATE categories SET sort_order = $2 WHERE id = $1`, [
        existing.rows[0].id,
        sortOrder,
      ]);
      map.set(name, existing.rows[0].id);
      continue;
    }
    const result = await query(
      `INSERT INTO categories (name, sort_order, active, store_id) VALUES ($1, $2, true, $3)`,
      [name, sortOrder, STORE_ID]
    );
    map.set(name, result.insertId);
  }
  return map;
}

function buildDescription(item) {
  const parts = [`Cód. SPED: ${item.sped}`, `Estrutura: ${item.merchandisingPath}`];
  if (item.saleUnit) parts.push(`Unid. venda: ${item.saleUnit}`);
  if (item.buyUnit) parts.push(`Unid. compra: ${item.buyUnit}`);
  return parts.join(' · ');
}

async function clearStoreCatalog() {
  if (DRY_RUN) return;
  await query(`DELETE FROM product_options WHERE product_id IN (SELECT id FROM products WHERE store_id = $1)`, [STORE_ID]);
  await query(`DELETE FROM cart_items WHERE product_id IN (SELECT id FROM products WHERE store_id = $1)`, [STORE_ID]);
  await query(`DELETE FROM products WHERE store_id = $1`, [STORE_ID]);
  await query(`DELETE FROM categories WHERE store_id = $1`, [STORE_ID]);
}

async function insertProduct(categoryId, item) {
  if (DRY_RUN) return { action: 'dry-run' };
  const result = await query(
    `INSERT INTO products (category_id, name, sped_code, description, price, image_url, image_asset_id, available, store_id)
     VALUES ($1, $2, $3, $4, $5, NULL, NULL, true, $6)`,
    [categoryId, item.name, item.sped, buildDescription(item), item.price, STORE_ID]
  );
  return { action: 'inserted', id: result.insertId };
}

async function main() {
  const absPath = path.resolve(xlsxPath);
  if (!fs.existsSync(absPath)) throw new Error(`Arquivo não encontrado: ${absPath}`);

  console.log(`Lendo ${absPath}...`);
  const items = readRows(absPath);
  console.log(`Produtos na planilha: ${items.length}`);

  const categoryNames = new Set(items.map((i) => i.categoryName));
  console.log(`Categorias consolidadas: ${categoryNames.size}`);
  for (const name of CATEGORY_ORDER.filter((n) => categoryNames.has(n))) {
    const count = items.filter((i) => i.categoryName === name).length;
    console.log(`  - ${name}: ${count}`);
  }

  if (!DRY_RUN) await clearStoreCatalog();
  const categoryMap = await ensureCategories(categoryNames);

  let inserted = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const categoryId = categoryMap.get(item.categoryName);
    if (!categoryId && !DRY_RUN) {
      throw new Error(`Categoria não encontrada: ${item.categoryName}`);
    }
    const result = await insertProduct(categoryId, item);
    if (result.action === 'inserted') inserted += 1;
    if ((i + 1) % 200 === 0 || i + 1 === items.length) {
      console.log(`Progresso ${i + 1}/${items.length}`);
    }
  }

  console.log('\nResumo:');
  console.log(`  Produtos importados: ${items.length}`);
  console.log(`  Inseridos: ${inserted}`);
  console.log(`  Categorias: ${categoryNames.size}`);
  console.log('  Imagens: nenhuma (importação sem foto)');
  if (DRY_RUN) console.log('  (dry-run — nenhuma alteração no banco)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
