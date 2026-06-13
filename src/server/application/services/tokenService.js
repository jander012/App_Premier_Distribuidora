import jwt from 'jsonwebtoken';
import { env } from '../../infrastructure/config/env.js';
import { AppError } from '../../domain/shared/AppError.js';

export function signCartToken(cartId) {
  return jwt.sign({ typ: 'cart', cartId: String(cartId) }, env.jwtSecret, {
    expiresIn: env.cartJwtExpiresIn,
  });
}

export function signClientToken(phone) {
  return jwt.sign({ typ: 'client', phone }, env.jwtSecret, {
    expiresIn: env.clientJwtExpiresIn,
  });
}

export function verifyCartToken(token) {
  try {
    const p = jwt.verify(token, env.jwtSecret);
    if (p.typ !== 'cart' || !p.cartId) throw new Error('invalid');
    return String(p.cartId);
  } catch {
    throw new AppError(401, 'Token do carrinho inválido ou expirado');
  }
}

export function verifyClientToken(token) {
  try {
    const p = jwt.verify(token, env.jwtSecret);
    if (p.typ !== 'client' || !p.phone) throw new Error('invalid');
    return String(p.phone);
  } catch {
    throw new AppError(401, 'Sessão inválida ou expirada');
  }
}
