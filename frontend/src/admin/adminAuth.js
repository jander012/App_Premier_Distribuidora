import { adminHeaders as tokenToHeaders } from '../api/client.js';

export const ADMIN_TOKEN_KEY = 'admin_token';
export const ADMIN_STORE_ID_KEY = 'admin_store_id';
/** Lista de lojas do usuário (localStorage, junto com o token — sobrevive nova aba / F5). */
export const ADMIN_STORES_KEY = 'admin_stores';
export const ADMIN_SUPER_KEY = 'admin_is_super';

export function getIsSuperAdmin() {
  return localStorage.getItem(ADMIN_SUPER_KEY) === '1';
}

export function setIsSuperAdmin(value) {
  if (value) localStorage.setItem(ADMIN_SUPER_KEY, '1');
  else localStorage.removeItem(ADMIN_SUPER_KEY);
}

export function getAdminStoresList() {
  try {
    const raw = localStorage.getItem(ADMIN_STORES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function setAdminStoresList(stores) {
  localStorage.setItem(ADMIN_STORES_KEY, JSON.stringify(Array.isArray(stores) ? stores : []));
}

export function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function getAdminStoreId() {
  return localStorage.getItem(ADMIN_STORE_ID_KEY);
}

export function setAdminStoreId(id) {
  if (id == null) localStorage.removeItem(ADMIN_STORE_ID_KEY);
  else localStorage.setItem(ADMIN_STORE_ID_KEY, String(id));
}

export function mergeAdminStoresSession(storeRow) {
  try {
    const prev = getAdminStoresList();
    const rest = prev.filter((s) => s.id !== storeRow.id);
    rest.push({ id: storeRow.id, name: storeRow.name, slug: storeRow.slug });
    rest.sort((a, b) => String(a.name).localeCompare(String(b.name)));
    setAdminStoresList(rest);
  } catch {
    setAdminStoresList([{ id: storeRow.id, name: storeRow.name, slug: storeRow.slug }]);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('admin-session-refresh'));
  }
}

/** Apenas Bearer (para /admin/me sem loja ativa). */
export function adminAuthHeadersOnly() {
  return tokenToHeaders(getAdminToken());
}

/** Headers para chamadas autenticadas do painel. */
export function adminHeaders() {
  const h = tokenToHeaders(getAdminToken());
  const sid = getAdminStoreId();
  if (sid) h['X-Store-Id'] = sid;
  return h;
}

export function clearAdminClientSession() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  localStorage.removeItem(ADMIN_STORES_KEY);
  localStorage.removeItem(ADMIN_SUPER_KEY);
  setAdminStoreId(null);
}
