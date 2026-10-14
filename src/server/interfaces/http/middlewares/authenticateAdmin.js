import jwt from 'jsonwebtoken';
import { env } from '../../../infrastructure/config/env.js';
import { AppError } from '../../../domain/shared/AppError.js';
import { SSO_MODULE, hasModule, panelUrl, ssoClient } from '../../../infrastructure/sso/ssoClient.js';

export async function authenticateAdmin(req, res, next) {
  const sso = ssoClient();
  if (sso) {
    const user = await sso.userFromRequest(req);
    if (!user) {
      return next(new AppError(401, 'Sessão expirada. Entre novamente.', { sso: sso.loginUrl(panelUrl(req)) }));
    }
    if (!hasModule(user, SSO_MODULE)) {
      return next(new AppError(403, 'Seu usuário não tem acesso ao painel do site.', { portal: sso.portalUrl() }));
    }
    // Lojas e super admin continuam vindo do banco (requireAdminStore / requireSuperAdmin).
    req.admin = { typ: 'admin', sub: user.id, email: user.email, super: user.isSuperAdmin, sso: true };
    return next();
  }

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
