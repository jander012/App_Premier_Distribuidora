import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

const MIN_KEY_LEN = 24;

/**
 * Bloqueia chamadas externas não autorizadas a rotas de integração (WhatsApp/PIX HTTP).
 * Configure INTERNAL_API_KEY e envie header X-Internal-Key com o mesmo valor.
 */
export function requireInternalApiKey(req, res, next) {
  const key = env.internalApiKey;
  if (!key || key.length < MIN_KEY_LEN) {
    return next(new AppError(403, 'Integração interna desativada ou mal configurada'));
  }
  const sent = req.headers['x-internal-key'];
  if (!sent || typeof sent !== 'string' || sent !== key) {
    return next(new AppError(403, 'Acesso negado'));
  }
  next();
}
