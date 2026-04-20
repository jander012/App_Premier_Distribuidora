/**
 * Testa se o dev server Vite repassa /api → backend (precisa Vite + backend no ar).
 * Uso: npm run smoke:proxy (na pasta backend)
 */
import { getBackendBaseUrlFromDotEnv } from './read-backend-base-url.mjs';

const vite = 'http://127.0.0.1:5173';
const backend = getBackendBaseUrlFromDotEnv();

async function main() {
  console.log('Proxy test: GET', `${vite}/api/stores`, '→ esperado mesmo JSON que', `${backend}/stores\n`);

  const direct = await fetch(`${backend}/stores`);
  const proxy = await fetch(`${vite}/api/stores`);

  const dText = await direct.text();
  const pText = await proxy.text();

  console.log('Direto backend →', direct.status, dText.slice(0, 100));
  console.log('Via Vite /api →', proxy.status, pText.slice(0, 100));

  if (!proxy.ok) {
    console.error('\nFalha no proxy. Suba o frontend: cd frontend && npm run dev');
    process.exit(1);
  }
  if (dText !== pText) {
    console.warn('\nAviso: corpo direto vs proxy diferem (compare manualmente).');
  }
  console.log('\nProxy OK.');
}

main().catch((e) => {
  console.error(e.message || e);
  if (e.cause?.code === 'ECONNREFUSED' || e.code === 'ECONNREFUSED') {
    console.error('\nVite (5173) ou backend inacessível. Suba ambos.');
  }
  process.exit(1);
});
