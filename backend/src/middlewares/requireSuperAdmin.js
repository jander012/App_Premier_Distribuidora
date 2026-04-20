import * as adminUserRepo from '../repositories/adminUserRepository.js';
import { AppError } from '../utils/AppError.js';

export async function requireSuperAdmin(req, res, next) {
  try {
    const sub = req.admin?.sub;
    if (sub == null) return next(new AppError(401, 'Token inválido'));
    if (req.admin?.super === true) return next();
    const u = await adminUserRepo.findAdminById(sub);
    if (u?.is_super_admin) {
      req.admin.super = true;
      return next();
    }
    return next(new AppError(403, 'Acesso restrito a super administradores'));
  } catch (e) {
    next(e);
  }
}
