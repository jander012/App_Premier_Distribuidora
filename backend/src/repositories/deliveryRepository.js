import { query } from '../config/db.js';
import { AppError } from '../utils/AppError.js';
import { logPolygonInfo, logPolygonError, logPolygonWarn } from '../utils/deliveryPolygonLog.js';

/** Polígono GeoJSON salvo para a loja; depois tenta legado em store_configs. */
function rowGeojsonValue(row) {
  if (!row || row.geojson == null) return null;
  const g = row.geojson;
  if (typeof g === 'string') {
    try {
      return JSON.parse(g);
    } catch {
      return null;
    }
  }
  return g;
}

export async function getDeliveryPolygonForStore(storeId) {
  const sid = Number(storeId);
  if (!Number.isFinite(sid)) {
    logPolygonWarn('get: storeId inválido', { storeId });
    return null;
  }
  try {
    const { rows } = await query(`SELECT geojson FROM store_delivery_polygons WHERE store_id = $1`, [sid]);
    const fromTable = rowGeojsonValue(rows[0]);
    if (fromTable != null) {
      const ring = fromTable?.coordinates?.[0];
      logPolygonInfo('get: encontrado em store_delivery_polygons', {
        storeId: sid,
        type: fromTable?.type,
        ringPoints: Array.isArray(ring) ? ring.length : 0,
      });
      return fromTable;
    }
    const { rows: leg } = await query(
      `SELECT delivery_area_polygon FROM store_configs WHERE store_id = $1`,
      [sid]
    );
    const legVal = leg[0]?.delivery_area_polygon;
    if (legVal == null) {
      logPolygonInfo('get: sem polígono (tabela e legado vazios)', { storeId: sid });
      return null;
    }
    let parsed = legVal;
    if (typeof legVal === 'string') {
      try {
        parsed = JSON.parse(legVal);
      } catch {
        logPolygonWarn('get: legado delivery_area_polygon JSON inválido', { storeId: sid });
        return null;
      }
    }
    logPolygonInfo('get: encontrado em store_configs (legado)', { storeId: sid });
    return parsed;
  } catch (e) {
    logPolygonError('get: erro SQL (tabela store_delivery_polygons existe? rode npm run migrate)', e, { storeId: sid });
    throw e;
  }
}

export async function upsertDeliveryPolygon(storeId, geojsonObject) {
  const sid = Number(storeId);
  if (!Number.isFinite(sid) || sid < 1) {
    logPolygonError('upsert: storeId inválido', new Error(String(storeId)), { storeId });
    throw new AppError(500, 'Identificador da loja inválido ao gravar o polígono');
  }
  const jsonStr = JSON.stringify(geojsonObject);
  const ring = geojsonObject?.coordinates?.[0];
  logPolygonInfo('upsert: gravando', {
    storeId: sid,
    type: geojsonObject?.type,
    ringPoints: Array.isArray(ring) ? ring.length : 0,
  });
  try {
    const result = await query(
      `INSERT INTO store_delivery_polygons (store_id, geojson, updated_at)
       VALUES ($1, $2, now())
       ON DUPLICATE KEY UPDATE geojson = VALUES(geojson), updated_at = now()`,
      [sid, jsonStr]
    );
    const { rows } = await query(`SELECT store_id FROM store_delivery_polygons WHERE store_id = $1`, [sid]);
    if (!rows?.length) {
      throw new AppError(500, 'Gravação do polígono não retornou confirmação do banco');
    }
    logPolygonInfo('upsert: OK em store_delivery_polygons', { storeId: sid, rowCount: result.rowCount, returnedId: rows[0].store_id });
  } catch (e) {
    logPolygonError('upsert: falhou em store_delivery_polygons (migração 010?)', e, { storeId: sid });
    throw e;
  }
  try {
    const cfg = await query(
      `UPDATE store_configs SET delivery_area_polygon = $2, updated_at = now() WHERE store_id = $1`,
      [sid, jsonStr]
    );
    if (cfg.rowCount === 0) {
      logPolygonWarn('upsert: nenhuma linha em store_configs para este store_id', { storeId: sid });
    } else {
      logPolygonInfo('upsert: espelhado em store_configs.delivery_area_polygon', { storeId: sid });
    }
  } catch (e) {
    logPolygonWarn('upsert: espelho em store_configs falhou — polígono já está em store_delivery_polygons', {
      storeId: sid,
      message: e?.message,
    });
  }
}

