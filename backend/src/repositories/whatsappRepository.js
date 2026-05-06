import { query } from '../config/db.js';

export async function logMessage(row) {
  const result = await query(
    `INSERT INTO whatsapp_messages
      (order_id, direction, template_key, to_phone, body, provider_ref, payload, status)
     VALUES ($1, 'outbound', $2, $3, $4, $5, $6, $7)`,
    [
      row.orderId || null,
      row.templateKey || null,
      row.toPhone,
      row.body || null,
      row.providerRef || null,
      JSON.stringify(row.payload || {}),
      row.status || 'sent',
    ]
  );
  const { rows } = await query(`SELECT * FROM whatsapp_messages WHERE id = $1`, [result.insertId]);
  return rows[0];
}
