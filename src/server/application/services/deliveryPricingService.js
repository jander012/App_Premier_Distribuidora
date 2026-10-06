import * as settingsRepo from '../../infrastructure/repositories/settingsRepository.js';
import * as deliveryRepo from '../../infrastructure/repositories/deliveryRepository.js';
import * as routingService from './routingService.js';
import { AppError } from '../../domain/shared/AppError.js';
import { parseDeliveryPolygon, pointInPolygonRing } from '../../domain/shared/geoUtils.js';

function parseTimeToMinutes(t) {
  if (t == null) return 0;
  const s = String(t);
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return 0;
  return h * 60 + min;
}

function timeMatchesWindow(nowMin, startMin, endMin) {
  if (startMin <= endMin) {
    return nowMin >= startMin && nowMin <= endMin;
  }
  return nowMin >= startMin || nowMin <= endMin;
}

/** Primeira faixa que contém o horário; se nenhuma, usa a primeira linha (sort_order). */
export function pickPricePerKmForTime(rates, at) {
  if (!rates?.length) return null;
  const nowMin = at.getHours() * 60 + at.getMinutes();
  const sorted = [...rates].sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
  for (const r of sorted) {
    const a = parseTimeToMinutes(r.time_start);
    const b = parseTimeToMinutes(r.time_end);
    if (timeMatchesWindow(nowMin, a, b)) {
      return Number(r.price_per_km);
    }
  }
  return Number(sorted[0].price_per_km);
}

function roundMoney(v) {
  return Math.max(0, Math.round(Number(v) * 100) / 100);
}

/**
 * Escolhe taxa pela primeira faixa onde distância <= max_km (faixas ordenadas por max_km).
 * Se distância ultrapassa todas, usa a taxa da última faixa.
 */
export function pickZoneFee(zones, distanceKm) {
  if (distanceKm == null || Number.isNaN(Number(distanceKm)) || Number(distanceKm) < 0) {
    return null;
  }
  const d = Number(distanceKm);
  const sorted = [...zones].sort((a, b) => Number(a.max_km) - Number(b.max_km));
  for (const z of sorted) {
    if (d <= Number(z.max_km)) return Number(z.fee);
  }
  if (sorted.length) return Number(sorted[sorted.length - 1].fee);
  return null;
}

export function applyDayModifier(baseFee, modifierRow) {
  const mult = Number(modifierRow?.fee_multiplier ?? 1);
  const add = Number(modifierRow?.fee_add ?? 0);
  const v = baseFee * mult + add;
  return Math.max(0, Math.round(v * 100) / 100);
}

export async function findPolygonZoneForPoint(storeId, lat, lng) {
  const la = numOrUndef(lat);
  const ln = numOrUndef(lng);
  if (!storeId || la == null || ln == null) return null;
  const zones = await deliveryRepo.listPolygonZones(storeId);
  for (const zone of zones) {
    if (zone.active === false) continue;
    const poly = parseDeliveryPolygon(zone.geojson);
    const ring = poly?.coordinates?.[0];
    if (ring?.length && pointInPolygonRing(ln, la, ring)) {
      return zone;
    }
  }
  return null;
}

export function formatPolygonZoneMatch(zone) {
  if (!zone) return null;
  return {
    id: zone.id,
    name: zone.name,
    fee: Number(zone.fee),
  };
}

/**
 * @param {number} storeId
 * @param {{ distanceKm?: number|null, at?: Date, destLat?: number|null, destLng?: number|null }} opts
 */
export async function computeDeliveryFeeForStore(storeId, opts = {}) {
  const { distanceKm = null, at = new Date(), destLat = null, destLng = null } = opts;
  const config = await settingsRepo.getStoreConfig(storeId);
  const zones = await deliveryRepo.listZones(storeId);
  const usePerKm = Boolean(config?.delivery_use_per_km_pricing);
  const polygonZone = await findPolygonZoneForPoint(storeId, destLat, destLng);

  if (polygonZone) {
    const dow = at.getDay();
    const mod = await deliveryRepo.getDayModifier(storeId, dow);
    return applyDayModifier(Number(polygonZone.fee), mod);
  }

  let base = Number(config?.delivery_fee ?? 0);
  const useZones = Boolean(config?.delivery_use_distance_zones) && zones.length > 0;

  if (useZones) {
    const zf = pickZoneFee(zones, distanceKm);
    if (zf != null) base = zf;
    const dow = at.getDay();
    const mod = await deliveryRepo.getDayModifier(storeId, dow);
    return applyDayModifier(base, mod);
  }

  if (usePerKm) {
    const minTrip = Number(config?.delivery_min_trip_fee ?? 0);
    const rates = await deliveryRepo.listTimeRates(storeId);
    const ppm = pickPricePerKmForTime(rates, at);
    const d = numOrUndef(distanceKm) ?? 0;
    const perKmRate = ppm != null && Number.isFinite(ppm) ? ppm : 0;
    const raw = d * perKmRate;
    const fee = roundMoney(Math.max(minTrip, raw));
    return fee;
  }

  const dow = at.getDay();
  const mod = await deliveryRepo.getDayModifier(storeId, dow);
  return computeKmFee(base, distanceKm, mod);
}

