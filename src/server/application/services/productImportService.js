import * as XLSX from 'xlsx';
import * as menuRepo from '../../infrastructure/repositories/menuRepository.js';
import { AppError } from '../../domain/shared/AppError.js';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function titleCase(value) {
  return clean(value)
    .toLowerCase()
    .replace(/(^|[\s/\-])([a-zà-ÿ])/g, (_, sep, ch) => sep + ch.toUpperCase());
}

function parsePrice(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : null;
  }
  const s = String(value ?? '').trim();
  if (!s) return null;
  // "1.234,56" (formato BR) -> remove milhar e troca virgula; "75.49" mantem.
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function normKey(value) {
  return clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function pick(row, keys, needles) {
  const key = keys.find((k) => needles.every((nd) => normKey(k).includes(nd)));
  return key ? row[key] : '';
}

function firstFilled(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && String(v).trim() !== '') return v;
  }
  return '';
}

function normalizeRow(row) {
  const keys = Object.keys(row);
  const code = clean(firstFilled(pick(row, keys, ['codigo']), row.code, row.codigo));
  const name = clean(firstFilled(pick(row, keys, ['descri']), row.name, row.nome));
  const categoryRaw = clean(firstFilled(pick(row, keys, ['categoria']), row.categoryName, row.categoria));
  const ncm = clean(firstFilled(pick(row, keys, ['ncm']), row.ncm));
  const unit = clean(firstFilled(pick(row, keys, ['unid']), row.unit));
  const image = clean(firstFilled(pick(row, keys, ['imagem']), row.imageUrl, row.image));
  const price = parsePrice(firstFilled(pick(row, keys, ['venda']), row.price, row.preco));
  const descParts = [];
  if (code) descParts.push(`Cód.: ${code}`);
  if (ncm) descParts.push(`NCM: ${ncm}`);
  if (unit) descParts.push(`Unid.: ${unit}`);
  return {
    code,
    name,
    price,
    categoryName: categoryRaw ? titleCase(categoryRaw) : 'Outros',
    imageUrl: /^https?:\/\//i.test(image) ? image : null,
    description: descParts.join(' · ') || null,
  };
}

/**
 * Le um buffer XLSX e retorna linhas normalizadas de produto.
 * Usa a aba "Itens" quando existir; senao a primeira aba.
 */
export function parseProductsXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const sheet = wb.Sheets['Itens'] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new AppError(400, 'Planilha vazia ou sem abas.');
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  return rows.map(normalizeRow).filter((r) => r.code || r.name);
}

/**
 * Normaliza linhas vindas de JSON (script/integracao).
 */
export function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeRow).filter((r) => r.code || r.name);
}

/**
 * Upsert por codigo unico (sped_code):
 * - Existe -> atualiza nome e preco (e imagem, se houver link).
 * - Nao existe -> cria o produto na categoria informada.
 * @param {number} storeId
 * @param {Array} rows linhas normalizadas
 * @param {{ updateImages?: boolean }} opts
 */
export async function upsertProducts(storeId, rows, { updateImages = true } = {}) {
  let created = 0;
  let updated = 0;
  let imagesUpdated = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const line = i + 2; // +1 cabecalho, +1 base 1
    try {
      const code = clean(r.code);
      const name = clean(r.name);
      if (!code) {
        skipped += 1;
        errors.push({ line, error: 'Linha sem código único (ignorada).' });
        continue;
      }
      if (!name) {
        skipped += 1;
        errors.push({ line, error: `Código ${code} sem nome (ignorado).` });
        continue;
      }
      const price = r.price;
      const imageUrl = updateImages && r.imageUrl ? r.imageUrl : null;

      const existing = await menuRepo.findProductBySpedCode(storeId, code);
      if (existing) {
        await menuRepo.adminUpdateProduct(existing.id, storeId, {
          name,
          price: price != null ? price : null,
        });
        updated += 1;
        if (imageUrl) {
          try {
            await menuRepo.adminUpdateProduct(existing.id, storeId, { imageUrl });
            imagesUpdated += 1;
          } catch (imgErr) {
            errors.push({ line, error: `Imagem (${code}): ${imgErr.message}` });
          }
        }
      } else {
        const categoryId = await menuRepo.findOrCreateCategoryByName(storeId, r.categoryName);
        const prod = await menuRepo.adminCreateProduct({
          storeId,
          categoryId,
          name,
          description: r.description || null,
          price: price != null ? price : 0,
          spedCode: code,
          available: true,
        });
        created += 1;
        if (imageUrl) {
          try {
            await menuRepo.adminUpdateProduct(prod.id, storeId, { imageUrl });
            imagesUpdated += 1;
          } catch (imgErr) {
            errors.push({ line, error: `Imagem (${code}): ${imgErr.message}` });
          }
        }
      }
    } catch (e) {
      errors.push({ line, error: e.message });
    }
  }

  return {
    total: rows.length,
    created,
    updated,
    imagesUpdated,
    skipped,
    errorCount: errors.length,
    errors: errors.slice(0, 50),
  };
}
