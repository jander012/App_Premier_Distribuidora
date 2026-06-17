import { query } from '../config/db.js';
import * as mediaRepo from './mediaRepository.js';
import { AppError } from '../../domain/shared/AppError.js';
import { ingestRemoteImage } from '../../application/services/mediaIngestService.js';

function localMediaFileIdFromUrl(url) {
  const s = String(url || '').trim();
  const id = '([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})';
  const m = s.match(new RegExp(`^/api/media/files/${id}(?:[?#].*)?$`, 'i'));
  if (m) return m[1];
  const m2 = s.match(new RegExp(`^/media/files/${id}(?:[?#].*)?$`, 'i'));
  if (m2) return m2[1];
  const m3 = s.match(new RegExp(`https?://[^/]+/api/media/files/${id}(?:[?#].*)?$`, 'i'));
  if (m3) return m3[1];
  const m4 = s.match(new RegExp(`https?://[^/]+/media/files/${id}(?:[?#].*)?$`, 'i'));
  return m4 ? m4[1] : null;
}

export async function listCategories(storeId) {
  const { rows } = await query(
    `SELECT id, name, sort_order, active FROM categories
     WHERE active = true AND store_id = $1
     ORDER BY sort_order, id`,
    [storeId]
  );
  return rows;
}

export async function listProducts({ storeId, categoryId, availableOnly = true } = {}) {
  if (!storeId) throw new Error('storeId obrigatório');
  let sql = `SELECT p.id, p.category_id, p.name, p.description, p.price, p.available, p.store_id,
     COALESCE(m.public_url, p.image_url) AS image_url
     FROM products p
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     WHERE p.store_id = $1`;
  const params = [storeId];
  if (availableOnly) sql += ` AND p.available = true`;
  if (categoryId) {
    params.push(categoryId);
    sql += ` AND p.category_id = $${params.length}`;
  }
  sql += ` ORDER BY p.category_id, p.id`;
  const { rows } = await query(sql, params);
  return rows;
}

export async function listProductsPage(
  storeId,
  { page = 1, limit = 24, categoryId, availableOnly = true } = {}
) {
  if (!storeId) throw new Error('storeId obrigatório');
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 48);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const params = [storeId];
  let where = 'WHERE p.store_id = $1';
  if (availableOnly) where += ' AND p.available = true';
  if (categoryId) {
    params.push(categoryId);
    where += ` AND p.category_id = $${params.length}`;
  }

  const { rows: countRows } = await query(`SELECT COUNT(*) AS n FROM products p ${where}`, params);
  const total = countRows[0]?.n ?? 0;

  const { rows } = await query(
    `SELECT p.id, p.category_id, p.name, p.description, p.price, p.available, p.store_id,
            COALESCE(m.public_url, p.image_url) AS image_url
     FROM products p
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     ${where}
     ORDER BY p.category_id, p.id
     LIMIT ${safeLimit} OFFSET ${offset}`,
    params
  );

  const loaded = offset + rows.length;
  return {
    items: rows,
    total,
    page: safePage,
    limit: safeLimit,
    hasMore: loaded < total,
  };
}

const HIGHLIGHT_PRODUCT_FIELDS = `
  p.id, p.category_id, p.name, p.description, p.price, p.available, p.store_id,
  COALESCE(m.public_url, p.image_url) AS image_url,
  (
    SELECT COUNT(*)
    FROM product_options po
    WHERE po.product_id = p.id AND po.active = true AND po.required_choice = true
  ) AS required_options_count
`;

export async function listBestSellingProducts(storeId, { limit = 12 } = {}) {
  if (!storeId) throw new Error('storeId obrigatório');
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 24);
  const { rows } = await query(
    `SELECT ${HIGHLIGHT_PRODUCT_FIELDS},
            SUM(oi.quantity) AS sold_qty
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     INNER JOIN products p ON p.id = oi.product_id AND p.store_id = o.store_id
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     WHERE o.store_id = $1
       AND o.status <> 'cancelled'
       AND p.available = true
     GROUP BY p.id, p.category_id, p.name, p.description, p.price, p.available, p.store_id, m.public_url, p.image_url
     HAVING sold_qty > 0
     ORDER BY sold_qty DESC, p.name ASC
     LIMIT ${safeLimit}`,
    [storeId]
  );
  return rows.map((row) => ({
    ...row,
    sold_qty: Number(row.sold_qty) || 0,
    required_options_count: Number(row.required_options_count) || 0,
  }));
}

