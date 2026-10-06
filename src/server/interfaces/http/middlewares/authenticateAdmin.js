import jwt from 'jsonwebtoken';
import { env } from '../../../infrastructure/config/env.js';
import { AppError } from '../../../domain/shared/AppError.js';

export function authenticateAdmin(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) {
    return next(new AppError(401, 'Token ausente'));
  }
  const token = h.slice(7);
  try {
    const payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    // Tokens issued before `typ` existed have none; cart/client/driver tokens must never pass as admin.
    if ((payload.typ != null && payload.typ !== 'admin') || payload.sub == null) throw new Error('invalid');
    req.admin = payload;
    next();
  } catch {
    next(new AppError(401, 'Token inválido'));
  }
}
