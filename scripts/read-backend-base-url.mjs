import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENV_PATH = path.join(__dirname, '..', 'backend', '.env');

/** Retorna a porta numérica ou null se não houver linha PORT. */
export function getPortFromBackendDotEnv() {
  try {
    const text = fs.readFileSync(ENV_PATH, 'utf8');
    const m = text.match(/^PORT\s*=\s*(\d+)/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** URL do backend: arquivo .env ou fallback 4020. */
export function getBackendBaseUrlFromDotEnv() {
  const p = getPortFromBackendDotEnv();
  return `http://127.0.0.1:${p || '4020'}`;
}
