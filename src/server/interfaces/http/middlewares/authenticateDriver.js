import { verifyDriverToken } from '../../../application/services/tokenService.js';
import { AppError } from '../../../domain/shared/AppError.js';

export function authenticateDriver(req, _res, next) {
  const auth = req.headers.authorization || '';
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  if (!m) return next(new AppError(401, 'Sessão do entregador ausente'));
  try {
    const session = verifyDriverToken(m[1]);
    req.driverId = session.driverId;
    req.storeId = session.storeId;
    next();
  } catch (e) {
    next(e);
  }
}
