/**
 * Base das chamadas à API.
 * - Dev: `/api` → proxy Vite remove `/api` e encaminha ao backend na raiz.
 * - Direto ao backend: use `http://127.0.0.1:4020` (sem `/api` no final — as rotas são `/admin/...`, não `/api/admin/...`).
 */
function resolveApiBase() {
  const raw = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? window.location.origin : '/api')
).trim();
  if (!raw) return '/api';
  if (/^https?:\/\//i.test(raw)) {
    let b = raw.replace(/\/+$/, '');
    if (/\/api$/i.test(b)) {
      b = b.replace(/\/api$/i, '');
    }
    return b || raw;
  }
  return raw.replace(/\/+$/, '') || '/api';
}

const BASE = resolveApiBase();

export const CART_TOKEN_KEY = 'delivery_cart_token';
export const CART_ID_KEY = 'delivery_cart_id';
export const CLIENT_TOKEN_KEY = 'delivery_client_token';

export function getCartToken() {
  const v = localStorage.getItem(CART_TOKEN_KEY);
  if (v == null) return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export function setCartAuth(id, accessToken) {
  const idStr = String(id ?? '').trim();
  const tok = String(accessToken ?? '').trim();
  localStorage.setItem(CART_ID_KEY, idStr);
  localStorage.setItem(CART_TOKEN_KEY, tok);
}

export function clearCartAuth() {
  localStorage.removeItem(CART_ID_KEY);
  localStorage.removeItem(CART_TOKEN_KEY);
}

export function getClientToken() {
  return sessionStorage.getItem(CLIENT_TOKEN_KEY);
}

export function setClientToken(token) {
  if (token) sessionStorage.setItem(CLIENT_TOKEN_KEY, token);
  else sessionStorage.removeItem(CLIENT_TOKEN_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('delivery-client-auth'));
  }
}

function mergeHeaders(base = {}, ...extras) {
  return extras.reduce((acc, extra) => ({ ...acc, ...extra }), { ...base });
}

async function request(path, options = {}) {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = mergeHeaders(options.headers || {});
  if (options.body != null && typeof options.body === 'string' && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      (typeof data === 'string' && data.startsWith('<')
        ? 'Resposta inválida (HTML em vez de JSON). Verifique proxy / VITE_API_URL.'
        : null) ||
      res.statusText ||
      'Erro na requisição';
    const err = new Error(msg);
    err.status = res.status;
    err.details = data?.details;
    throw err;
  }
  return data;
}

function withJson(method, path, body, opts = {}) {
  return request(path, {
    method,
    body: JSON.stringify(body),
    headers: mergeHeaders({ 'Content-Type': 'application/json' }, opts.headers || {}),
  });
}

function resolveCartToken(opts = {}) {
  const raw = opts.cartToken != null ? opts.cartToken : getCartToken();
  if (raw == null) return '';
  const t = String(raw).trim();
  return t === '' ? '' : t;
}

/** Requisições com token do carrinho (header X-Cart-Token). */
function withCart(path, opts = {}) {
  const t = resolveCartToken(opts);
  const { cartToken: _omitCart, headers: ho = {}, ...rest } = opts;
  const h = mergeHeaders(ho, t ? { 'X-Cart-Token': t } : {});
  return request(path, { ...rest, headers: h });
}

function withCartJson(method, path, body, opts = {}) {
  const t = resolveCartToken(opts);
  const { cartToken: _omitCart, headers: ho = {}, ...rest } = opts;
  const h = mergeHeaders(
    { 'Content-Type': 'application/json' },
    ho,
    t ? { 'X-Cart-Token': t } : {}
  );
  return request(path, { method, body: JSON.stringify(body), ...rest, headers: h });
}

/** Requisições com sessão do cliente (Authorization Bearer). */
function withClient(path, opts = {}) {
  const t = getClientToken();
  const h = mergeHeaders(opts.headers || {}, t ? { Authorization: `Bearer ${t}` } : {});
  return request(path, { ...opts, headers: h });
}

function withClientJson(method, path, body, opts = {}) {
  const t = getClientToken();
  const h = mergeHeaders(
    { 'Content-Type': 'application/json' },
    opts.headers || {},
    t ? { Authorization: `Bearer ${t}` } : {}
  );
  return request(path, { method, body: JSON.stringify(body), headers: h });
}

export const api = {
  get: (p, opts = {}) => request(p, { method: 'GET', ...opts }),
  post: (p, body, opts = {}) => withJson('POST', p, body, opts),
  put: (p, body, opts = {}) => withJson('PUT', p, body, opts),
  patch: (p, body, opts = {}) => withJson('PATCH', p, body, opts),
  delete: (p, opts = {}) => request(p, { method: 'DELETE', ...opts }),

  cartGet: (p, opts = {}) => withCart(p, { method: 'GET', ...opts }),
  cartPost: (p, body, opts = {}) => withCartJson('POST', p, body, opts),
  cartPut: (p, body, opts = {}) => withCartJson('PUT', p, body, opts),
  cartDelete: (p, opts = {}) => withCart(p, { method: 'DELETE', ...opts }),

  clientGet: (p, opts = {}) => withClient(p, { method: 'GET', ...opts }),
  clientPost: (p, body, opts = {}) => withClientJson('POST', p, body, opts),
  clientPut: (p, body, opts = {}) => withClientJson('PUT', p, body, opts),

  /** Pedido: cliente + carrinho */
  postOrder: (body, opts = {}) => {
    const ct = getClientToken();
    const cart = resolveCartToken(opts);
    const { cartToken: _omitCart, headers: ho = {}, ...rest } = opts;
    const h = mergeHeaders(
      { 'Content-Type': 'application/json' },
      ho,
      ct ? { Authorization: `Bearer ${ct}` } : {},
      cart ? { 'X-Cart-Token': cart } : {}
    );
    return request('/orders', { method: 'POST', body: JSON.stringify(body), ...rest, headers: h });
  },
};

export function adminHeaders(token) {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
