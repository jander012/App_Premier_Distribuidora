import { env } from '../../config/env.js';

function baseUrl() {
  return String(env.entregadoresApiBaseUrl || '').replace(/\/$/, '');
}

export function isEntregadoresRemoteConfigured() {
  return Boolean(baseUrl());
}

export function entregadoresCadastroUrl() {
  const explicit = String(env.entregadoresCadastroUrl || '').replace(/\/$/, '');
  if (explicit) return explicit;
  return baseUrl() || '';
}

/**
 * Lista entregadores do cadastro Premier (enviar_dados_entregador / premier-api).
 * @returns {Promise<Array<{ email: string, nome: string, telefone?: string, username?: string }>>}
 */
export async function fetchRemoteEntregadores() {
  const base = baseUrl();
  if (!base) {
    const err = new Error('ENTREGADORES_API_BASE_URL não configurada');
    err.status = 503;
    throw err;
  }
  const headers = { Accept: 'application/json' };
  if (env.entregadoresApiKey) {
    headers['X-Plugin-Key'] = env.entregadoresApiKey;
  }
  const res = await fetch(`${base}/api/entregadores`, {
    method: 'GET',
    headers,
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = new Error(json?.detail || json?.error || `Falha ao buscar entregadores (${res.status})`);
    err.status = res.status;
    throw err;
  }
  if (!Array.isArray(json)) {
    throw new Error('Resposta inválida da API de entregadores');
  }
  return json.map((row) => ({
    email: String(row.email || '').trim().toLowerCase(),
    nome: String(row.nome || row.name || '').trim(),
    telefone: String(row.telefone || row.phone || '').replace(/\D/g, '') || null,
    username: String(row.username || '').trim().toLowerCase() || null,
  })).filter((row) => row.email && row.nome);
}
