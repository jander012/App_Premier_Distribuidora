import { query } from '../config/db.js';

/**
 * Insere ou retorna mídia pelo hash SHA-256 da URL (dedup).
 * @param {string} publicUrl
 * @param {{ storeId?: number|null, title?: string|null }} [opts]
 */
export async function upsertMediaByPublicUrl(publicUrl, opts = {}) {
  const url = publicUrl?.trim();
  if (!url) return null;
  const storeId = opts.storeId ?? null;
  const titleRaw = opts.title != null ? String(opts.title).trim() : '';
  const titleVal = titleRaw.length ? titleRaw : null;
  await query(
    `INSERT INTO media_assets (content_hash, public_url, store_id, title)
     VALUES (SHA2($1, 256), $1, $2, $3)
     ON DUPLICATE KEY UPDATE
       public_url = VALUES(public_url),
       store_id = COALESCE(VALUES(store_id), media_assets.store_id),
       title = CASE
         WHEN VALUES(title) IS NOT NULL AND length(trim(VALUES(title))) > 0 THEN VALUES(title)
         ELSE media_assets.title
       END`,
    [url, storeId, titleVal]
  );
  const { rows } = await query(`SELECT * FROM media_assets WHERE content_hash = SHA2($1, 256)`, [url]);
  return rows[0];
}

export async function findById(id) {
  const uuid = String(id ?? '').trim();
  if (!uuid) return null;
  const { rows } = await query(`SELECT * FROM media_assets WHERE id = $1`, [uuid]);
  return rows[0] || null;
}

/**
 * Resolve linha de mídia pelo UUID do path /api/media/files/:id ou pelo próprio PK.
 * Cobre casos em que public_url aponta para outro UUID (ex.: "só link" com path antigo).
 */
export async function findForMediaFileServe(pathUuid) {
  const u = String(pathUuid ?? '').trim();
  if (!u) return null;
  const pathApi = `/api/media/files/${u.toLowerCase()}`;
  const pathShort = `/media/files/${u.toLowerCase()}`;
  const { rows } = await query(
    `SELECT * FROM media_assets
     WHERE id = $1
        OR lower(REGEXP_REPLACE(trim(public_url), '^https?://[^/]+', '', 1, 0, 'i')) IN ($2, $3)
     ORDER BY (storage_path IS NOT NULL AND trim(COALESCE(storage_path, '')) <> '') DESC, created_at DESC
     LIMIT 1`,
    [u, pathApi, pathShort]
  );
  return rows[0] || null;
}

export async function findByContentHash(contentHash) {
  const h = String(contentHash ?? '').trim();
  if (h.length !== 64) return null;
  const { rows } = await query(`SELECT * FROM media_assets WHERE content_hash = $1`, [h]);
  return rows[0] || null;
}

/**
 * @param {string} contentHash hex 64
 * @param {{ storeId?: number|null, title?: string|null, sourceUrl?: string|null }} patch
 */
export async function mergeMediaStoreAndTitle(contentHash, patch = {}) {
  const h = String(contentHash ?? '').trim();
  if (h.length !== 64) return null;
  const storeId = patch.storeId ?? null;
  const titleRaw = patch.title != null ? String(patch.title).trim() : '';
  const titleParam = titleRaw.length ? titleRaw : null;
  const sourceUrl = patch.sourceUrl != null && String(patch.sourceUrl).trim() ? String(patch.sourceUrl).trim() : null;
  await query(
    `UPDATE media_assets SET
       store_id = COALESCE($2, store_id),
       title = CASE
         WHEN $3 IS NOT NULL AND length(trim($3)) > 0 THEN $3
         ELSE title
       END,
       source_url = COALESCE(media_assets.source_url, $4)
     WHERE content_hash = $1`,
    [h, storeId, titleParam, sourceUrl]
  );
  const { rows } = await query(`SELECT * FROM media_assets WHERE content_hash = $1`, [h]);
  return rows[0] || null;
}

/**
 * @param {{ id: string, contentHash: string, publicUrl: string, storeId?: number|null, title?: string|null, storagePath: string, mimeType: string, sourceUrl?: string|null }} row
 */
export async function insertMirroredMedia(row) {
  const titleRaw = row.title != null ? String(row.title).trim() : '';
  const titleVal = titleRaw.length ? titleRaw : null;
  await query(
    `INSERT INTO media_assets (id, content_hash, public_url, store_id, title, storage_path, mime_type, source_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      row.id,
      row.contentHash,
      row.publicUrl,
      row.storeId ?? null,
      titleVal,
      row.storagePath,
      row.mimeType,
      row.sourceUrl ?? null,
    ]
  );
  const { rows } = await query(`SELECT * FROM media_assets WHERE id = $1`, [row.id]);
  return rows[0];
}

export async function listByStore(storeId, { page = 1, limit = 24, q } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;
  const search = q && String(q).trim() ? `%${String(q).trim()}%` : null;

  const baseParams = [storeId];
  let where = 'WHERE (store_id = $1 OR store_id IS NULL)';
  if (search) {
    baseParams.push(search);
    where += ` AND (public_url LIKE $2 OR COALESCE(title, '') LIKE $2)`;
  }

  const { rows: countRows } = await query(
    `SELECT COUNT(*) AS n FROM media_assets ${where}`,
    baseParams
  );
  const total = countRows[0]?.n ?? 0;

  const { rows } = await query(
    `SELECT id, public_url, title, content_hash, created_at, storage_path, source_url, mime_type
     FROM media_assets ${where}
     ORDER BY created_at DESC
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

export async function deleteByIdForStore(id, storeId) {
  const uuid = String(id ?? '').trim();
  const sid = Number(storeId);
  if (!uuid || !Number.isFinite(sid)) {
    return { ok: false, reason: 'invalid' };
  }

  const existing = await findById(uuid);
  if (!existing) {
    return { ok: false, reason: 'not_found' };
  }
  if (existing.store_id != null && Number(existing.store_id) !== sid) {
    return { ok: false, reason: 'wrong_store' };
  }

  const { rows: use } = await query(
    `SELECT COUNT(*) AS n FROM products WHERE image_asset_id = $1`,
    [uuid]
  );
  if ((use[0]?.n ?? 0) > 0) {
    return { ok: false, reason: 'in_use' };
  }

  const storagePath = existing.storage_path ? String(existing.storage_path) : null;

  if (existing.store_id == null) {
    const del = await query(`DELETE FROM media_assets WHERE id = $1 AND store_id IS NULL`, [uuid]);
    const n = del.rowCount ?? 0;
    return { ok: n > 0, reason: n > 0 ? null : 'not_found', storagePath: n > 0 ? storagePath : null };
  }

  const del = await query(
    `DELETE FROM media_assets WHERE id = $1 AND store_id = $2`,
    [uuid, sid]
  );
  const n = del.rowCount ?? 0;
  return { ok: n > 0, reason: n > 0 ? null : 'not_found', storagePath: n > 0 ? storagePath : null };
}
