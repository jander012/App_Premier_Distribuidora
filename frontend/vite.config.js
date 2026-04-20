import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function portFromBackendDotEnv() {
  const envPath = path.join(__dirname, '..', 'backend', '.env');
  try {
    const text = fs.readFileSync(envPath, 'utf8');
    const m = text.match(/^PORT\s*=\s*(\d+)/m);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function defaultProxyTarget() {
  const p = portFromBackendDotEnv();
  return `http://127.0.0.1:${p || '4020'}`;
}

function apiProxyTarget(mode, cwd) {
  const e = loadEnv(mode, cwd, '');
  const raw = (e.VITE_API_PROXY_TARGET || defaultProxyTarget()).trim().replace(/\/$/, '');
  return raw;
}

const apiProxy = (target) => ({
  '/api': {
    target,
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, ''),
    configure(proxy) {
      proxy.on('error', (err) => {
        console.error(
          '[vite proxy]',
          err.message,
          `→ esperando API em ${target} (PORT em backend/.env)`
        );
      });
    },
  },
});

export default defineConfig(({ mode }) => {
  const target = apiProxyTarget(mode, process.cwd());
  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: apiProxy(target),
    },
    preview: {
      port: 4173,
      proxy: apiProxy(target),
    },
  };
});