export async function listBuyAgainProducts(storeId, customerPhone, { limit = 12 } = {}) {
  if (!storeId) throw new Error('storeId obrigatório');
  if (!customerPhone) return [];
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 24);
  const { rows } = await query(
    `SELECT ${HIGHLIGHT_PRODUCT_FIELDS},
            MAX(o.created_at) AS last_ordered_at,
            SUM(oi.quantity) AS purchased_qty
     FROM order_items oi
     INNER JOIN orders o ON o.id = oi.order_id
     INNER JOIN products p ON p.id = oi.product_id AND p.store_id = o.store_id
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     WHERE o.store_id = $1
       AND o.customer_phone = $2
       AND o.status <> 'cancelled'
       AND p.available = true
     GROUP BY p.id, p.category_id, p.name, p.description, p.price, p.available, p.store_id, m.public_url, p.image_url
     ORDER BY last_ordered_at DESC
     LIMIT ${safeLimit}`,
    [storeId, customerPhone]
  );
  return rows.map((row) => ({
    ...row,
    purchased_qty: Number(row.purchased_qty) || 0,
    required_options_count: Number(row.required_options_count) || 0,
  }));
}

export async function getProductWithOptions(id, storeId) {
  const { rows: products } = await query(
    `SELECT p.id, p.category_id, p.name, p.description, p.price, p.available, p.store_id,
            COALESCE(m.public_url, p.image_url) AS image_url
     FROM products p
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     WHERE p.id = $1 AND p.store_id = $2`,
    [id, storeId]
  );
  const product = products[0];
  if (!product) return null;
  const { rows: options } = await query(
    `SELECT id, name, price_extra, required_choice, max_select, sort_order, active
     FROM product_options WHERE product_id = $1 AND active = true ORDER BY sort_order, id`,
    [id]
  );
  return { ...product, options };
}

export async function adminGetProductById(id, storeId) {
  const { rows: products } = await query(
    `SELECT p.id, p.category_id, p.name, p.description, p.price, p.image_url, p.image_asset_id,
            p.available, p.store_id, p.created_at, p.updated_at, c.name AS category_name,
            COALESCE(m.public_url, p.image_url) AS display_image_url
     FROM products p
     JOIN categories c ON c.id = p.category_id AND c.store_id = p.store_id
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     WHERE p.id = $1 AND p.store_id = $2`,
    [id, storeId]
  );
  const product = products[0];
  if (!product) return null;
  const { rows: options } = await query(
    `SELECT id, name, price_extra, required_choice, max_select, sort_order, active
     FROM product_options WHERE product_id = $1 ORDER BY sort_order, id`,
    [id]
  );
  return { ...product, options };
}

export async function adminListCategories(storeId) {
  const { rows } = await query(
    `SELECT c.*,
       (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.store_id = c.store_id) AS product_count
     FROM categories c
     WHERE c.store_id = $1
     ORDER BY c.sort_order, c.id`,
    [storeId]
  );
  return rows;
}

export async function adminCreateCategory({ name, sortOrder = 0, active = true, storeId }) {
  const n = String(name || '').trim();
  if (!n) throw new AppError(400, 'Nome da categoria obrigatório');
  const result = await query(
    `INSERT INTO categories (name, sort_order, active, store_id) VALUES ($1, $2, $3, $4)`,
    [n, Number(sortOrder) || 0, active !== false, storeId]
  );
  const { rows } = await query(`SELECT * FROM categories WHERE id = $1`, [result.insertId]);
  return rows[0];
}

export async function adminUpdateCategory(id, storeId, data) {
  const cur = await query(`SELECT * FROM categories WHERE id = $1 AND store_id = $2`, [id, storeId]);
  if (!cur.rows[0]) return null;
  const row = cur.rows[0];
  const name = data.name !== undefined ? data.name : row.name;
  const sortOrder = data.sortOrder !== undefined ? data.sortOrder : row.sort_order;
  const active = data.active !== undefined ? data.active : row.active;
  await query(
    `UPDATE categories SET name = $3, sort_order = $4, active = $5, updated_at = now()
     WHERE id = $1 AND store_id = $2`,
    [id, storeId, name, sortOrder, active]
  );
  const { rows } = await query(`SELECT * FROM categories WHERE id = $1 AND store_id = $2`, [id, storeId]);
  return rows[0];
}

export async function adminCountProductsInCategory(categoryId, storeId) {
  const { rows } = await query(
    `SELECT COUNT(*) AS n FROM products WHERE category_id = $1 AND store_id = $2`,
    [categoryId, storeId]
  );
  return rows[0]?.n ?? 0;
}

export async function adminDeleteCategory(id, storeId) {
  const n = await adminCountProductsInCategory(id, storeId);
  if (n > 0) return { ok: false, reason: 'has_products', productCount: n };
  const { rowCount } = await query(`DELETE FROM categories WHERE id = $1 AND store_id = $2`, [id, storeId]);
  return { ok: rowCount > 0, reason: rowCount ? null : 'not_found' };
}

