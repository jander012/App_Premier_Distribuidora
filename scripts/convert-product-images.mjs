import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';
import sharp from 'sharp';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const STORE_ID = Number(process.env.IMPORT_STORE_ID || 1);
const SIZE = Number(process.env.IMAGE_SIZE || 800);
const DRY_RUN = process.argv.includes('--dry-run');
const OVERWRITE = process.argv.includes('--overwrite');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? Number(limitArg.split('=')[1]) : Infinity;

const folderArg = process.argv.find((a) => !a.startsWith('--') && (fs.existsSync(a) && fs.statSync(a).isDirectory()));
const IMAGES_DIR = folderArg || 'C:/Users/jande/Downloads/imagens premier';
const xlsxArg = process.argv.find((a) => a.toLowerCase().endsWith('.xlsx') || a.toLowerCase().endsWith('.xls'));
const XLSX_PATH = xlsxArg || path.join(IMAGES_DIR, 'PRODUTOS ATUALIZADOS 01-10.xlsx');

const MEDIA_DIR = process.env.MEDIA_UPLOAD_DIR
  ? path.resolve(process.env.MEDIA_UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads', 'media');

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);

function normText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function digitsOf(s) {
  return String(s ?? '').replace(/\D/g, '');
}

function indexLocalFiles(dir) {
  const byDigits = new Map();
  const byTokens = [];
  if (!fs.existsSync(dir)) return { byDigits, byTokens };
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!IMG_EXT.has(ext)) continue;
      const base = path.basename(entry.name, ext);
      const dg = digitsOf(base);
      if (dg.length >= 8) byDigits.set(dg, full);
      const norm = normText(base);
      if (norm) byTokens.push({ file: full, tokens: norm.split(' ').filter(Boolean), norm });
    }
  };
  walk(dir);
  return { byDigits, byTokens };
}

function indexLinks(xlsxPath) {
  const byDigits = new Map();
  if (!fs.existsSync(xlsxPath)) return byDigits;
  const wb = XLSX.readFile(xlsxPath);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Itens'] || wb.Sheets[wb.SheetNames[0]], { defval: '' });
  for (const r of rows) {
    const keys = Object.keys(r);
    const codeKey = keys.find((k) => normText(k).includes('codigo') || normText(k) === 'codigo');
    const imgKey = keys.find((k) => normText(k).includes('imagem'));
    const code = digitsOf(r[codeKey]);
    const url = String(r[imgKey] ?? '').trim();
    if (code && /^https?:\/\//i.test(url)) byDigits.set(code, url);
  }
  return byDigits;
}

function matchLocalByName(productNorm, byTokens) {
  const matches = byTokens.filter((f) => f.tokens.length && f.tokens.every((t) => productNorm.includes(t)));
  if (matches.length === 1) return matches[0].file;
  if (matches.length > 1) {
    matches.sort((a, b) => b.tokens.length - a.tokens.length);
    return matches[0].file;
  }
  return null;
}

async function loadSourceBuffer(source) {
  if (source.kind === 'local') {
    return fs.promises.readFile(source.value);
  }
  const res = await fetch(source.value, {
    headers: { 'User-Agent': 'Mozilla/5.0 (image-fetch)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function processToWebp(buffer) {
  return sharp(buffer)
    .resize(SIZE, SIZE, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .webp({ quality: 82 })
    .toBuffer();
}

async function main() {
  console.log(`Pasta de imagens: ${IMAGES_DIR}`);
  console.log(`Planilha (links): ${XLSX_PATH}`);
  console.log(`Saída de mídia:   ${MEDIA_DIR}`);
  console.log(`Tamanho alvo:     ${SIZE}x${SIZE} (webp, fundo branco)`);
  if (DRY_RUN) console.log('MODO: dry-run (nenhuma alteração)');

  const local = indexLocalFiles(IMAGES_DIR);
  const links = indexLinks(XLSX_PATH);
  console.log(`Arquivos locais indexados: ${local.byDigits.size} por código, ${local.byTokens.length} por nome`);
  console.log(`Links na planilha: ${links.size}`);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });

  const [products] = await conn.query(
    `SELECT id, name, sped_code, image_asset_id FROM products WHERE store_id = ? ORDER BY id`,
    [STORE_ID]
  );

  if (!DRY_RUN) await fs.promises.mkdir(MEDIA_DIR, { recursive: true });

  let matched = 0;
  let done = 0;
  let skipped = 0;
  let failed = 0;

  for (const p of products) {
    if (done >= LIMIT) break;
    if (p.image_asset_id && !OVERWRITE) continue;

    const dg = digitsOf(p.sped_code);
    const pNorm = normText(p.name);
    let source = null;
    if (dg && local.byDigits.has(dg)) source = { kind: 'local', value: local.byDigits.get(dg) };
    if (!source) {
      const byName = matchLocalByName(pNorm, local.byTokens);
      if (byName) source = { kind: 'local', value: byName };
    }
    if (!source && dg && links.has(dg)) source = { kind: 'link', value: links.get(dg) };
    if (!source) continue;

    matched += 1;
    if (DRY_RUN) {
      console.log(`[match] #${p.id} ${p.name} <= ${source.kind}:${path.basename(source.value)}`);
      done += 1;
      continue;
    }

    try {
      const raw = await loadSourceBuffer(source);
      const out = await processToWebp(raw);
      const hash = crypto.createHash('sha256').update(out).digest('hex');

      const [exist] = await conn.query(`SELECT id FROM media_assets WHERE content_hash = ? LIMIT 1`, [hash]);
      let mediaId;
      if (exist.length) {
        mediaId = exist[0].id;
      } else {
        mediaId = randomUUID();
        const fileName = `${mediaId}.webp`;
        await fs.promises.writeFile(path.join(MEDIA_DIR, fileName), out);
        await conn.query(
          `INSERT INTO media_assets (id, content_hash, public_url, title, store_id, storage_path, mime_type, source_url)
           VALUES (?, ?, ?, ?, ?, ?, 'image/webp', ?)`,
          [mediaId, hash, `/api/media/files/${mediaId}`, p.name, STORE_ID, fileName, source.kind === 'link' ? source.value : null]
        );
      }
      await conn.query(`UPDATE products SET image_asset_id = ?, image_url = ? WHERE id = ?`, [
        mediaId,
        `/api/media/files/${mediaId}`,
        p.id,
      ]);
      done += 1;
      console.log(`[ok] #${p.id} ${p.name} (${source.kind})`);
    } catch (e) {
      failed += 1;
      console.log(`[falha] #${p.id} ${p.name} <= ${source.kind}:${source.value} :: ${e.message}`);
    }
  }

  await conn.end();

  console.log('\nResumo:');
  console.log(`  Produtos avaliados: ${products.length}`);
  console.log(`  Com fonte de imagem encontrada: ${matched}`);
  console.log(`  Convertidos/vinculados: ${done}`);
  console.log(`  Falhas: ${failed}`);
  if (skipped) console.log(`  Pulados: ${skipped}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
