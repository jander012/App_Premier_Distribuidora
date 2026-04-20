/**
 * Verifica health, /stores, login e /admin/me.
 * Ordem da porta: --port= → backend/.env → API_PORT → 4010
 *
 * Uso: cd backend && npm run smoke
 */
import { getPortFromBackendDotEnv } from './read-backend-base-url.mjs';

function resolveBase() {
  const arg = process.argv.find((a) => a.startsWith('--port='))?.split('=')[1]?.trim();
  if (arg && /^\d+$/.test(arg)) {
    return `http://127.0.0.1:${arg}`;
  }
  const fromFile = getPortFromBackendDotEnv();
  if (fromFile) {
    return `http://127.0.0.1:${fromFile}`;
  }
  const ap = process.env.API_PORT;
  if (ap != null && String(ap).trim() !== '' && /^\d+$/.test(String(ap).trim())) {
    return `http://127.0.0.1:${String(ap).trim()}`;
  }
  return 'http://127.0.0.1:4020';
}

async function main() {
  const base = resolveBase();
  const port = new URL(base).port || '80';
  console.log('Alvo:', base, '\n');

  const health = await fetch(`${base}/health`);
  const healthText = await health.text();
  console.log(`GET  ${base}/health →`, health.status, healthText.slice(0, 80));

  const stores = await fetch(`${base}/stores`);
  const storesText = await stores.text();
  console.log(`GET  ${base}/stores →`, stores.status, storesText.slice(0, 160));
  if (!stores.ok) {
    console.error(`\nFalha em /stores (porta ${port}).`);
    if (storesText.includes('Cannot GET')) {
      console.error(
        'Esta porta parece ser de OUTRO app (Express genérico), não da API delivery.\n' +
          'Soluções: encerre o processo na porta ' +
          port +
          ', ou defina outra PORT em backend/.env (ex.: 4020) e reinicie o backend;\n' +
          'teste com: npm run smoke -- --port=4020'
      );
    } else {
      console.error('Suba o backend: cd backend && npm run dev');
    }
    process.exit(1);
  }

  const login = await fetch(`${base}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@delivery.local', password: 'admin123' }),
  });
  const loginText = await login.text();
  console.log(`POST ${base}/admin/login →`, login.status, loginText.slice(0, 180));
  if (!login.ok) {
    console.error('\nLogin falhou (migrações/seed/credenciais?).');
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
    console.log(`GET  ${base}/admin/me →`, me.status, meText.slice(0, 120));
    if (!me.ok) process.exit(1);
  }

  console.log('\nSmoke OK.');
}

main().catch((e) => {
  console.error(e.message || e);
  if (e.cause?.code === 'ECONNREFUSED' || e.code === 'ECONNREFUSED') {
    console.error('\nBackend inacessível. Inicie: cd backend && npm run dev');
  }
  process.exit(1);
});
