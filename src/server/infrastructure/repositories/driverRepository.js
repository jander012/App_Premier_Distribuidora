import { query } from '../config/db.js';

export async function listDrivers(storeId) {
  const { rows } = await query(
    `SELECT id, store_id, name, cpf, phone, vehicle_description, vehicle_photo_url, username, active, is_default,
            external_email, external_source, created_at, updated_at
     FROM delivery_drivers
     WHERE store_id = $1
     ORDER BY is_default DESC, active DESC, name ASC`,
    [storeId]
  );
  return rows;
}

export async function findDriverByExternalEmail(storeId, email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) return null;
  const { rows } = await query(
    `SELECT * FROM delivery_drivers WHERE store_id = $1 AND lower(external_email) = $2 LIMIT 1`,
    [storeId, normalized]
  );
  return rows[0] || null;
}

/**
 * Espelha o cadastro Premier (enviar_dados_entregador) em delivery_drivers da loja.
 * Mantém is_default e password_hash locais.
 */
export async function syncExternalEntregadores(storeId, remoteList, { passwordHashFallback }) {
  const seenEmails = new Set();
  const synced = [];

  for (const remote of remoteList || []) {
    const email = String(remote.email || '').trim().toLowerCase();
    if (!email) continue;
    seenEmails.add(email);
    const usernameBase = String(remote.username || email.split('@')[0] || `e${Date.now()}`)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]/g, '')
      .slice(0, 70);
    let username = usernameBase || `e${Date.now()}`;
    const phone = remote.telefone ? String(remote.telefone).replace(/\D/g, '') : null;
    const name = String(remote.nome || email).trim();

    let existing = await findDriverByExternalEmail(storeId, email);
    if (!existing) {
      const byUser = await query(
        `SELECT * FROM delivery_drivers WHERE store_id = $1 AND username = $2 LIMIT 1`,
        [storeId, username]
      );
      existing = byUser.rows[0] || null;
      if (existing && existing.external_email && existing.external_email !== email) {
        username = `${usernameBase}_${email.slice(0, 6)}`.slice(0, 80);
        existing = null;
      }
    }

    if (existing) {
      await query(
        `UPDATE delivery_drivers
            SET name = $3, phone = $4, username = $5, external_email = $6, external_source = 'premier',
                active = true, updated_at = now()
          WHERE id = $1 AND store_id = $2`,
        [existing.id, storeId, name, phone, existing.username || username, email]
      );
      synced.push(await findDriverById(existing.id, storeId));
    } else {
      const result = await query(
        `INSERT INTO delivery_drivers
          (store_id, name, cpf, phone, vehicle_description, vehicle_photo_url, username, password_hash, active, is_default, external_email, external_source)
         VALUES ($1, $2, '', $3, NULL, NULL, $4, $5, true, false, $6, 'premier')`,
        [storeId, name, phone, username, passwordHashFallback, email]
      );
      synced.push(await findDriverById(result.insertId, storeId));
    }
  }

  // Desativa espelhos Premier que sumiram do cadastro remoto (não apaga — preserva histórico de pedidos).
  const { rows: localPremier } = await query(
    `SELECT id, external_email FROM delivery_drivers
      WHERE store_id = $1 AND external_source = 'premier' AND external_email IS NOT NULL`,
    [storeId]
  );
  for (const row of localPremier) {
    if (!seenEmails.has(String(row.external_email).toLowerCase())) {
      await query(
        `UPDATE delivery_drivers SET active = false, updated_at = now() WHERE id = $1 AND store_id = $2`,
        [row.id, storeId]
      );
    }
  }

  return synced;
}

export async function findDefaultDriver(storeId) {
  const { rows } = await query(
    `SELECT * FROM delivery_drivers
      WHERE store_id = $1 AND active = true AND is_default = true
      ORDER BY id ASC LIMIT 1`,
    [storeId]
  );
  return rows[0] || null;
}

export async function setDefaultDriver(storeId, driverId) {
  await query(`UPDATE delivery_drivers SET is_default = false WHERE store_id = $1`, [storeId]);
  if (driverId == null) {
    await query(`UPDATE store_configs SET default_driver_id = NULL WHERE store_id = $1`, [storeId]);
    return null;
  }
  await query(
    `UPDATE delivery_drivers SET is_default = true, updated_at = now()
      WHERE id = $1 AND store_id = $2 AND active = true`,
    [driverId, storeId]
  );
  await query(`UPDATE store_configs SET default_driver_id = $1 WHERE store_id = $2`, [driverId, storeId]);
  return findDriverById(driverId, storeId);
}

export async function findDriverById(id, storeId = null) {
  const params = [id];
  let sql = `SELECT * FROM delivery_drivers WHERE id = $1`;
  if (storeId != null) {
    params.push(storeId);
    sql += ` AND store_id = $2`;
  }
  const { rows } = await query(sql, params);
  return rows[0] || null;
}