/**
 * Taxa padrão = valor mínimo. Com a distância da rota conhecida:
 * max(mínimo, km × R$/km do dia + R$ extra do dia).
 * Sem distância (ou sem configuração do dia), cobra o mínimo.
 */
export function computeKmFee(minFee, distanceKm, modifierRow) {
  const min = Number(minFee) || 0;
  const km = numOrUndef(distanceKm);
  if (km == null || km < 0 || !modifierRow) return roundMoney(min);
  const perKm = Number(modifierRow.fee_multiplier ?? 0) || 0;
  const extra = Number(modifierRow.fee_add ?? 0) || 0;
  return roundMoney(Math.max(min, km * perKm + extra));
}

/**
 * Com origem da loja + destino, usa a menor rota de carro (OSRM); caso contrário km manual.
 * @returns {{ distanceKm: number|null, source: 'route'|'manual'|'none', route?: object }}
 */
export async function resolveDeliveryDistanceKm(storeId, { manualKm = null, destLat = null, destLng = null } = {}) {
  if (!storeId) {
    return { distanceKm: normalizeManualKm(manualKm), source: normalizeManualKm(manualKm) != null ? 'manual' : 'none' };
  }

  const config = await settingsRepo.getStoreConfig(storeId);
  const oLa = numOrUndef(config?.delivery_origin_lat);
  const oLn = numOrUndef(config?.delivery_origin_lng);
  const dLa = numOrUndef(destLat);
  const dLn = numOrUndef(destLng);

  if (oLa != null && oLn != null && dLa != null && dLn != null) {
    const route = await routingService.getShortestDrivingRoute(oLa, oLn, dLa, dLn);
    return { distanceKm: route.distanceKm, source: 'route', route };
  }

  const m = normalizeManualKm(manualKm);
  if (m != null) return { distanceKm: m, source: 'manual' };
  return { distanceKm: null, source: 'none' };
}

export function storeHasDeliveryOrigin(config) {
  return numOrUndef(config?.delivery_origin_lat) != null && numOrUndef(config?.delivery_origin_lng) != null;
}

function normalizeManualKm(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === '') return null;
  const n = Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** @param {{ distanceKm: number|null, source: string }} resolved */
export async function assertDeliveryDistanceResolvedIfRequired(storeId, resolved) {
  if (!storeId) return;
  const config = await settingsRepo.getStoreConfig(storeId);
  const hasOrigin = storeHasDeliveryOrigin(config);
  if (hasOrigin) {
    if (resolved.source !== 'route' || resolved.distanceKm == null || !Number.isFinite(resolved.distanceKm)) {
      throw new AppError(400, 'Marque no mapa o local exato da entrega para calcular a rota e a taxa.');
    }
    return;
  }

  const zones = await deliveryRepo.listZones(storeId);
  const useZones = Boolean(config?.delivery_use_distance_zones) && zones.length > 0;
  const usePerKm = Boolean(config?.delivery_use_per_km_pricing);
  const need =
    Boolean(config?.delivery_require_distance_km) && (useZones || usePerKm);
  if (!need) return;

  if (resolved.distanceKm == null || !Number.isFinite(resolved.distanceKm)) {
    throw new AppError(
      400,
      'Informe a distância de entrega (km) para calcular a taxa ou configure a origem da loja no painel.'
    );
  }
}

function numOrUndef(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Se a loja tem polígono de entrega, exige lat/lng e ponto dentro do polígono.
 */
export async function assertDeliveryInsidePolygonIfConfigured(storeId, lat, lng) {
  if (!storeId) return;
  const polygonZones = await deliveryRepo.listPolygonZones(storeId);
  const activePolygonZones = polygonZones.filter((z) => z.active !== false);
  if (activePolygonZones.length > 0) {
    const la = numOrUndef(lat);
    const ln = numOrUndef(lng);
    if (la == null || ln == null) {
      throw new AppError(400, 'Marque no mapa o ponto de entrega (áreas delimitadas pela loja)');
    }
    for (const zone of activePolygonZones) {
      const poly = parseDeliveryPolygon(zone.geojson);
      const ring = poly?.coordinates?.[0];
      if (ring?.length && pointInPolygonRing(ln, la, ring)) return;
    }
    throw new AppError(400, 'O endereço de entrega está fora das áreas atendidas pela loja');
  }
  const raw = await deliveryRepo.getDeliveryPolygonForStore(storeId);
  const poly = parseDeliveryPolygon(raw);
  if (!poly) return;
  const la = numOrUndef(lat);
  const ln = numOrUndef(lng);
  if (la == null || ln == null) {
    throw new AppError(400, 'Marque no mapa o ponto de entrega (área delimitada pela loja)');
  }
  const ring = poly.coordinates[0];
  if (!pointInPolygonRing(ln, la, ring)) {
    throw new AppError(400, 'O endereço de entrega está fora da área atendida pela loja');
  }
}
