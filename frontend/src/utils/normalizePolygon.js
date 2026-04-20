/** Normaliza polígono vindo da API para Leaflet (type, anel fechado, números). */
export function normalizePolygonForMap(raw) {
  if (raw == null) return null;
  let o = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  if (o.type === 'Feature' && o.geometry) {
    return normalizePolygonForMap(o.geometry);
  }
  if (String(o.type || '').toLowerCase() !== 'polygon' || !Array.isArray(o.coordinates)) return null;
  let ring = o.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 3) return null;
  ring = ring.map((p) => [Number(p[0]), Number(p[1])]);
  if (ring.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) return null;
  const f = ring[0];
  const l = ring[ring.length - 1];
  if (f[0] !== l[0] || f[1] !== l[1]) {
    ring = [...ring, [...f]];
  }
  if (ring.length < 4) return null;
  return { type: 'Polygon', coordinates: [ring] };
}
