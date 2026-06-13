import { query } from '../config/db.js';

export async function upsertOrderIntegration({
  orderId,
  provider,
  status = 'pending',
  externalRef = null,
  requestPayload = null,
  responsePayload = null,
  lastError = null,
}) {
  await query(
    `INSERT INTO order_integrations
      (order_id, provider, status, external_ref, attempts, last_error, request_payload, response_payload)
     VALUES ($1, $2, $3, $4, 0, $5, $6, $7)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       external_ref = COALESCE(VALUES(external_ref), external_ref),
       last_error = VALUES(last_error),
       request_payload = COALESCE(VALUES(request_payload), request_payload),
       response_payload = COALESCE(VALUES(response_payload), response_payload)`,
    [
      orderId,
      provider,
      status,
      externalRef,
      lastError,
      requestPayload ? JSON.stringify(requestPayload) : null,
      responsePayload ? JSON.stringify(responsePayload) : null,
    ]
  );
}

export async function markOrderIntegrationAttempt({
  orderId,
  provider,
  status,
  externalRef = null,
  requestPayload = null,
  responsePayload = null,
  lastError = null,
}) {
  await query(
    `INSERT INTO order_integrations
      (order_id, provider, status, external_ref, attempts, last_error, request_payload, response_payload)
     VALUES ($1, $2, $3, $4, 1, $5, $6, $7)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       external_ref = COALESCE(VALUES(external_ref), external_ref),
       attempts = attempts + 1,
       last_error = VALUES(last_error),
       request_payload = COALESCE(VALUES(request_payload), request_payload),
       response_payload = COALESCE(VALUES(response_payload), response_payload)`,
    [
      orderId,
      provider,
      status,
      externalRef,
      lastError,
      requestPayload ? JSON.stringify(requestPayload) : null,
      responsePayload ? JSON.stringify(responsePayload) : null,
    ]
  );
}

export async function logIntegration({ orderId = null, provider, direction, action, status, payload = null, error = null }) {
  await query(
    `INSERT INTO integration_logs (order_id, provider, direction, action, status, payload, error)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [orderId, provider, direction, action, status, payload ? JSON.stringify(payload) : null, error]
  );
}

export async function listOrderIntegrations(orderId) {
  const { rows } = await query(
    `SELECT * FROM order_integrations WHERE order_id = $1 ORDER BY provider`,
    [orderId]
  );
  return rows;
}
