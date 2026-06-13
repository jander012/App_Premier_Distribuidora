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
    req.admin = jwt.verify(token, env.jwtSecret);
    next();
  } catch {
    next(new AppError(401, 'Token inválido'));
  }
}
