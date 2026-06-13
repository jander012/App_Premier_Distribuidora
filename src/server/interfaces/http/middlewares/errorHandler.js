import { AppError } from '../../../domain/shared/AppError.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = err.statusCode || 500;
  const body = {
    error: err.message || 'Erro interno',
    ...(err.details ? { details: err.details } : {}),
  };
  if (status >= 500 && process.env.NODE_ENV !== 'development') {
    body.error = 'Erro interno';
  }
  // eslint-disable-next-line no-console
  if (status >= 500) console.error(err);
  res.status(status).json(body);
}