async function resolveImageAsset(imageUrl, storeId) {
  const url = imageUrl?.trim();
  if (!url) return { image_url: null, image_asset_id: null };
  const localId = localMediaFileIdFromUrl(url);
  if (localId) {
    const row = await mediaRepo.findForMediaFileServe(localId);
    if (row) {
      const hasFile = Boolean(row.storage_path && String(row.storage_path).trim());
      let image_url;
      if (hasFile) {
        image_url = `/api/media/files/${row.id}`;
      } else if (/^https?:\/\//i.test(String(row.public_url || '').trim())) {
        image_url = String(row.public_url).trim();
      } else {
        image_url = `/api/media/files/${row.id}`;
      }
      return { image_url, image_asset_id: row.id };
    }
    throw new AppError(
      400,
      'Imagem da biblioteca não encontrada para este endereço. Confira em Imagens se a mídia existe ou cadastre de novo com download (sem "só link").'
    );
  }
  if (/^https?:\/\//i.test(url)) {
    const row = await ingestRemoteImage(url, { storeId: storeId ?? null, title: null });
    return { image_url: row.public_url, image_asset_id: row.id };
  }
  const m = await mediaRepo.upsertMediaByPublicUrl(url, { storeId: storeId ?? null, title: null });
  return { image_url: m?.public_url ?? url, image_asset_id: m?.id ?? null };
}

export async function adminCreateProduct(data) {
  const { image_url, image_asset_id } = await resolveImageAsset(data.imageUrl, data.storeId);
  const result = await query(
    `INSERT INTO products (category_id, name, description, price, image_url, image_asset_id, available, store_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      data.categoryId,
      data.name,
      data.description,
      data.price,
      image_url,
      image_asset_id,
      data.available !== false,
      data.storeId,
    ]
  );
  const { rows } = await query(`SELECT * FROM products WHERE id = $1`, [result.insertId]);
  return rows[0];
}

export async function adminUpdateProduct(id, storeId, data) {
  const cur = await query(`SELECT image_url, image_asset_id FROM products WHERE id = $1 AND store_id = $2`, [
    id,
    storeId,
  ]);
  if (!cur.rows[0]) return null;

  let image_url = cur.rows[0].image_url;
  let image_asset_id = cur.rows[0].image_asset_id;
  if (data.imageUrl !== undefined) {
    if (!String(data.imageUrl || '').trim()) {
      image_url = null;
      image_asset_id = null;
    } else {
      const r = await resolveImageAsset(data.imageUrl, storeId);
      image_url = r.image_url;
      image_asset_id = r.image_asset_id;
    }
  }

  await query(
    `UPDATE products SET
       category_id = COALESCE($3, category_id),
       name = COALESCE($4, name),
       description = COALESCE($5, description),
       price = COALESCE($6, price),
       image_url = $7,
       image_asset_id = $8,
       available = COALESCE($9, available),
       updated_at = now()
     WHERE id = $1 AND store_id = $2`,
    [
      id,
      storeId,
      data.categoryId,
      data.name,
      data.description,
      data.price,
      image_url,
      image_asset_id,
      data.available,
    ]
  );
  const { rows } = await query(`SELECT * FROM products WHERE id = $1 AND store_id = $2`, [id, storeId]);
  return rows[0];
}

export async function adminSetAvailability(id, storeId, available) {
  await query(
    `UPDATE products SET available = $3, updated_at = now() WHERE id = $1 AND store_id = $2`,
    [id, storeId, available]
  );
  const { rows } = await query(`SELECT * FROM products WHERE id = $1 AND store_id = $2`, [id, storeId]);
  return rows[0];
}

export async function adminDeleteProduct(id, storeId) {
  const { rowCount } = await query(`DELETE FROM products WHERE id = $1 AND store_id = $2`, [id, storeId]);
  return rowCount > 0;
}

export async function adminListProductsPage(storeId, { page = 1, limit = 12, q } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 48);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const search = q && String(q).trim() ? `%${String(q).trim()}%` : null;

  const baseParams = [storeId];
  let where = 'WHERE p.store_id = $1';
  if (search) {
    baseParams.push(search);
    where += ` AND (p.name LIKE $2 OR COALESCE(p.description,'') LIKE $2)`;
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS n FROM products p ${where}`,
    baseParams
  );
  const total = countRows[0]?.n ?? 0;

  const { rows } = await query(
    `SELECT p.id, p.category_id, p.name, p.description, p.price, p.available, p.store_id,
            COALESCE(m.public_url, p.image_url) AS image_url
     FROM products p
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     ${where}
     ORDER BY p.id DESC
     LIMIT ${safeLimit} OFFSET ${offset}`,
    baseParams
  );

  return {
    items: rows,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(total / safeLimit) || 1),
  };
}
