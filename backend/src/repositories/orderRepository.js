import { query } from '../config/db.js';

export async function createOrderRow(data) {
  const { rows } = await query(
    `INSERT INTO orders (
      store_id, customer_id, cart_id, status, subtotal, delivery_fee, total,
      payment_method_code, payment_meta,
      delivery_street, delivery_number, delivery_neighborhood, delivery_zip_code,
      delivery_complement, delivery_reference,
      customer_full_name, customer_cpf, customer_email, customer_phone
    ) VALUES (
      $1, $2, $3, 'received', $4, $5, $6, $7, $8::jsonb,
      $9, $10, $11, $12, $13, $14, $15, $16, $17, $18
    ) RETURNING *`,
    [
      data.storeId,
      data.customerId,
      data.cartId,
      data.subtotal,
      data.deliveryFee,
      data.total,
      data.paymentMethodCode,
      JSON.stringify(data.paymentMeta || {}),
      data.delivery.street,
      data.delivery.number,
      data.delivery.neighborhood,
      data.delivery.zipCode,
      data.delivery.complement || null,
      data.delivery.reference || null,
      data.customer.fullName,
      data.customer.cpf,
      data.customer.email,
      data.customer.phone,
    ]
  );
  return rows[0];
}

export async function insertOrderItem(row) {
  await query(
    `INSERT INTO order_items
      (order_id, product_id, product_name, unit_price, quantity, note, options_snapshot, line_total)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)`,
    [
      row.orderId,
      row.productId,
      row.productName,
      row.unitPrice,
      row.quantity,
      row.note || null,
      JSON.stringify(row.optionsSnapshot || []),
      row.lineTotal,
    ]
  );
}

export async function addStatusHistory(orderId, status, note = null) {
  await query(`INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)`, [
    orderId,
    status,
    note,
  ]);
}

export async function getOrderById(id) {
  const { rows } = await query(`SELECT * FROM orders WHERE id = $1`, [id]);
  return rows[0] || null;
}

export async function getOrderItems(orderId) {
  const { rows } = await query(`SELECT * FROM order_items WHERE order_id = $1 ORDER BY id`, [orderId]);
  return rows;
}

export async function listOrdersByPhone(phone, storeId = null) {
  const params = [phone];
  let sql = `SELECT o.* FROM orders o WHERE o.customer_phone = $1`;
  if (storeId != null) {
    params.push(storeId);
    sql += ` AND o.store_id = $2`;
  }
  sql += ` ORDER BY o.created_at DESC`;
  const { rows } = await query(sql, params);
  return rows;
}

export async function listOrdersAdmin({
  storeId,
  status,
  phone,
  orderId,
  fromDate,
  toDate,
  limit = 50,
  offset = 0,
}) {
  const params = [storeId];
  let sql = `SELECT * FROM orders WHERE store_id = $1`;
  let i = 2;
  if (status) {
    sql += ` AND status = $${i++}`;
    params.push(status);
  }
  if (phone && String(phone).replace(/\D/g, '')) {
    const digits = String(phone).replace(/\D/g, '');
    sql += ` AND regexp_replace(customer_phone, '\\D', '', 'g') LIKE $${i++}`;
    params.push(`%${digits}%`);
  }
  if (orderId != null && Number.isFinite(Number(orderId))) {
    sql += ` AND id = $${i++}`;
    params.push(Number(orderId));
  }
  if (fromDate) {
    sql += ` AND created_at >= $${i++}::date`;
    params.push(fromDate);
  }
  if (toDate) {
    sql += ` AND created_at < ($${i++}::date + interval '1 day')`;
    params.push(toDate);
  }
  const lim = i++;
  const off = i++;
  params.push(limit, offset);
  sql += ` ORDER BY created_at ASC, id ASC LIMIT $${lim} OFFSET $${off}`;
  const { rows } = await query(sql, params);
  return rows;
}

export async function countOrdersAdmin({
  storeId,
  status,
  phone,
  orderId,
  fromDate,
  toDate,
}) {
  const params = [storeId];
  let sql = `SELECT COUNT(*)::int AS n FROM orders WHERE store_id = $1`;
  let i = 2;
  if (status) {
    sql += ` AND status = $${i++}`;
    params.push(status);
  }
  if (phone && String(phone).replace(/\D/g, '')) {
    const digits = String(phone).replace(/\D/g, '');
    sql += ` AND regexp_replace(customer_phone, '\\D', '', 'g') LIKE $${i++}`;
    params.push(`%${digits}%`);
  }
  if (orderId != null && Number.isFinite(Number(orderId))) {
    sql += ` AND id = $${i++}`;
    params.push(Number(orderId));
  }
  if (fromDate) {
    sql += ` AND created_at >= $${i++}::date`;
    params.push(fromDate);
  }
  if (toDate) {
    sql += ` AND created_at < ($${i++}::date + interval '1 day')`;
    params.push(toDate);
  }
  const { rows } = await query(sql, params);
  return rows[0]?.n ?? 0;
}

export async function updateOrderStatus(orderId, status, storeId = null) {
  const params = [orderId, status];
  let sql = `UPDATE orders SET status = $2, updated_at = now() WHERE id = $1`;
  if (storeId != null) {
    sql += ` AND store_id = $3`;
    params.push(storeId);
  }
  sql += ` RETURNING *`;
  const { rows } = await query(sql, params);
  return rows[0];
}

export async function insertPayment(p) {
  const { rows } = await query(
    `INSERT INTO payments (order_id, method_code, amount, status, provider, provider_ref, meta)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb) RETURNING *`,
    [
      p.orderId,
      p.methodCode,
      p.amount,
      p.status || 'pending',
      p.provider || null,
      p.providerRef || null,
      JSON.stringify(p.meta || {}),
    ]
  );
  return rows[0];
}
