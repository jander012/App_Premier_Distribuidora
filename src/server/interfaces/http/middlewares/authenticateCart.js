import { verifyCartToken } from '../../../application/services/tokenService.js';
import { AppError } from '../../../domain/shared/AppError.js';

export function authenticateCart(req, res, next) {
  let raw = req.headers['x-cart-token'];
  if (Array.isArray(raw)) {
    raw = raw.find((x) => typeof x === 'string' && x.trim() !== '') || raw[0];
  }
  if (!raw || typeof raw !== 'string') {
    return next(new AppError(401, 'Token do carrinho ausente'));
  }
  try {
    req.cartId = verifyCartToken(raw.trim());
    next();
  } catch (e) {
    next(e);
  }
}
