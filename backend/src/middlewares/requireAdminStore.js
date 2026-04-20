import * as adminUserRepo from '../repositories/adminUserRepository.js';
import { AppError } from '../utils/AppError.js';

/**
 * Exige loja ativa para o admin: header X-Store-Id ou loja única vinculada.
 * Define req.storeId (number).
 */
export async function requireAdminStore(req, res, next) {
  try {
    const rawAdmin = req.admin?.sub ?? req.admin?.id;
    const adminId = rawAdmin != null ? Number(rawAdmin) : NaN;
    if (!Number.isFinite(adminId)) return next(new AppError(401, 'Não autenticado'));

    const raw = req.headers['x-store-id'];
    let storeId = raw != null && raw !== '' ? parseInt(String(raw), 10) : NaN;

    const stores = await adminUserRepo.listStoresForAdmin(adminId);
    if (!stores.length) return next(new AppError(403, 'Nenhuma loja vinculada ao usuário'));

    if (!Number.isFinite(storeId)) {
      if (stores.length === 1) {
        storeId = stores[0].id;
      } else {
        return next(new AppError(400, 'Informe a loja no cabeçalho X-Store-Id'));
      }
    }

    const ok = await adminUserRepo.adminHasStoreAccess(adminId, Number(storeId));
    if (!ok) return next(new AppError(403, 'Sem acesso a esta loja'));

    req.storeId = storeId;
    next();
  } catch (e) {
    next(e);
  }
}
