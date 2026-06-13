import { query } from '../config/db.js';

export async function findAdminByEmail(email) {
  const key = String(email ?? '').trim().toLowerCase();
  if (!key) return null;
  const { rows } = await query(`SELECT * FROM admin_users WHERE lower(trim(email)) = $1`, [key]);
  return rows[0] || null;
}

export async function findAdminById(id) {
  try {
    const { rows } = await query(
      `SELECT id, email, password_hash, is_super_admin FROM admin_users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  } catch (e) {
    if (e.code === '42703') {
      const { rows } = await query(
        `SELECT id, email, password_hash FROM admin_users WHERE id = $1`,
        [id]
      );
      const r = rows[0];
      return r ? { ...r, is_super_admin: false } : null;
    }
    throw e;
  }
}

export async function linkAdminToStore(adminUserId, storeId) {
  await query(
    `INSERT IGNORE INTO admin_user_stores (admin_user_id, store_id) VALUES ($1, $2)`,
    [adminUserId, storeId]
  );
}

export async function setAdminStores(adminUserId, storeIds) {
  await query(`DELETE FROM admin_user_stores WHERE admin_user_id = $1`, [adminUserId]);
  if (!storeIds.length) return;
  for (const storeId of storeIds) {
    await linkAdminToStore(adminUserId, storeId);
  }
}

export async function createAdminUser({ email, passwordHash, isSuperAdmin }) {
  const result = await query(
    `INSERT INTO admin_users (email, password_hash, is_super_admin) VALUES ($1, $2, $3)
     `,
    [email, passwordHash, Boolean(isSuperAdmin)]
  );
  const { rows } = await query(`SELECT id, email, is_super_admin, created_at FROM admin_users WHERE id = $1`, [
    result.insertId,
  ]);
  return rows[0];
}

export async function listAdminsWithStores() {
  const { rows } = await query(`
    SELECT au.id, au.email, au.is_super_admin, au.created_at,
      COALESCE(
        (SELECT CONCAT('[', GROUP_CONCAT(
            JSON_OBJECT('id', s.id, 'name', s.name, 'slug', s.slug, 'active', s.active)
            ORDER BY s.name SEPARATOR ','
          ), ']')
         FROM admin_user_stores aus
         JOIN stores s ON s.id = aus.store_id
         WHERE aus.admin_user_id = au.id),
        '[]'
      ) AS stores
    FROM admin_users au
    ORDER BY au.email
  `);
  return rows;
}

export async function listAdminsWithStoresByIds(ids) {
  if (!ids.length) return [];
  const placeholders = ids.map((_, index) => `$${index + 1}`).join(', ');
  const { rows } = await query(
    `
    SELECT au.id, au.email, au.is_super_admin, au.created_at,
      COALESCE(
        (SELECT CONCAT('[', GROUP_CONCAT(
            JSON_OBJECT('id', s.id, 'name', s.name, 'slug', s.slug, 'active', s.active)
            ORDER BY s.name SEPARATOR ','
          ), ']')
         FROM admin_user_stores aus
         JOIN stores s ON s.id = aus.store_id
         WHERE aus.admin_user_id = au.id),
        '[]'
      ) AS stores
    FROM admin_users au
    WHERE au.id IN (${placeholders})
    ORDER BY au.email
  `,
    ids
  );
  return rows;
}

export async function listStoresForAdmin(adminUserId) {
  const { rows } = await query(
    `SELECT s.id, s.name, s.slug, s.active
     FROM stores s
     INNER JOIN admin_user_stores aus ON aus.store_id = s.id
     WHERE aus.admin_user_id = $1
     ORDER BY s.name`,
    [adminUserId]
  );
  return rows;
}

export async function adminHasStoreAccess(adminUserId, storeId) {
  const { rows } = await query(
    `SELECT 1 FROM admin_user_stores WHERE admin_user_id = $1 AND store_id = $2`,
    [adminUserId, storeId]
  );
  return rows.length > 0;
}
