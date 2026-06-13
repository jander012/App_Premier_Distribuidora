import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as repo from '../../infrastructure/repositories/adminUserRepository.js';
import { env } from '../../infrastructure/config/env.js';
import { AppError } from '../../domain/shared/AppError.js';

function normalizeAdminEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

export async function login(email, password) {
  const normalized = normalizeAdminEmail(email);
  const user = await repo.findAdminByEmail(normalized);
  if (!user) throw new AppError(401, 'Credenciais inválidas');
  let ok = false;
  try {
    ok = await bcrypt.compare(String(password ?? ''), user.password_hash);
  } catch {
    ok = false;
  }
  if (!ok) throw new AppError(401, 'Credenciais inválidas');
  const isSuperAdmin = Boolean(user.is_super_admin);
  const token = jwt.sign(
    { sub: user.id, email: user.email, super: isSuperAdmin },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
  const stores = await repo.listStoresForAdmin(user.id);
  const safeStores = (stores || []).map((s) => ({
    id: Number(s.id),
    name: s.name,
    slug: s.slug,
    active: s.active !== false,
  }));
  return {
    token,
    admin: {
      id: Number(user.id),
      email: user.email,
      isSuperAdmin,
    },
    stores: safeStores,
  };
}

/** Sessão atual (sem X-Store-Id): reidrata lojas e perfil após novo token/aba. */
export async function getSessionForAdminId(adminId) {
  const user = await repo.findAdminById(adminId);
  if (!user) throw new AppError(401, 'Token inválido');
  const stores = await repo.listStoresForAdmin(user.id);
  const isSuperAdmin = Boolean(user.is_super_admin);
  const safeStores = (stores || []).map((s) => ({
    id: Number(s.id),
    name: s.name,
    slug: s.slug,
    active: s.active !== false,
  }));
  return {
    admin: {
      id: Number(user.id),
      email: user.email,
      isSuperAdmin,
    },
    stores: safeStores,
  };
}
