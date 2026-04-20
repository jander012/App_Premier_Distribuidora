import { query } from '../config/db.js';

export async function findByPhone(phone) {
  const { rows } = await query('SELECT * FROM customers WHERE phone = $1', [phone]);
  return rows[0] || null;
}

export async function findById(id) {
  const { rows } = await query('SELECT * FROM customers WHERE id = $1', [id]);
  return rows[0] || null;
}

export async function createCustomer({ phone, fullName, cpf, email }) {
  const { rows } = await query(
    `INSERT INTO customers (phone, full_name, cpf, email)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [phone, fullName, cpf, email]
  );
  return rows[0];
}

export async function updateCustomer(id, { fullName, cpf, email }) {
  const { rows } = await query(
    `UPDATE customers SET
       full_name = COALESCE($2, full_name),
       cpf = COALESCE($3, cpf),
       email = COALESCE($4, email),
       updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, fullName, cpf, email]
  );
  return rows[0];
}

export async function getDefaultAddress(customerId) {
  const { rows } = await query(
    `SELECT * FROM customer_addresses WHERE customer_id = $1 AND is_default = true LIMIT 1`,
    [customerId]
  );
  if (rows[0]) return rows[0];
  const { rows: any } = await query(
    `SELECT * FROM customer_addresses WHERE customer_id = $1 ORDER BY id DESC LIMIT 1`,
    [customerId]
  );
  return any[0] || null;
}

export async function upsertDefaultAddress(customerId, addr) {
  await query(
    `UPDATE customer_addresses SET is_default = false WHERE customer_id = $1`,
    [customerId]
  );
  const lat = addr.latitude != null && addr.latitude !== '' ? Number(addr.latitude) : null;
  const lng = addr.longitude != null && addr.longitude !== '' ? Number(addr.longitude) : null;
  const { rows } = await query(
    `INSERT INTO customer_addresses
      (customer_id, street, number, neighborhood, zip_code, complement, reference_note, is_default, latitude, longitude)
     VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $9)
     RETURNING *`,
    [
      customerId,
      addr.street,
      addr.number,
      addr.neighborhood,
      addr.zipCode,
      addr.complement || null,
      addr.reference || null,
      Number.isFinite(lat) ? lat : null,
      Number.isFinite(lng) ? lng : null,
    ]
  );
  return rows[0];
}

export async function findAddressForCustomer(addressId, customerId) {
  const { rows } = await query(
    `SELECT * FROM customer_addresses WHERE id = $1 AND customer_id = $2`,
    [addressId, customerId]
  );
  return rows[0] || null;
}

export async function updateAddress(addressId, customerId, addr) {
  const lat = addr.latitude != null && addr.latitude !== '' ? Number(addr.latitude) : null;
  const lng = addr.longitude != null && addr.longitude !== '' ? Number(addr.longitude) : null;
  const { rows } = await query(
    `UPDATE customer_addresses SET
       street = $3, number = $4, neighborhood = $5, zip_code = $6,
       complement = $7, reference_note = $8,
       latitude = COALESCE($9, latitude),
       longitude = COALESCE($10, longitude),
       updated_at = now()
     WHERE id = $1 AND customer_id = $2
     RETURNING *`,
    [
      addressId,
      customerId,
      addr.street,
      addr.number,
      addr.neighborhood,
      addr.zipCode,
      addr.complement || null,
      addr.reference || null,
      Number.isFinite(lat) ? lat : null,
      Number.isFinite(lng) ? lng : null,
    ]
  );
  return rows[0];
}

export async function listStoresForCustomer(customerId) {
  const { rows } = await query(
    `SELECT DISTINCT s.id, s.name, s.slug
     FROM stores s
     WHERE s.active = true AND (
       s.id IN (SELECT store_id FROM customer_stores WHERE customer_id = $1)
       OR s.id IN (SELECT DISTINCT store_id FROM orders WHERE customer_id = $1)
     )
     ORDER BY s.name`,
    [customerId]
  );
  return rows;
}

export async function linkCustomerToStore(customerId, storeId) {
  await query(
    `INSERT INTO customer_stores (customer_id, store_id, last_used_at)
     VALUES ($1, $2, now())
     ON CONFLICT (customer_id, store_id) DO UPDATE SET last_used_at = now()`,
    [customerId, storeId]
  );
}

const defaultAddressSubquery = `(SELECT json_build_object(
        'id', a.id, 'street', a.street, 'number', a.number,
        'neighborhood', a.neighborhood, 'zipCode', a.zip_code,
        'complement', a.complement, 'reference', a.reference_note
      ) FROM customer_addresses a WHERE a.customer_id = c.id AND a.is_default = true LIMIT 1) AS default_address`;

export async function listCustomersForAdmin(limit = 100, offset = 0) {
  const { rows } = await query(
    `SELECT c.*, ${defaultAddressSubquery}
     FROM customers c
     ORDER BY c.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function listCustomersForAdminByStore(storeId, limit = 100, offset = 0) {
  const { rows } = await query(
    `SELECT c.*, ${defaultAddressSubquery}
     FROM customers c
     WHERE c.id IN (SELECT DISTINCT customer_id FROM orders WHERE store_id = $3)
     ORDER BY c.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, storeId]
  );
  return rows;
}
