import { env } from '../../infrastructure/config/env.js';
import { AppError } from '../../domain/shared/AppError.js';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 500;
const routeCache = new Map();

function cacheKey(o1, o2, d1, d2) {
  return [o1, o2, d1, d2].map((v) => v.toFixed(5)).join(',');
}

function cacheGet(key) {
  const hit = routeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return hit.value;
}

function cacheSet(key, value) {
  if (routeCache.size >= CACHE_MAX) {
    routeCache.delete(routeCache.keys().next().value);
  }
  routeCache.set(key, { at: Date.now(), value });
}

/**
 * Menor rota de carro (OpenStreetMap via OSRM) entre origem e destino.
 * Pede rotas alternativas e escolhe a de menor distância.
 * Configure OSRM_BASE_URL (ex.: instância própria). O demo público é só para desenvolvimento.
 * @returns {Promise<{ distanceKm: number, durationSeconds: number, geometry: Array<[number, number]> }>}
 *   geometry em [lat, lng] (ordem do Leaflet)
 */
export async function getShortestDrivingRoute(originLat, originLng, destLat, destLng) {
  const o1 = num(originLat);
  const o2 = num(originLng);
  const d1 = num(destLat);
  const d2 = num(destLng);
  if (o1 == null || o2 == null || d1 == null || d2 == null) {
    throw new AppError(400, 'Coordenadas de origem ou destino inválidas para rota');
  }

  const key = cacheKey(o1, o2, d1, d2);
  const cached = cacheGet(key);
  if (cached) return cached;

  const base = env.osrmBaseUrl || 'https://router.project-osrm.org';
  const url =
    `${base}/route/v1/driving/${o2},${o1};${d2},${d1}` +
    '?overview=full&geometries=geojson&alternatives=true';

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  let res;
  try {
    res = await fetch(url, { signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new AppError(504, 'Tempo esgotado ao calcular a rota. Tente de novo.');
    }
    throw new AppError(502, 'Não foi possível contatar o serviço de rotas.');
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    throw new AppError(502, 'Serviço de rotas indisponível.');
  }

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new AppError(
      400,
      'Não foi encontrada rota de carro entre a loja e o ponto marcado. Ajuste o marcador ou verifique a origem da loja no painel.'
    );
  }

  const shortest = data.routes.reduce((best, r) => (r.distance < best.distance ? r : best), data.routes[0]);
  const coords = Array.isArray(shortest.geometry?.coordinates) ? shortest.geometry.coordinates : [];
  const value = {
    distanceKm: Math.round((shortest.distance / 1000) * 100) / 100,
    durationSeconds: Math.round(shortest.duration),
    geometry: coords.map(([lng, lat]) => [lat, lng]),
  };
  cacheSet(key, value);
  return value;
}

export async function getDrivingRouteKm(originLat, originLng, destLat, destLng) {
  const r = await getShortestDrivingRoute(originLat, originLng, destLat, destLng);
  return { distanceKm: r.distanceKm, durationSeconds: r.durationSeconds };
}
