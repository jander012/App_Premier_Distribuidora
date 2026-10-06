import * as adminUserRepo from '../../../infrastructure/repositories/adminUserRepository.js';
import { AppError } from '../../../domain/shared/AppError.js';

/** Always re-reads the DB: a revoked super admin must lose access before the JWT expires. */
export async function requireSuperAdmin(req, res, next) {
  try {
    const sub = req.admin?.sub;
    if (sub == null) return next(new AppError(401, 'Token inválido'));
    const u = await adminUserRepo.findAdminById(sub);
    if (u?.is_super_admin) {
      req.admin.super = true;
      return next();
    }
    req.admin.super = false;
    return next(new AppError(403, 'Acesso restrito a super administradores'));
  } catch (e) {
    next(e);
  }
}
