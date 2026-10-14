import ssoLib from './premier-sso-client.cjs';

export const SSO_MODULE = 'site_admin';
export const { hasModule } = ssoLib;

let client;

/** Login único da Premier para o painel. Ligado com SSO_URL; sem ele vale o login próprio do painel. */
export function ssoClient() {
  if (client === undefined) {
    const url = String(process.env.SSO_URL || '').trim();
    client = url ? new ssoLib.SsoClient({ ssoUrl: url }) : null;
  }
  return client;
}

/** Página do painel para onde voltar depois do login no SSO. */
export function panelUrl(req) {
  const referer = String(req.headers.referer || '');
  if (referer) return referer;
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  return `${proto}://${host}/admin/painel`;
}

export function ssoInfo() {
  const sso = ssoClient();
  return sso ? { url: sso.ssoUrl, portal: sso.portalUrl() } : null;
}
