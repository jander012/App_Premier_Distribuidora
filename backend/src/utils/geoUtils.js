import { AppError } from './AppError.js';

/**
 * Anel GeoJSON: [[lng, lat], ...] — deve ser fechado (primeiro = último).
 * Ray casting; lng = x, lat = y.
 */
export function pointInPolygonRing(lng, lat, ring) {
  if (!ring || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    if (Number.isNaN(xi) || Number.isNaN(yi) || Number.isNaN(xj) || Number.isNaN(yj)) continue;
    const denom = yj - yi;
    if (denom === 0) continue;
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / denom + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** @param {unknown} raw - objeto ou string JSON */
export function parseDeliveryPolygon(raw) {
  if (raw == null) return null;
  let obj = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== 'object') return null;
  if (obj.type === 'Feature' && obj.geometry) {
    return parseDeliveryPolygon(obj.geometry);
  }
  const typ = String(obj.type || '');
  if (typ.toLowerCase() !== 'polygon' || !Array.isArray(obj.coordinates)) return null;
  let outer = obj.coordinates[0];
  if (!Array.isArray(outer) || outer.length < 3) return null;
  outer = outer.map((p) => [Number(p[0]), Number(p[1])]);
  if (outer.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  const f = outer[0];
  const l = outer[outer.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) {
    outer = [...outer, [...f]];
  }
  if (outer.length < 4) return null;
  return { type: 'Polygon', coordinates: [outer] };
}

/**
 * Normaliza anel (fecha se necessário) e valida mínimo 3 vértices únicos.
 * @returns {{ type: 'Polygon', coordinates: number[][][] }}
 */
export function validateAndNormalizePolygonGeoJson(input) {
  if (!input || typeof input !== 'object') {
    throw new AppError(400, 'Polígono inválido');
  }
  const coords = input.coordinates;
  if (String(input.type || '').toLowerCase() !== 'polygon' || !Array.isArray(coords) || !Array.isArray(coords[0])) {
    throw new AppError(400, 'Envie um GeoJSON do tipo Polygon');
  }
  let ring = coords[0].map((p) => [Number(p[0]), Number(p[1])]);
  if (ring.length < 3) {
    throw new AppError(400, 'O polígono precisa de pelo menos 3 pontos');
  }
  for (const p of ring) {
    if (!Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
      throw new AppError(400, 'Coordenadas do polígono inválidas');
    }
    if (p[0] < -180 || p[0] > 180 || p[1] < -90 || p[1] > 90) {
      throw new AppError(400, 'Coordenadas fora do intervalo válido (lng/lat)');
    }
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring = [...ring, [...first]];
  }
  if (ring.length < 4) {
    throw new AppError(400, 'O polígono precisa de pelo menos 3 vértices distintos');
  }
  return { type: 'Polygon', coordinates: [ring] };
}
