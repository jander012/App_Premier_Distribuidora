import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Distância e duração de condução (OpenStreetMap via OSRM).
 * Configure OSRM_BASE_URL (ex.: instância própria). O demo público é só para desenvolvimento.
 */
export async function getDrivingRouteKm(originLat, originLng, destLat, destLng) {
  const o1 = num(originLat);
  const o2 = num(originLng);
  const d1 = num(destLat);
  const d2 = num(destLng);
  if (o1 == null || o2 == null || d1 == null || d2 == null) {
    throw new AppError(400, 'Coordenadas de origem ou destino inválidas para rota');
  }

  const base = env.osrmBaseUrl || 'https://router.project-osrm.org';
  const url = `${base}/route/v1/driving/${o2},${o1};${d2},${d1}?overview=false`;

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
  if (data.code !== 'Ok' || !data.routes?.[0]) {
    throw new AppError(
      400,
      'Não foi encontrada rota de carro entre a loja e o ponto marcado. Ajuste o marcador ou verifique a origem da loja no painel.'
    );
  }

  const r = data.routes[0];
  return {
    distanceKm: r.distance / 1000,
    durationSeconds: r.duration,
  };
}
