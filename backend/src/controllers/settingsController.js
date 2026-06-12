import * as settingsRepo from '../repositories/settingsRepository.js';
import * as storeRepo from '../repositories/storeRepository.js';
import * as deliveryRepo from '../repositories/deliveryRepository.js';
import { AppError } from '../utils/AppError.js';
import { parseDeliveryPolygon } from '../utils/geoUtils.js';

export async function getPublicSettings(req, res, next) {
  try {
    const slug = String(req.query.storeSlug || 'principal').trim();
    const store = await storeRepo.findStoreBySlug(slug);
    if (!store) throw new AppError(404, 'Loja não encontrada');
    const s = await settingsRepo.getStoreConfig(store.id);
    const rawPoly = await deliveryRepo.getDeliveryPolygonForStore(store.id);
    const poly = parseDeliveryPolygon(rawPoly);
    const zones = await deliveryRepo.listZones(store.id);
    const polygonZones = await deliveryRepo.listPolygonZones(store.id);
    const oLa = s?.delivery_origin_lat != null ? Number(s.delivery_origin_lat) : null;
    const oLn = s?.delivery_origin_lng != null ? Number(s.delivery_origin_lng) : null;
    const originOk = Number.isFinite(oLa) && Number.isFinite(oLn);
    const perKm = Boolean(s?.delivery_use_per_km_pricing);
    const deliveryPricingUsesRoute =
      originOk &&
      ((Boolean(s?.delivery_use_distance_zones) && zones.length > 0) || perKm);
    res.json({
      deliveryFee: Number(s?.delivery_fee ?? 0),
      deliveryUseDistanceZones: Boolean(s?.delivery_use_distance_zones),
      deliveryRequireDistanceKm: Boolean(s?.delivery_require_distance_km),
      deliveryUsePerKmPricing: perKm,
      deliveryMinTripFee: s?.delivery_min_trip_fee != null ? Number(s.delivery_min_trip_fee) : 0,
      deliveryAreaPolygon: poly,
      deliveryPolygonZones: polygonZones
        .filter((z) => z.active !== false)
        .map((z) => ({
          id: z.id,
          name: z.name,
          fee: Number(z.fee),
          geojson: parseDeliveryPolygon(z.geojson),
          sortOrder: z.sort_order,
        }))
        .filter((z) => z.geojson),
      deliveryOriginLat: originOk ? oLa : null,
      deliveryOriginLng: originOk ? oLn : null,
      /** Distância de rota (OSRM) quando há origem + ponto de entrega; senão km informado. */
      deliveryPricingUsesRoute,
      menuBaseUrl: s?.menu_base_url || null,
      storeSlug: store.slug,
      storeName: store.name,
    });
  } catch (e) {
    next(e);
  }
}
