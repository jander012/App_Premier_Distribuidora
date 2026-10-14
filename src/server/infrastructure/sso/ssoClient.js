import ssoLib from './premier-sso-client.cjs';

export const SSO_MODULE = 'site_admin';
export const { hasModule } = ssoLib;

let client;

const SSO_PADRAO = 'https://sso.premierdistribuidora.com.br';

/** Login único da Premier: sem SSO_URL vale o SSO de produção; SSO_URL=desligado volta ao login próprio (emergência). */
export function ssoClient() {
  if (client === undefined) {
    const raw = String(process.env.SSO_URL || '').trim();
    const url = raw.toLowerCase() === 'desligado' ? '' : raw || SSO_PADRAO;
    client = url ? new ssoLib.SsoClient({ ssoUrl: url }) : null;
  }
  return client;
}

/** Página do painel para onde voltar depois do login no SSO (nunca a tela de login /admin, que voltaria para o SSO). */
export function panelUrl(req) {
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const referer = String(req.headers.referer || '');
  try {
    if (referer && new URL(referer).pathname.startsWith('/admin/painel')) return referer;
  } catch {
    // Referer inválido: usa o painel.
  }
  return `${proto}://${host}/admin/painel`;
}

export function ssoInfo() {
  const sso = ssoClient();
  return sso ? { url: sso.ssoUrl, portal: sso.portalUrl() } : null;
}
