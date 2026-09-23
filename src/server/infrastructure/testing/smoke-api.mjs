/**
 * Verifica health, /stores, login por código e /admin/me na API Next.
 *
 * Uso:
 *   npm run smoke
 *   npm run smoke -- --url=http://127.0.0.1:3000/api
 */
function resolveBase() {
  const urlArg = process.argv.find((a) => a.startsWith('--url='))?.split('=')[1]?.trim();
  if (urlArg) return urlArg.replace(/\/$/, '');

  const portArg = process.argv.find((a) => a.startsWith('--port='))?.split('=')[1]?.trim();
  if (portArg && /^\d+$/.test(portArg)) return `http://127.0.0.1:${portArg}/api`;

  return (process.env.API_BASE_URL || 'http://127.0.0.1:3000/api').replace(/\/$/, '');
}

async function main() {
  const base = resolveBase();
  console.log('Alvo:', base, '\n');

  const health = await fetch(`${base}/health`);
  const healthText = await health.text();
  console.log(`GET  ${base}/health ->`, health.status, healthText.slice(0, 80));

  const stores = await fetch(`${base}/stores`);
  const storesText = await stores.text();
  console.log(`GET  ${base}/stores ->`, stores.status, storesText.slice(0, 160));
  if (!stores.ok) {
    console.error('\nFalha em /stores. Suba a aplicacao Next com: npm run dev');
    process.exit(1);
  }

  const authModeRes = await fetch(`${base}/admin/auth-mode`);
  const authModeText = await authModeRes.text();
  console.log(`GET  ${base}/admin/auth-mode ->`, authModeRes.status, authModeText.slice(0, 120));
  let authMode = 'password';
  try {
    authMode = JSON.parse(authModeText).mode || 'password';
  } catch {}

  let loginBody = { email: 'admin@delivery.local', password: 'admin123' };
  if (authMode === 'email_code') {
    const requestCode = await fetch(`${base}/admin/request-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@delivery.local' }),
    });
    const requestCodeText = await requestCode.text();
    console.log(`POST ${base}/admin/request-code ->`, requestCode.status, requestCodeText.slice(0, 180));
    if (!requestCode.ok) {
      console.error('\nSolicitação de código falhou. Confira migrations, seed e configuração de e-mail.');
      process.exit(1);
    }

    let code;
    try {
      code = JSON.parse(requestCodeText).code;
    } catch {
      code = null;
    }
    if (!code) {
      console.error('\nSmoke precisa de ADMIN_OTP_DEBUG_RETURN=true ou NODE_ENV=development para ler o código.');
      process.exit(1);
    }
    loginBody = { email: 'admin@delivery.local', code };
  }

  const login = await fetch(`${base}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginBody),
  });
  const loginText = await login.text();
  console.log(`POST ${base}/admin/login ->`, login.status, loginText.slice(0, 180));
  if (!login.ok) {
    console.error('\nLogin falhou. Confira migrations, seed e credenciais.');
    process.exit(1);
  }

  let token;
  try {
    token = JSON.parse(loginText).token;
  } catch {
    token = null;
  }

  if (token) {
    const me = await fetch(`${base}/admin/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const meText = await me.text();
    console.log(`GET  ${base}/admin/me ->`, me.status, meText.slice(0, 120));
    if (!me.ok) process.exit(1);
  }

  console.log('\nSmoke OK.');
}

main().catch((e) => {
  console.error(e.message || e);
  if (e.cause?.code === 'ECONNREFUSED' || e.code === 'ECONNREFUSED') {
    console.error('\nAplicacao inacessivel. Inicie: npm run dev');
  }
  process.exit(1);
});
