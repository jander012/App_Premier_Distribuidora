import * as settingsRepo from '../../../infrastructure/repositories/settingsRepository.js';
import * as deliveryRepo from '../../../infrastructure/repositories/deliveryRepository.js';
import { validateAndNormalizePolygonGeoJson, parseDeliveryPolygon } from '../../../domain/shared/geoUtils.js';
import { logPolygonInfo } from '../../../domain/shared/deliveryPolygonLog.js';

async function buildDeliveryPayload(storeId) {
  const [config, zones, dayModifiers, areaPolygon, timeRates] = await Promise.all([
    settingsRepo.getStoreConfig(storeId),
    deliveryRepo.listZones(storeId),
    deliveryRepo.listDayModifiers(storeId),
    deliveryRepo.getDeliveryPolygonForStore(storeId),
    deliveryRepo.listTimeRates(storeId),
  ]);
  const polygonZones = await deliveryRepo.listPolygonZones(storeId);
  return {
    storeId,
    deliveryFee: Number(config?.delivery_fee ?? 0),
    deliveryUseDistanceZones: Boolean(config?.delivery_use_distance_zones),
    deliveryRequireDistanceKm: Boolean(config?.delivery_require_distance_km),
    deliveryMinTripFee: config?.delivery_min_trip_fee != null ? Number(config.delivery_min_trip_fee) : 0,
    deliveryUsePerKmPricing: Boolean(config?.delivery_use_per_km_pricing),
    deliveryOriginLat: config?.delivery_origin_lat != null ? Number(config.delivery_origin_lat) : null,
    deliveryOriginLng: config?.delivery_origin_lng != null ? Number(config.delivery_origin_lng) : null,
    deliveryOriginAddress: config?.delivery_origin_address || '',
    deliveryAreaPolygon: parseDeliveryPolygon(areaPolygon),
    polygonZones: polygonZones.map((z, idx) => ({
      id: z.id,
      name: z.name,
      fee: Number(z.fee),
      geojson: parseDeliveryPolygon(z.geojson),
      sortOrder: z.sort_order ?? idx,
      active: z.active !== false,
    })),
    zones: zones.map((z) => ({
      id: z.id,
      maxKm: Number(z.max_km),
      fee: Number(z.fee),
      sortOrder: z.sort_order,
    })),
    timeRates: timeRates.map((r) => ({
      id: r.id,
      timeStart: r.time_start,
      timeEnd: r.time_end,
      pricePerKm: Number(r.price_per_km),
      sortOrder: r.sort_order,
    })),
    dayModifiers,
  };
}

export async function getDelivery(req, res, next) {
  try {
    const storeId = req.storeId;
    logPolygonInfo('GET /admin/delivery', { storeId });
    const payload = await buildDeliveryPayload(storeId);
    const hasPoly = Boolean(payload.deliveryAreaPolygon?.coordinates?.[0]?.length);
    logPolygonInfo('GET /admin/delivery resposta', { storeId, hasPolygon: hasPoly });
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function putDelivery(req, res, next) {
  try {
    const storeId = req.storeId;
    const b = req.body || {};
    const bodyKeys = b && typeof b === 'object' ? Object.keys(b) : [];
    const hasPolyInBody =
      Object.prototype.hasOwnProperty.call(b, 'deliveryAreaPolygon') ||
      Object.prototype.hasOwnProperty.call(b, 'delivery_area_polygon');
    logPolygonInfo('PUT /admin/delivery recebido', { storeId, bodyKeys, hasPolyInBody });

    const patch = {};
    if (b.deliveryFee != null) patch.delivery_fee = Number(b.deliveryFee);
    if (b.delivery_use_distance_zones != null) patch.delivery_use_distance_zones = Boolean(b.delivery_use_distance_zones);
    if (b.deliveryUseDistanceZones != null) patch.delivery_use_distance_zones = Boolean(b.deliveryUseDistanceZones);
    if (b.delivery_require_distance_km != null) patch.delivery_require_distance_km = Boolean(b.delivery_require_distance_km);
    if (b.deliveryRequireDistanceKm != null) patch.delivery_require_distance_km = Boolean(b.deliveryRequireDistanceKm);
    if (b.delivery_origin_lat !== undefined) patch.delivery_origin_lat = numOrNull(b.delivery_origin_lat);
    if (b.deliveryOriginLat !== undefined) patch.delivery_origin_lat = numOrNull(b.deliveryOriginLat);
    if (b.delivery_origin_lng !== undefined) patch.delivery_origin_lng = numOrNull(b.delivery_origin_lng);
    if (b.deliveryOriginLng !== undefined) patch.delivery_origin_lng = numOrNull(b.deliveryOriginLng);
    if (b.delivery_origin_address !== undefined) patch.delivery_origin_address = String(b.delivery_origin_address || '').trim() || null;
    if (b.deliveryOriginAddress !== undefined) patch.delivery_origin_address = String(b.deliveryOriginAddress || '').trim() || null;
    if (b.deliveryMinTripFee !== undefined || b.delivery_min_trip_fee !== undefined) {
      patch.delivery_min_trip_fee = Number(b.deliveryMinTripFee ?? b.delivery_min_trip_fee ?? 0);
    }
    if (b.deliveryUsePerKmPricing !== undefined || b.delivery_use_per_km_pricing !== undefined) {
      patch.delivery_use_per_km_pricing = Boolean(
        b.deliveryUsePerKmPricing ?? b.delivery_use_per_km_pricing
      );
    }

    const polyBody =
      b.deliveryAreaPolygon !== undefined ? b.deliveryAreaPolygon : b.delivery_area_polygon;
    if (polyBody !== undefined) {
      logPolygonInfo('PUT /admin/delivery: atualizar polígono', {
        storeId,
        acao: polyBody === null ? 'remover' : 'salvar',
        tipoBody: polyBody === null ? 'null' : typeof polyBody,
      });
      if (polyBody === null) {
        await deliveryRepo.deleteDeliveryPolygon(storeId);
      } else {
        const normalized = validateAndNormalizePolygonGeoJson(polyBody);
        await deliveryRepo.upsertDeliveryPolygon(storeId, normalized);
      }
    } else {
      logPolygonInfo('PUT /admin/delivery: polígono omitido no body — mantém o que está no banco', { storeId });
    }

    if (Object.keys(patch).length) {
      await settingsRepo.updateStoreConfig(storeId, patch);
    }

    if (Array.isArray(b.zones)) {
      await deliveryRepo.replaceZones(storeId, b.zones);
    }
    if (Array.isArray(b.polygonZones)) {
      const normalizedZones = b.polygonZones.map((z) => ({
        ...z,
        geojson: validateAndNormalizePolygonGeoJson(z.geojson ?? z.polygon),
      }));
      await deliveryRepo.replacePolygonZones(storeId, normalizedZones);
    }
    if (Array.isArray(b.dayModifiers)) {
      await deliveryRepo.replaceDayModifiers(storeId, b.dayModifiers);
    }
    if (Array.isArray(b.timeRates)) {
      await deliveryRepo.replaceTimeRates(storeId, b.timeRates);
    }

    const payload = await buildDeliveryPayload(storeId);
    res.json(payload);
  } catch (e) {
    next(e);
  }
}
