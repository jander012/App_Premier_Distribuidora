/**
 * Sugestão de rotas Loja → entregas → Loja.
 * - Âncora de cada rota = pedido mais antigo do grupo
 * - Hop máx. 1,5 km entre pedidos consecutivos
 * - Exceção: se a âncora for longe, pode incluir pedido a ≤ 500 m do percurso Loja→âncora
 */

const ROAD_FACTOR = 1.35;
const DEFAULT_MAX_STOPS = 3;
const DEFAULT_MAX_ROUTE_KM = 45;
/** Deslocamento máximo entre um pedido e o seguinte na rota. */
const MAX_HOP_KM = 1.5;
/** Desvio máximo do percurso Loja→âncora para entregar no caminho. */
const MAX_DETOUR_KM = 0.5;
/** Distância loja→âncora a partir da qual permite desvio no percurso. */
const FAR_ANCHOR_KM = 1.5;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeLatLng(lat, lng) {
  let a = num(lat);
  let b = num(lng);
  if (a == null || b == null) return null;
  if (Math.abs(a) > 90 && Math.abs(b) <= 90) {
    const t = a;
    a = b;
    b = t;
  }
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;
  return { lat: a, lng: b };
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const h = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function roadKm(a, b) {
  return Math.round(haversineKm(a, b) * ROAD_FACTOR * 100) / 100;
}

function createdMs(p) {
  const t = Date.parse(p.createdAt || p.created_at || '');
  return Number.isFinite(t) ? t : 0;
}

/** Distância (km) e projeção t∈[0,1] de um ponto ao segmento a→b. */
function pointToSegmentKm(p, a, b) {
  const midLat = (((a.lat + b.lat) / 2) * Math.PI) / 180;
  const toXY = (pt) => ({
    x: pt.lng * 111.32 * Math.cos(midLat),
    y: pt.lat * 110.57,
  });
  const A = toXY(a);
  const B = toXY(b);
  const P = toXY(p);
  const abx = B.x - A.x;
  const aby = B.y - A.y;
  const apx = P.x - A.x;
  const apy = P.y - A.y;
  const ab2 = abx * abx + aby * aby;
  let t = ab2 === 0 ? 0 : (apx * abx + apy * aby) / ab2;
  t = Math.max(0, Math.min(1, t));
  const dx = P.x - (A.x + t * abx);
  const dy = P.y - (A.y + t * aby);
  return { distKm: Math.sqrt(dx * dx + dy * dy), t };
}

function roundTripKm(store, stops) {
  if (!stops.length) return 0;
  let total = roadKm(store, stops[0]);
  for (let i = 0; i < stops.length - 1; i += 1) {
    total += roadKm(stops[i], stops[i + 1]);
  }
  total += roadKm(stops[stops.length - 1], store);
  return Math.round(total * 100) / 100;
}

/**
 * Valida hops entre entregas:
 * - trechos "no percurso" (até a âncora) liberados se cada um ≤ 500 m do segmento Loja→âncora
 * - depois da âncora: hop ≤ 1,5 km
 */
function hopsOk(store, anchor, ordered) {
  const anchorFar = roadKm(store, anchor) >= FAR_ANCHOR_KM;
  const anchorIdx = ordered.findIndex((s) => s.id === anchor.id);
  if (anchorIdx < 0) return false;

  for (let i = 0; i < ordered.length - 1; i += 1) {
    const a = ordered[i];
    const b = ordered[i + 1];
    const d = roadKm(a, b);
    // Antes ou até a âncora: permite se ambos (ou o intermediário) estão no corredor de 500 m
    if (i < anchorIdx) {
      if (!anchorFar) return false;
      const da = pointToSegmentKm(a, store, anchor);
      const db = pointToSegmentKm(b, store, anchor);
      const aOk = a.id === anchor.id || (da.distKm <= MAX_DETOUR_KM && da.t <= 0.95);
      const bOk = b.id === anchor.id || (db.distKm <= MAX_DETOUR_KM && db.t <= 0.95);
      if (!aOk || !bOk) return false;
      continue;
    }
    if (d > MAX_HOP_KM + 0.01) return false;
  }
  return true;
}

/**
 * Ordena paradas: desvios no percurso (por t) → âncora → vizinhos próximos (≤1,5 km).
 */
function orderRouteStops(store, anchor, companions) {
  const along = [];
  const after = [];
  const anchorFar = roadKm(store, anchor) >= FAR_ANCHOR_KM;

  for (const p of companions) {
    if (anchorFar) {
      const { distKm, t } = pointToSegmentKm(p, store, anchor);
      // No meio do caminho (não colado na loja nem na âncora) e ≤ 500 m da rota
      if (distKm <= MAX_DETOUR_KM && t > 0.05 && t < 0.95) {
        along.push({ p, t });
        continue;
      }
    }
    after.push(p);
  }

  along.sort((x, y) => x.t - y.t);
  const ordered = [...along.map((x) => x.p), anchor];

  // Encadeia os demais a partir da âncora com hop ≤ 1,5 km (mais antigo primeiro em empate)
  const remaining = after
    .slice()
    .sort((a, b) => createdMs(a) - createdMs(b) || a.id - b.id);
  let cur = anchor;
  while (remaining.length) {
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const d = roadKm(cur, remaining[i]);
      if (d <= MAX_HOP_KM && d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) break;
    const [next] = remaining.splice(bestIdx, 1);
    ordered.push(next);
    cur = next;
  }

  return { ordered, leftover: remaining };
}

/**
 * Pode o candidato entrar na rota da âncora?
 * - ≤ 1,5 km de alguma parada já na rota (encadeável), ou
 * - âncora longe e candidato ≤ 500 m do segmento Loja→âncora
 */
function canJoinRoute(store, anchor, currentStops, candidate) {
  const anchorFar = roadKm(store, anchor) >= FAR_ANCHOR_KM;
  if (anchorFar) {
    const { distKm, t } = pointToSegmentKm(candidate, store, anchor);
    if (distKm <= MAX_DETOUR_KM && t > 0.05 && t < 0.95) return true;
  }
  for (const s of currentStops) {
    if (roadKm(s, candidate) <= MAX_HOP_KM) return true;
  }
  return false;
}

/**
 * @param {{ lat: number, lng: number }} store
 * @param {Array<{ id: number, lat: number, lng: number, customerName?: string, total?: number, createdAt?: string }>} points
 * @param {{ maxStops?: number, maxRouteKm?: number }} [opts]
 */
export function buildRouteSuggestions(store, points, opts = {}) {
  const maxStops = Math.min(Math.max(Number(opts.maxStops) || DEFAULT_MAX_STOPS, 1), 12);
  const maxRouteKm = Number(opts.maxRouteKm) > 0 ? Number(opts.maxRouteKm) : DEFAULT_MAX_ROUTE_KM;

  if (!store || !points?.length) {
    return { routes: [], unlocated: [], store };
  }

  // Prioridade: mais antigo → mais novo
  const queue = points
    .slice()
    .sort((a, b) => createdMs(a) - createdMs(b) || a.id - b.id);
  const unassigned = new Set(queue.map((p) => p.id));
  const byId = new Map(points.map((p) => [p.id, p]));
  const builtRoutes = [];

  while (unassigned.size) {
    const anchor = queue.find((p) => unassigned.has(p.id));
    if (!anchor) break;
    unassigned.delete(anchor.id);

    const members = [anchor];
    // Candidatos restantes: mais antigos primeiro; prefere quem cabe nas regras
    const candidates = queue.filter((p) => unassigned.has(p.id));

    while (members.length < maxStops) {
      let best = null;
      let bestScore = Infinity;

      for (const c of candidates) {
        if (!unassigned.has(c.id)) continue;
        if (!canJoinRoute(store, anchor, members, c)) continue;

        const trial = orderRouteStops(
          store,
          anchor,
          members.filter((m) => m.id !== anchor.id).concat(c)
        );
        // Só aceita se todos os membros (âncora + companions) entraram na sequência
        if (trial.leftover.length > 0) continue;
        if (!hopsOk(store, anchor, trial.ordered)) continue;

        const km = roundTripKm(store, trial.ordered);
        if (km > maxRouteKm) continue;

        // Score: prioriza mais antigo + menor KM total + menor desvio
        const ageRank = createdMs(c);
        const hopFromAnchor = roadKm(anchor, c);
        const score = ageRank / 1e12 + km * 10 + hopFromAnchor;
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      }

      if (!best) break;
      members.push(best);
      unassigned.delete(best.id);
    }

    const companions = members.filter((m) => m.id !== anchor.id);
    const { ordered } = orderRouteStops(store, anchor, companions);
    // Garante âncora presente; se leftover, rota só com o que encaixou
    const stops = ordered.length ? ordered : [anchor];
    const km = roundTripKm(store, stops);
    const durationMin = Math.max(1, Math.round((km / 25) * 60));

    builtRoutes.push({
      anchorOrderId: anchor.id,
      anchorCreatedAt: anchor.createdAt || null,
      orderIds: stops.map((s) => s.id),
      stops: stops.map((s, i) => ({
        sequence: i + 1,
        orderId: s.id,
        customerName: s.customerName || null,
        lat: s.lat,
        lng: s.lng,
        total: s.total ?? null,
        isAnchor: s.id === anchor.id,
        createdAt: s.createdAt || null,
      })),
      distanceKm: km,
      estimatedMinutes: durationMin,
      pathLabel: `Loja → ${stops.map((s) => `#${s.id}`).join(' → ')} → Loja`,
    });
  }

  // Rotas pela âncora mais antiga primeiro
  const suggestions = builtRoutes
    .sort(
      (a, b) =>
        Date.parse(a.anchorCreatedAt || 0) - Date.parse(b.anchorCreatedAt || 0) ||
        a.anchorOrderId - b.anchorOrderId
    )
    .map((r, i) => ({ ...r, id: i + 1 }));

  const totalKm = Math.round(suggestions.reduce((s, r) => s + r.distanceKm, 0) * 100) / 100;

  return {
    store,
    routes: suggestions,
    totalDistanceKm: totalKm,
    maxStops,
    maxRouteKm,
    maxHopKm: MAX_HOP_KM,
    maxDetourKm: MAX_DETOUR_KM,
    algorithm: 'oldest-anchor+hop-1.5+detour-0.5',
  };
}

/**
 * @param {object[]} orders — pedidos received (linhas admin)
 * @param {{ lat: number, lng: number }|null} storeOrigin
 * @param {{ maxStops?: number, maxRouteKm?: number }} [opts]
 */
export function suggestRoutesForReceivedOrders(orders, storeOrigin, opts = {}) {
  const located = [];
  const unlocated = [];

  for (const o of orders || []) {
    if (o.status && o.status !== 'received') continue;
    const pin = normalizeLatLng(o.delivery_latitude, o.delivery_longitude);
    if (!pin) {
      unlocated.push({
        orderId: o.id,
        customerName: o.customer_full_name || null,
        reason: 'sem_coordenadas',
      });
      continue;
    }
    located.push({
      id: o.id,
      lat: pin.lat,
      lng: pin.lng,
      customerName: o.customer_full_name || null,
      total: o.total != null ? Number(o.total) : null,
      createdAt: o.created_at || o.createdAt || null,
    });
  }

  if (!storeOrigin) {
    return {
      ok: false,
      error: 'Cadastre a origem da loja em Entrega para montar as rotas.',
      routes: [],
      unlocated,
      store: null,
    };
  }

  const built = buildRouteSuggestions(storeOrigin, located, opts);
  return {
    ok: true,
    ...built,
    unlocated,
    orderCount: located.length,
    updatedAt: new Date().toISOString(),
  };
}
