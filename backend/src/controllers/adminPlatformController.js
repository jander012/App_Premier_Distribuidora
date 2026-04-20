import bcrypt from 'bcryptjs';
import * as storeRepo from '../repositories/storeRepository.js';
import * as adminUserRepo from '../repositories/adminUserRepository.js';
import { AppError } from '../utils/AppError.js';

export async function listStores(req, res, next) {
  try {
    const rows = await storeRepo.listAllStoresAdmin();
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createStore(req, res, next) {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) throw new AppError(400, 'Nome da loja é obrigatório');
    const slugInput = req.body?.slug != null ? String(req.body.slug).trim() : '';
    const linkCurrentAdmin = req.body?.linkCurrentAdmin !== false;
    const store = await storeRepo.createStoreWithDefaults({ name, slug: slugInput || undefined });
    if (linkCurrentAdmin) {
      await adminUserRepo.linkAdminToStore(req.admin.sub, store.id);
    }
    res.status(201).json(store);
  } catch (e) {
    next(e);
  }
}

export async function listAdmins(req, res, next) {
  try {
    const rows = await adminUserRepo.listAdminsWithStores();
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createAdmin(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const storeIds = Array.isArray(req.body?.storeIds) ? req.body.storeIds.map(Number).filter(Number.isFinite) : [];
    const isSuperAdmin = Boolean(req.body?.isSuperAdmin);
    if (!email) throw new AppError(400, 'E-mail é obrigatório');
    if (password.length < 6) throw new AppError(400, 'Senha deve ter pelo menos 6 caracteres');
    const existing = await adminUserRepo.findAdminByEmail(email);
    if (existing) throw new AppError(409, 'E-mail já cadastrado');
    const passwordHash = await bcrypt.hash(password, 10);
    const admin = await adminUserRepo.createAdminUser({ email, passwordHash, isSuperAdmin });
    await adminUserRepo.setAdminStores(admin.id, storeIds);
    const [full] = await adminUserRepo.listAdminsWithStoresByIds([admin.id]);
    res.status(201).json(full);
  } catch (e) {
    next(e);
  }
}

export async function patchAdminStores(req, res, next) {
  try {
    const adminId = Number(req.params.id);
    if (!Number.isFinite(adminId)) throw new AppError(400, 'ID inválido');
    const storeIds = Array.isArray(req.body?.storeIds) ? req.body.storeIds.map(Number).filter(Number.isFinite) : [];
    const target = await adminUserRepo.findAdminById(adminId);
    if (!target) throw new AppError(404, 'Usuário não encontrado');
    await adminUserRepo.setAdminStores(adminId, storeIds);
    const [full] = await adminUserRepo.listAdminsWithStoresByIds([adminId]);
    res.json(full);
  } catch (e) {
    next(e);
  }
}
