import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../infrastructure/config/env.js';
import { AppError } from '../../domain/shared/AppError.js';

const VERIFY_OPTS = { algorithms: ['HS256'] };

/** Short fingerprint of the stored password hash: changing the password invalidates issued tokens. */
export function passwordVersion(passwordHash) {
  return crypto.createHash('sha256').update(String(passwordHash || '')).digest('hex').slice(0, 16);
}

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

export function signDriverToken(driverId, storeId, passwordHash) {
  return jwt.sign(
    {
      typ: 'driver',
      driverId: Number(driverId),
      storeId: Number(storeId),
      pwv: passwordVersion(passwordHash),
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

export function verifyCartToken(token) {
  try {
    const p = jwt.verify(token, env.jwtSecret, VERIFY_OPTS);
    if (p.typ !== 'cart' || !p.cartId) throw new Error('invalid');
    return String(p.cartId);
  } catch {
    throw new AppError(401, 'Token do carrinho inválido ou expirado');
  }
}

export function verifyClientToken(token) {
  try {
    const p = jwt.verify(token, env.jwtSecret, VERIFY_OPTS);
    if (p.typ !== 'client' || !p.phone) throw new Error('invalid');
    return String(p.phone);
  } catch {
    throw new AppError(401, 'Sessão inválida ou expirada');
  }
}

export function verifyDriverToken(token) {
  try {
    const p = jwt.verify(token, env.jwtSecret, VERIFY_OPTS);
    if (p.typ !== 'driver' || !p.driverId || !p.storeId) throw new Error('invalid');
    return { driverId: Number(p.driverId), storeId: Number(p.storeId), pwv: p.pwv ? String(p.pwv) : null };
  } catch {
    throw new AppError(401, 'Sessão do entregador inválida ou expirada');
  }
}
