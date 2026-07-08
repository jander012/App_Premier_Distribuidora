import { query } from '../config/db.js';

export async function getStoreConfig(storeId) {
  const { rows } = await query(`SELECT * FROM store_configs WHERE store_id = $1`, [storeId]);
  if (rows[0]) return rows[0];
  const { rows: leg } = await query('SELECT * FROM store_settings WHERE id = 1');
  return leg[0] || null;
}

export async function updateStoreConfig(storeId, patch) {
  const allowed = [
    'delivery_fee',
    'delivery_use_distance_zones',
    'delivery_require_distance_km',
    'delivery_min_trip_fee',
    'delivery_use_per_km_pricing',
    'delivery_origin_lat',
    'delivery_origin_lng',
    'delivery_origin_address',
    'delivery_area_polygon',
    'menu_base_url',
    'whatsapp_welcome_template',
    'whatsapp_order_confirm_template',
    'whatsapp_status_template',
    'linx_integration_enabled',
    'pickingo_integration_enabled',
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
  if (sets.length === 0) return getStoreConfig(storeId);
  sets.push('updated_at = now()');
  vals.push(storeId);
  await query(`UPDATE store_configs SET ${sets.join(', ')} WHERE store_id = $${i}`, vals);
  return getStoreConfig(storeId);
}

/** @deprecated use getStoreConfig(storeId) */
export async function getStoreSettings() {
  return getStoreConfig(1);
}

export async function updateStoreSettings(patch) {
  return updateStoreConfig(1, patch);
}
