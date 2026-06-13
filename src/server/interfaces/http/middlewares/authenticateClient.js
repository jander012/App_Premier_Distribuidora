import { verifyClientToken } from '../../../application/services/tokenService.js';
import { AppError } from '../../../domain/shared/AppError.js';

export function authenticateClient(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Sessão do cliente ausente'));
  }
  const token = h.slice(7);
  try {
    req.clientPhone = verifyClientToken(token);
    next();
  } catch (e) {
    next(e);
  }
}
