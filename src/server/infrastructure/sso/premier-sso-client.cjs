'use strict';

// Cliente do SSO da Premier para os sistemas Node (Express, NestJS, Next).
// Sem dependências: valida o token ES256 do cookie compartilhado com a chave pública do SSO.

const crypto = require('crypto');

const ACCESS_COOKIE = 'premier_sso';
const TOKEN_TYPE = 'premier-sso';
const KEYS_TTL_MS = 10 * 60 * 1000;
const UNKNOWN_KID_RETRY_MS = 60 * 1000;

function b64urlDecode(text) {
  return Buffer.from(String(text).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function b64urlEncode(buffer) {
  return Buffer.from(buffer).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    if (!(name in out)) {
      try {
        out[name] = decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        out[name] = part.slice(eq + 1).trim();
      }
    }
  }
  return out;
}

/**
 * Confere assinatura e validade do token. Devolve o payload ou null.
 * @param {string} token
 * @param {{ keys: Map<string, crypto.KeyObject>, issuer?: string, now?: number, skewSeconds?: number }} opts
 */
function verifyToken(token, opts) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString('utf8'));
    payload = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
  } catch {
    return null;
  }
  if (!header || header.alg !== 'ES256' || !header.kid) return null;
  const key = opts.keys.get(header.kid);
  if (!key) return { unknownKid: header.kid };
  const signature = b64urlDecode(parts[2]);
  const ok = crypto.verify('sha256', Buffer.from(`${parts[0]}.${parts[1]}`), { key, dsaEncoding: 'ieee-p1363' }, signature);
  if (!ok) return null;
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const skew = opts.skewSeconds ?? 30;
  if (payload.typ !== TOKEN_TYPE) return null;
  if (opts.issuer && payload.iss !== opts.issuer) return null;
  if (typeof payload.exp !== 'number' || payload.exp + skew < now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf - skew > now) return null;
  if (!payload.sub) return null;
  return payload;
}

function toUser(payload) {
  return {
    id: Number(payload.sub),
    email: String(payload.email || ''),
    name: String(payload.name || ''),
    isSuperAdmin: Boolean(payload.sup),
    modules: Array.isArray(payload.mod) ? payload.mod.map(String) : [],
    roles: payload.roles && typeof payload.roles === 'object' ? payload.roles : {},
    sessionId: String(payload.sid || ''),
    expiresAt: payload.exp * 1000,
  };
}

function hasModule(user, module) {
  return Boolean(user && module && user.modules.includes(module));
}

class SsoClient {
  /**
   * @param {object} opts
   * @param {string} opts.ssoUrl        ex.: https://sso.premierdistribuidora.com.br
   * @param {string} [opts.issuer]      padrão: ssoUrl
   * @param {string} [opts.publicKey]   PEM da chave pública (opcional; sem ele busca em /.well-known/jwks.json)
   * @param {string} [opts.cookieName]  padrão: premier_sso
   * @param {Function} [opts.fetch]
   */
  constructor(opts) {
    if (!opts || !opts.ssoUrl) throw new Error('Informe ssoUrl do SSO');
    this.ssoUrl = String(opts.ssoUrl).replace(/\/+$/, '');
    this.issuer = opts.issuer || this.ssoUrl;
    this.cookieName = opts.cookieName || ACCESS_COOKIE;
    this.fetch = opts.fetch || globalThis.fetch;
    this.now = opts.now || Date.now;
    this.keys = new Map();
    this.keysAt = 0;
    this.lastMissAt = 0;
    this.fixedKey = Boolean(opts.publicKey);
    if (opts.publicKey) {
      const key = crypto.createPublicKey(String(opts.publicKey).replace(/\\n/g, '\n'));
      this.keys.set(keyId(key), key);
      this.keysAt = Infinity;
    }
  }

  async loadKeys(force = false) {
    if (this.fixedKey) return this.keys;
    if (!force && this.keys.size && this.now() - this.keysAt < KEYS_TTL_MS) return this.keys;
    const res = await this.fetch(`${this.ssoUrl}/.well-known/jwks.json`, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`SSO respondeu ${res.status} ao buscar a chave pública`);
    const body = await res.json();
    const keys = new Map();
    for (const jwk of body.keys || []) {
      if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.kid) continue;
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
    }
    if (!keys.size) throw new Error('SSO não devolveu chave pública ES256');
    this.keys = keys;
    this.keysAt = this.now();
    return keys;
  }

  /** Usuário do token, ou null se ausente, inválido ou vencido. */
  async verify(token) {
    if (!token) return null;
    let result;
    try {
      result = verifyToken(token, { keys: await this.loadKeys(), issuer: this.issuer, now: this.now() });
      if (result && result.unknownKid && !this.fixedKey && this.now() - this.lastMissAt > UNKNOWN_KID_RETRY_MS) {
        this.lastMissAt = this.now();
        result = verifyToken(token, { keys: await this.loadKeys(true), issuer: this.issuer, now: this.now() });
      }
    } catch {
      return null;
    }
    if (!result || result.unknownKid) return null;
    return toUser(result);
  }

  tokenFromRequest(req) {
    const cookies = req.cookies && typeof req.cookies === 'object' ? req.cookies : parseCookies(req.headers && req.headers.cookie);
    return cookies[this.cookieName] || '';
  }

  userFromRequest(req) {
    return this.verify(this.tokenFromRequest(req));
  }

  /** Para onde mandar quem não tem token: o SSO renova (se ainda logado) ou pede login e volta para returnUrl. */
  loginUrl(returnUrl) {
    return `${this.ssoUrl}/api/authorize?return=${encodeURIComponent(returnUrl)}`;
  }

  portalUrl() {
    return `${this.ssoUrl}/`;
  }

  logoutUrl(returnUrl) {
    return `${this.ssoUrl}/sair${returnUrl ? `?return=${encodeURIComponent(returnUrl)}` : ''}`;
  }
}