export async function deleteDeliveryPolygon(storeId) {
  const sid = Number(storeId);
  if (!Number.isFinite(sid) || sid < 1) {
    throw new AppError(500, 'Identificador da loja inválido ao remover o polígono');
  }
  logPolygonInfo('delete: removendo linha', { storeId: sid });
  try {
    await query(`DELETE FROM store_delivery_polygons WHERE store_id = $1`, [sid]);
    logPolygonInfo('delete: OK em store_delivery_polygons', { storeId: sid });
  } catch (e) {
    logPolygonError('delete: falhou em store_delivery_polygons', e, { storeId: sid });
    throw e;
  }
  try {
    await query(
      `UPDATE store_configs SET delivery_area_polygon = NULL, updated_at = now() WHERE store_id = $1`,
      [sid]
    );
  } catch (e) {
    logPolygonWarn('delete: limpar store_configs ignorado', { storeId: sid, message: e?.message });
  }
}

export async function listZones(storeId) {
  const { rows } = await query(
    `SELECT id, max_km, fee, sort_order
     FROM store_delivery_zones
     WHERE store_id = $1
     ORDER BY sort_order ASC, max_km ASC`,
    [storeId]
  );
  return rows;
}

export async function replaceZones(storeId, zones) {
  await query(`DELETE FROM store_delivery_zones WHERE store_id = $1`, [storeId]);
  let i = 0;
  for (const z of zones) {
    const maxKm = Number(z.max_km ?? z.maxKm);
    const fee = Number(z.fee);
    const sortOrder = z.sort_order ?? z.sortOrder ?? i;
    if (!Number.isFinite(maxKm) || maxKm <= 0) continue;
    if (!Number.isFinite(fee) || fee < 0) continue;
    await query(
      `INSERT INTO store_delivery_zones (store_id, max_km, fee, sort_order) VALUES ($1, $2, $3, $4)`,
      [storeId, maxKm, fee, sortOrder]
    );
    i += 1;
  }
}

export async function getDayModifier(storeId, dayOfWeek) {
  const { rows } = await query(
    `SELECT fee_multiplier, fee_add FROM store_delivery_day_modifiers WHERE store_id = $1 AND day_of_week = $2`,
    [storeId, dayOfWeek]
  );
  return rows[0] || null;
}

export async function listDayModifiers(storeId) {
  const { rows } = await query(
    `SELECT day_of_week, fee_multiplier, fee_add FROM store_delivery_day_modifiers WHERE store_id = $1`,
    [storeId]
  );
  const map = new Map(rows.map((r) => [r.day_of_week, r]));
  const out = [];
  for (let d = 0; d <= 6; d += 1) {
    const r = map.get(d);
    out.push({
      dayOfWeek: d,
      feeMultiplier: r ? Number(r.fee_multiplier) : 1,
      feeAdd: r ? Number(r.fee_add) : 0,
    });
  }
  return out;
}

export async function listTimeRates(storeId) {
  const { rows } = await query(
    `SELECT id, time_start, time_end, price_per_km, sort_order
     FROM store_delivery_time_rates
     WHERE store_id = $1
     ORDER BY sort_order ASC, id ASC`,
    [storeId]
  );
  return rows;
}

export async function replaceTimeRates(storeId, rates) {
  await query(`DELETE FROM store_delivery_time_rates WHERE store_id = $1`, [storeId]);
  let i = 0;
  for (const r of rates) {
    const timeStart = String(r.timeStart ?? r.time_start ?? '').trim();
    const timeEnd = String(r.timeEnd ?? r.time_end ?? '').trim();
    const pricePerKm = Number(r.pricePerKm ?? r.price_per_km);
    const sortOrder = r.sortOrder ?? r.sort_order ?? i;
    if (!timeStart || !timeEnd) continue;
    if (!Number.isFinite(pricePerKm) || pricePerKm < 0) continue;
    await query(
      `INSERT INTO store_delivery_time_rates (store_id, time_start, time_end, price_per_km, sort_order)
       VALUES ($1, $2, $3, $4, $5)`,
      [storeId, timeStart, timeEnd, pricePerKm, sortOrder]
    );
    i += 1;
  }
}

export async function replaceDayModifiers(storeId, modifiers) {
  await query(`DELETE FROM store_delivery_day_modifiers WHERE store_id = $1`, [storeId]);
  for (const m of modifiers) {
    const d = Number(m.dayOfWeek ?? m.day_of_week);
    const mult = Number(m.feeMultiplier ?? m.fee_multiplier ?? 1);
    const add = Number(m.feeAdd ?? m.fee_add ?? 0);
    if (!Number.isInteger(d) || d < 0 || d > 6) continue;
    if (!Number.isFinite(mult) || mult < 0) continue;
    if (!Number.isFinite(add)) continue;
    await query(
      `INSERT INTO store_delivery_day_modifiers (store_id, day_of_week, fee_multiplier, fee_add)
       VALUES ($1, $2, $3, $4)`,
      [storeId, d, mult, add]
    );
  }
}
