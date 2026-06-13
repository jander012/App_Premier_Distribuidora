import { query } from '../config/db.js';

export async function listByStore(storeId) {
  const { rows } = await query(
    `SELECT id, store_id, code, active, discount_type, percent_value, max_discount_per_order,
            fixed_amount, max_uses_per_user, max_total_discount_per_user, valid_from, valid_until, created_at
     FROM coupons WHERE store_id = $1 ORDER BY created_at DESC`,
    [storeId]
  );
  return rows;
}

export async function findByIdForStore(id, storeId) {
  const { rows } = await query(`SELECT * FROM coupons WHERE id = $1 AND store_id = $2`, [id, storeId]);
  return rows[0] || null;
}

export async function findActiveByCode(storeId, rawCode) {
  const code = String(rawCode || '').trim();
  if (!code) return null;
  const { rows } = await query(
    `SELECT * FROM coupons
     WHERE store_id = $1 AND active = true AND lower(code) = lower($2)
     LIMIT 1`,
    [storeId, code]
  );
  return rows[0] || null;
}

export async function insertCoupon(storeId, row) {
  const result = await query(
    `INSERT INTO coupons (
      store_id, code, active, discount_type, percent_value, max_discount_per_order, fixed_amount,
      max_uses_per_user, max_total_discount_per_user, valid_from, valid_until
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      storeId,
      String(row.code).trim(),
      row.active !== false,
      row.discount_type,
      row.percent_value ?? null,
      row.max_discount_per_order ?? null,
      row.fixed_amount ?? null,
      row.max_uses_per_user ?? null,
      row.max_total_discount_per_user ?? null,
      row.valid_from ?? null,
      row.valid_until ?? null,
    ]
  );
  const { rows } = await query(`SELECT * FROM coupons WHERE id = $1`, [result.insertId]);
  return rows[0];
}

export async function updateCoupon(id, storeId, patch) {
  const allowed = [
    'code',
    'active',
    'discount_type',
    'percent_value',
    'max_discount_per_order',
    'fixed_amount',
    'max_uses_per_user',
    'max_total_discount_per_user',
    'valid_from',
    'valid_until',
  ];
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
  await query(`UPDATE coupons SET ${sets.join(', ')} WHERE id = $${i++} AND store_id = $${i}`, vals);
  return findByIdForStore(id, storeId);
}

export async function deleteCoupon(id, storeId) {
  const { rowCount } = await query(`DELETE FROM coupons WHERE id = $1 AND store_id = $2`, [id, storeId]);
  return rowCount > 0;
}

export async function countUsesByCustomer(couponId, customerId) {
  const { rows } = await query(
    `SELECT COUNT(*) AS n FROM coupon_redemptions WHERE coupon_id = $1 AND customer_id = $2`,
    [couponId, customerId]
  );
  return rows[0]?.n ?? 0;
}

export async function sumDiscountByCustomer(couponId, customerId) {
  const { rows } = await query(
    `SELECT COALESCE(SUM(discount_amount), 0) AS s
     FROM coupon_redemptions WHERE coupon_id = $1 AND customer_id = $2`,
    [couponId, customerId]
  );
  return Number(rows[0]?.s ?? 0);
}

export async function insertRedemption({ couponId, customerId, orderId, discountAmount }) {
  await query(
    `INSERT INTO coupon_redemptions (coupon_id, customer_id, order_id, discount_amount)
     VALUES ($1, $2, $3, $4)`,
    [couponId, customerId, orderId, discountAmount]
  );
}
