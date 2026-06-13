import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultMediaDir = path.join(__dirname, '..', '..', 'uploads', 'media');

function parseDatabaseConfig() {
  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER;
  const database = process.env.DB_DATABASE;
  const defaultPort = (process.env.NODE_ENV || 'development') === 'production' ? 3306 : 3307;

  if (!host || !user || !database) {
    return null;
  }

  return {
    host,
    port: Number(process.env.DB_PORT) || defaultPort,
    user,
    password: process.env.DB_PASSWORD || '',
    database,
  };
}

/**
 * Proxy upstream: número de hops (ex.: 1) ou false.
 * Em produção atrás de proxy/reverse proxy, normalmente use 1.
 */
function parseTrustProxy() {
  const raw = process.env.TRUST_PROXY;
  if (raw === 'false' || raw === '0') return false;
  if (raw === undefined || raw === '') {
    return 1;
  }
  const n = Number(raw);
  if (!Number.isNaN(n) && n >= 0) return n;
  return 1;
}

function parseCorsOrigins() {
  return (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export const env = {
  /** Padrão 4020 para evitar conflito com outros serviços na 4000/4010. */
  port: Number(process.env.PORT) || 4020,
  nodeEnv: process.env.NODE_ENV || 'development',
  database: parseDatabaseConfig(),
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  clientJwtExpiresIn: process.env.CLIENT_JWT_EXPIRES_IN || '8h',
  cartJwtExpiresIn: process.env.CART_JWT_EXPIRES_IN || '7d',
  publicMenuUrl: process.env.PUBLIC_MENU_URL || 'http://localhost:3000',
  corsOrigins: parseCorsOrigins(),
  whatsappProvider: process.env.WHATSAPP_PROVIDER || 'stub',
  pixProvider: process.env.PIX_PROVIDER || 'stub',
  linxProvider: process.env.LINX_PROVIDER || 'stub',
  pickingoProvider: process.env.PICKINGO_PROVIDER || 'stub',
  linxIntegrationEnabled: process.env.LINX_INTEGRATION_ENABLED === 'true',
  pickingoIntegrationEnabled: process.env.PICKINGO_INTEGRATION_ENABLED === 'true',
  /** Obrigatório para POST /whatsapp/* e POST /payments/* (exceto fluxo interno via serviço). */
  internalApiKey: process.env.INTERNAL_API_KEY || '',
  /** Em development ou true, /auth/client/request-code retorna o código OTP na resposta. */
  otpDebugReturn: process.env.OTP_DEBUG_RETURN === 'true' || (process.env.NODE_ENV || 'development') === 'development',
  trustProxy: parseTrustProxy(),
  /** Diretório para imagens baixadas pela API (espelho de URLs remotas). */
  mediaUploadDir: process.env.MEDIA_UPLOAD_DIR
    ? path.resolve(process.env.MEDIA_UPLOAD_DIR)
    : defaultMediaDir,
  /** Base OSRM para /route/v1/driving/... (sem barra final). Produção: use instância própria. */
  osrmBaseUrl: (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/$/, ''),
  /**
   * Impressão térmica ESC/POS (rede). Ex.: tcp://192.168.0.50:9100
   * Vazio = apenas impressão pelo navegador no painel.
   */
  thermalPrinterInterface: (process.env.THERMAL_PRINTER_INTERFACE || '').trim(),
  /** epson | star | tanca | daruma | brother | custom */
  thermalPrinterType: (process.env.THERMAL_PRINTER_TYPE || 'epson').trim().toLowerCase(),
  /** Largura em caracteres (ex.: 48 para 80mm, 32 para 58mm). */
  thermalPrinterWidth: (() => {
    const n = Number(process.env.THERMAL_PRINTER_WIDTH);
    if (Number.isFinite(n) && n >= 24 && n <= 64) return Math.floor(n);
    return 48;
  })(),
};
