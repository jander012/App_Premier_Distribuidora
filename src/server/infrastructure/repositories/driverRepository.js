import { query } from '../config/db.js';

export async function listDrivers(storeId) {
  const { rows } = await query(
    `SELECT id, store_id, name, cpf, vehicle_description, vehicle_photo_url, username, active, created_at, updated_at
     FROM delivery_drivers
     WHERE store_id = $1
     ORDER BY active DESC, name ASC`,
    [storeId]
  );
  return rows;
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
      (store_id, name, cpf, vehicle_description, vehicle_photo_url, username, password_hash, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      storeId,
      data.name,
      data.cpf,
      data.vehicleDescription || null,
      data.vehiclePhotoUrl || null,
      data.username,
      data.passwordHash,
      data.active !== false,
    ]
  );
  return findDriverById(result.insertId, storeId);
}

export async function updateDriver(id, storeId, patch) {
  const allowed = {
    name: 'name',
    cpf: 'cpf',
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