/** Mesmo `kid` que o SSO publica: sha256 da chave pública (DER), 16 primeiros bytes em base64url. */
function keyId(publicKey) {
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return b64urlEncode(crypto.createHash('sha256').update(der).digest().subarray(0, 16));
}

function requestUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}${req.originalUrl || req.url || '/'}`;
}

function wantsJson(req, apiPrefix) {
  const path = String(req.originalUrl || req.url || '');
  if (apiPrefix && path.startsWith(apiPrefix)) return true;
  const accept = String(req.headers.accept || '');
  return req.method !== 'GET' || (accept.includes('application/json') && !accept.includes('text/html'));
}

function matches(path, rules) {
  return rules.some((rule) => (rule instanceof RegExp ? rule.test(path) : path === rule || path.startsWith(`${rule.replace(/\/$/, '')}/`)));
}

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function deniedPage(client, moduleName) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sem acesso</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#f8fafc;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:420px;padding:2rem;text-align:center}a{color:#f97316}</style></head>
<body><main><h1>Sem acesso</h1><p>Seu usuário não tem acesso ao módulo <strong>${escapeHtml(moduleName)}</strong>.</p><p>Peça a liberação a um administrador.</p><p><a href="${escapeHtml(client.portalUrl())}">Voltar ao portal</a></p></main></body></html>`;
}

/**
 * Middleware Express: sem token válido, página vai ao login do SSO e API recebe 401 com { sso } para redirecionar.
 * @param {SsoClient} client
 * @param {{ module?: string, publicPaths?: Array<string|RegExp>, apiPrefix?: string }} [opts]
 */
function requireSso(client, opts = {}) {
  const publicPaths = opts.publicPaths || [];
  const apiPrefix = opts.apiPrefix ?? '/api';
  return async (req, res, next) => {
    const path = String(req.path || req.url || '/').split('?')[0];
    if (matches(path, publicPaths)) return next();
    const user = await client.userFromRequest(req);
    const json = wantsJson(req, apiPrefix);
    if (!user) {
      const back = json ? String(req.headers.referer || requestUrl(req)) : requestUrl(req);
      if (json) return res.status(401).json({ message: 'Sessão expirada. Entre novamente.', sso: client.loginUrl(back) });
      return res.redirect(302, client.loginUrl(back));
    }
    if (opts.module && !hasModule(user, opts.module)) {
      if (json) return res.status(403).json({ message: 'Seu usuário não tem acesso a este sistema', portal: client.portalUrl() });
      return res.status(403).type('html').send(deniedPage(client, opts.module));
    }
    req.ssoUser = user;
    return next();
  };
}

/**
 * Cifra IDs para URLs (ex.: /pedidos/7Hq3...): determinística (mesmo ID gera a mesma URL) e autenticada (AES-256-GCM).
 * Quem não tem o segredo não consegue montar nem adivinhar o endereço de outro registro.
 */
function createIdCipher(secret, purpose = 'id') {
  if (!secret || String(secret).length < 32) throw new Error('Segredo de URL precisa de 32+ caracteres');
  const key = crypto.createHash('sha256').update(`premier-url|${purpose}|${secret}`).digest();
  return {
    encode(id) {
      const plain = Buffer.from(String(id), 'utf8');
      const iv = crypto.createHmac('sha256', key).update(plain).digest().subarray(0, 12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(plain), cipher.final()]);
      return b64urlEncode(Buffer.concat([iv, cipher.getAuthTag(), body]));
    },
    decode(token) {
      try {
        const raw = b64urlDecode(token);
        if (raw.length < 29) return null;
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
        decipher.setAuthTag(raw.subarray(12, 28));
        return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
      } catch {
        return null;
      }
    },
  };
}

module.exports = {
  ACCESS_COOKIE,
  TOKEN_TYPE,
  SsoClient,
  verifyToken,
  toUser,
  hasModule,
  keyId,
  parseCookies,
  requireSso,
  createIdCipher,
};
