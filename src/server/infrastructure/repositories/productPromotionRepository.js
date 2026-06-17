import { query } from '../config/db.js';

const PROMO_DATE_FILTER = `
  AND (pp.valid_from IS NULL OR pp.valid_from <= NOW())
  AND (pp.valid_until IS NULL OR pp.valid_until >= NOW())
`;

const HIGHLIGHT_PRODUCT_FIELDS = `
  p.id, p.category_id, p.name, p.description, p.price, p.available, p.store_id,
  COALESCE(m.public_url, p.image_url) AS image_url,
  pp.id AS promotion_id,
  pp.sort_order AS promotion_sort_order,
  pp.valid_from AS promotion_valid_from,
  pp.valid_until AS promotion_valid_until
`;

export async function listActivePromotedProducts(storeId, { limit = 12 } = {}) {
  if (!storeId) throw new Error('storeId obrigatório');
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 24);
  const { rows } = await query(
    `SELECT ${HIGHLIGHT_PRODUCT_FIELDS}
     FROM product_promotions pp
     INNER JOIN products p ON p.id = pp.product_id AND p.store_id = pp.store_id
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     WHERE pp.store_id = $1
       AND pp.active = true
       AND p.available = true
       ${PROMO_DATE_FILTER}
     ORDER BY pp.sort_order ASC, pp.id DESC
     LIMIT ${safeLimit}`,
    [storeId]
  );
  return rows;
}

export async function listByStore(storeId) {
  const { rows } = await query(
    `SELECT pp.id, pp.store_id, pp.product_id, pp.sort_order, pp.active,
            pp.valid_from, pp.valid_until, pp.created_at, pp.updated_at,
            p.name AS product_name, p.price AS product_price, p.available AS product_available,
            COALESCE(m.public_url, p.image_url) AS product_image_url
     FROM product_promotions pp
     INNER JOIN products p ON p.id = pp.product_id AND p.store_id = pp.store_id
     LEFT JOIN media_assets m ON m.id = p.image_asset_id
     WHERE pp.store_id = $1
     ORDER BY pp.sort_order ASC, pp.id DESC`,
    [storeId]
  );
  return rows;
}

export async function findByIdForStore(id, storeId) {
  const { rows } = await query(`SELECT * FROM product_promotions WHERE id = $1 AND store_id = $2`, [
    id,
    storeId,
  ]);
  return rows[0] || null;
}

export async function insertPromotion(storeId, row) {
  const result = await query(
    `INSERT INTO product_promotions (store_id, product_id, sort_order, active, valid_from, valid_until)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      storeId,
      row.product_id,
      row.sort_order ?? 0,
      row.active !== false,
      row.valid_from ?? null,
      row.valid_until ?? null,
    ]
  );
  const { rows } = await query(`SELECT * FROM product_promotions WHERE id = $1`, [result.insertId]);
  return rows[0];
}

export async function updatePromotion(id, storeId, patch) {
  const allowed = ['product_id', 'sort_order', 'active', 'valid_from', 'valid_until'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const k of allowed) {
    if (patch[k] !== undefined) {
      sets.push(`${k} = $${i++}`);
      vals.push(patch[k]);
    }
  }
  if (sets.length === 0) return findByIdForStore(id, storeId);
  vals.push(id, storeId);
  await query(`UPDATE product_promotions SET ${sets.join(', ')} WHERE id = $${i++} AND store_id = $${i}`, vals);
  return findByIdForStore(id, storeId);
}

export async function deletePromotion(id, storeId) {
  const { rowCount } = await query(`DELETE FROM product_promotions WHERE id = $1 AND store_id = $2`, [
    id,
    storeId,
  ]);
  return rowCount > 0;
}