export async function findDriverByUsername(storeId, username) {
  const { rows } = await query(
    `SELECT * FROM delivery_drivers WHERE store_id = $1 AND username = $2 AND active = true`,
    [storeId, username]
  );
  return rows[0] || null;
}

export async function createDriver(storeId, data) {
  const result = await query(
    `INSERT INTO delivery_drivers
      (store_id, name, cpf, phone, vehicle_description, vehicle_photo_url, username, password_hash, active, is_default)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      storeId,
      data.name,
      data.cpf,
      data.phone || null,
      data.vehicleDescription || null,
      data.vehiclePhotoUrl || null,
      data.username,
      data.passwordHash,
      data.active !== false,
      Boolean(data.isDefault),
    ]
  );
  const created = await findDriverById(result.insertId, storeId);
  if (data.isDefault) await setDefaultDriver(storeId, created.id);
  return findDriverById(result.insertId, storeId);
}

export async function updateDriver(id, storeId, patch) {
  const allowed = {
    name: 'name',
    cpf: 'cpf',
    phone: 'phone',
    vehicleDescription: 'vehicle_description',
    vehiclePhotoUrl: 'vehicle_photo_url',
    username: 'username',
    passwordHash: 'password_hash',
    active: 'active',
  };
  const sets = [];
  const vals = [];
  let i = 1;
  for (const [k, col] of Object.entries(allowed)) {
    if (patch[k] !== undefined) {
      sets.push(`${col} = $${i++}`);
      vals.push(patch[k]);
    }
  }
  if (!sets.length) return findDriverById(id, storeId);
  vals.push(id, storeId);
  await query(`UPDATE delivery_drivers SET ${sets.join(', ')}, updated_at = now() WHERE id = $${i++} AND store_id = $${i}`, vals);
  return findDriverById(id, storeId);
}

export async function listRunsForAdmin(storeId) {
  const { rows } = await query(
    `SELECT dr.*, dd.name AS driver_name, o.status AS order_status, o.customer_full_name, o.customer_phone,
            o.delivery_street, o.delivery_number, o.delivery_neighborhood, o.delivery_latitude, o.delivery_longitude
     FROM delivery_runs dr
     JOIN orders o ON o.id = dr.order_id
     LEFT JOIN delivery_drivers dd ON dd.id = dr.driver_id
     WHERE dr.store_id = $1
     ORDER BY FIELD(dr.status, 'available', 'accepted', 'picked_up', 'completed', 'cancelled'), dr.created_at DESC`,
    [storeId]
  );
  return rows;
}

export async function ensureRunForOrder(orderId, storeId) {
  await query(
    `INSERT IGNORE INTO delivery_runs (store_id, order_id, status) VALUES ($1, $2, 'available')`,
    [storeId, orderId]
  );
  const { rows } = await query(`SELECT * FROM delivery_runs WHERE order_id = $1`, [orderId]);
  let run = rows[0] || null;
  if (run && !run.driver_id) {
    const def = await findDefaultDriver(storeId);
    if (def) {
      await query(
        `UPDATE delivery_runs
            SET driver_id = $2, status = 'accepted', accepted_at = COALESCE(accepted_at, now()), updated_at = now()
          WHERE id = $1 AND driver_id IS NULL`,
        [run.id, def.id]
      );
      await query(`UPDATE orders SET driver_id = $2, updated_at = now() WHERE id = $1 AND driver_id IS NULL`, [
        orderId,
        def.id,
      ]);
      const refreshed = await query(`SELECT * FROM delivery_runs WHERE id = $1`, [run.id]);
      run = refreshed.rows[0] || run;
    }
  }
  return run;
}

/** Atribui (ou remove) entregador do pedido e da corrida. */
export async function assignDriverToOrder(orderId, storeId, driverId) {
  await ensureRunForOrder(orderId, storeId);
  if (driverId == null) {
    await query(
      `UPDATE delivery_runs
          SET driver_id = NULL, status = 'available', accepted_at = NULL, updated_at = now()
        WHERE order_id = $1 AND store_id = $2 AND status IN ('available', 'accepted', 'picked_up')`,
      [orderId, storeId]
    );
    await query(`UPDATE orders SET driver_id = NULL, updated_at = now() WHERE id = $1 AND store_id = $2`, [
      orderId,
      storeId,
    ]);
  } else {
    const driver = await findDriverById(driverId, storeId);
    if (!driver || driver.active === false) return null;
    await query(
      `UPDATE delivery_runs
          SET driver_id = $3, status = IF(status = 'available', 'accepted', status),
              accepted_at = COALESCE(accepted_at, now()), updated_at = now()
        WHERE order_id = $1 AND store_id = $2 AND status <> 'completed' AND status <> 'cancelled'`,
      [orderId, storeId, driverId]
    );
    await query(`UPDATE orders SET driver_id = $3, updated_at = now() WHERE id = $1 AND store_id = $2`, [
      orderId,
      storeId,
      driverId,
    ]);
  }
  const { rows } = await query(
    `SELECT dr.*, dd.name AS driver_name, dd.phone AS driver_phone
       FROM delivery_runs dr
       LEFT JOIN delivery_drivers dd ON dd.id = dr.driver_id
      WHERE dr.order_id = $1 AND dr.store_id = $2`,
    [orderId, storeId]
  );
  return rows[0] || null;
}

export async function listAvailableRuns(storeId) {
  const { rows } = await query(
    `SELECT dr.*, o.customer_full_name, o.customer_phone, o.delivery_street, o.delivery_number, o.delivery_neighborhood,
            o.delivery_zip_code, o.delivery_complement, o.delivery_reference, o.delivery_latitude, o.delivery_longitude,
            o.total, o.status AS order_status, o.created_at AS order_created_at
     FROM delivery_runs dr
     JOIN orders o ON o.id = dr.order_id
     WHERE dr.store_id = $1 AND dr.status = 'available' AND o.status <> 'delivered' AND o.status <> 'cancelled'
     ORDER BY dr.created_at ASC`,
    [storeId]
  );
  return rows;
}

export async function listRunsForDriver(driverId) {
  const { rows } = await query(
    `SELECT dr.*, o.customer_full_name, o.customer_phone, o.delivery_street, o.delivery_number, o.delivery_neighborhood,
            o.delivery_zip_code, o.delivery_complement, o.delivery_reference, o.delivery_latitude, o.delivery_longitude,
            o.total, o.status AS order_status, o.created_at AS order_created_at
     FROM delivery_runs dr
     JOIN orders o ON o.id = dr.order_id
     WHERE dr.driver_id = $1
     ORDER BY dr.created_at DESC`,
    [driverId]
  );
  return rows;
}

export async function acceptRun(runId, driverId, storeId) {
  await query(
    `UPDATE delivery_runs
     SET driver_id = $2, status = 'accepted', accepted_at = COALESCE(accepted_at, now()), updated_at = now()
     WHERE id = $1 AND store_id = $3 AND status = 'available'`,
    [runId, driverId, storeId]
  );
  const { rows } = await query(`SELECT * FROM delivery_runs WHERE id = $1 AND store_id = $2`, [runId, storeId]);
  return rows[0] || null;
}

export async function updateRunStatus(runId, driverId, status) {
  const cols =
    status === 'picked_up'
      ? `status = 'picked_up', picked_up_at = COALESCE(picked_up_at, now())`
      : status === 'completed'
        ? `status = 'completed', completed_at = COALESCE(completed_at, now())`
        : `status = $3`;
  const params = status === 'picked_up' || status === 'completed' ? [runId, driverId] : [runId, driverId, status];
  await query(
    `UPDATE delivery_runs SET ${cols}, updated_at = now() WHERE id = $1 AND driver_id = $2`,
    params
  );
  const { rows } = await query(`SELECT * FROM delivery_runs WHERE id = $1 AND driver_id = $2`, [runId, driverId]);
  return rows[0] || null;
}

export async function findRunByOrder(orderId) {
  const { rows } = await query(`SELECT * FROM delivery_runs WHERE order_id = $1`, [orderId]);
  return rows[0] || null;
}

export async function listMessages(orderId) {
  const { rows } = await query(
    `SELECT * FROM order_chat_messages WHERE order_id = $1 ORDER BY created_at ASC, id ASC`,
    [orderId]
  );
  return rows;
}

export async function hasClientMessage(orderId) {
  const { rows } = await query(
    `SELECT COUNT(*) AS n FROM order_chat_messages WHERE order_id = $1 AND sender_type = 'client'`,
    [orderId]
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

export async function addMessage(orderId, senderType, senderId, body) {
  const result = await query(
    `INSERT INTO order_chat_messages (order_id, sender_type, sender_id, body) VALUES ($1, $2, $3, $4)`,
    [orderId, senderType, senderId ?? null, body]
  );
  const { rows } = await query(`SELECT * FROM order_chat_messages WHERE id = $1`, [result.insertId]);
  return rows[0] || null;
}

export async function upsertReview({ orderId, storeId, driverId = null, targetType, rating, comment }) {
  await query(
    `INSERT INTO order_reviews (order_id, store_id, driver_id, target_type, rating, comment)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON DUPLICATE KEY UPDATE rating = VALUES(rating), comment = VALUES(comment)`,
    [orderId, storeId, driverId, targetType, rating, comment || null]
  );
}
