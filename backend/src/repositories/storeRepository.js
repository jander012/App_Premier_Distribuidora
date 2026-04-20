import { pool, query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';

export function slugify(input) {
  return (
    String(input || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'loja'
  );
}

export async function listActiveStores() {
  const { rows } = await query(
    `SELECT id, name, slug FROM stores WHERE active = true ORDER BY name`
  );
  return rows;
}

export async function findStoreBySlug(slug) {
  if (!slug) return null;
  const { rows } = await query(
    `SELECT id, name, slug, active FROM stores WHERE slug = $1 AND active = true`,
    [slug]
  );
  return rows[0] || null;
}

export async function findStoreById(id) {
  const { rows } = await query(`SELECT id, name, slug, active FROM stores WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function listAllStoresAdmin() {
  const { rows } = await query(
    `SELECT id, name, slug, active, created_at FROM stores ORDER BY name`
  );
  return rows;
}

export async function createStoreWithDefaults({ name, slug }) {
  const base = slugify(slug || name);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let finalSlug = base;
    let suffix = 2;
    for (;;) {
      const { rows: chk } = await client.query(`SELECT 1 FROM stores WHERE slug = $1`, [finalSlug]);
      if (!chk.length) break;
      finalSlug = `${base}-${suffix}`;
      suffix += 1;
      if (suffix > 500) throw new AppError(500, 'Não foi possível gerar slug único');
    }
    const { rows: st } = await client.query(
      `INSERT INTO stores (name, slug) VALUES ($1, $2) RETURNING id, name, slug, active, created_at`,
      [name, finalSlug]
    );
    const store = st[0];
    await client.query(
      `INSERT INTO store_configs (store_id, delivery_fee, fiscal_uf) VALUES ($1, 5.00, 'MT')
       ON CONFLICT (store_id) DO NOTHING`,
      [store.id]
    );
    await client.query('COMMIT');
    return store;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
