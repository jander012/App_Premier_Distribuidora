import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import * as repo from '../../infrastructure/repositories/adminUserRepository.js';
import { env } from '../../infrastructure/config/env.js';
import { AppError } from '../../domain/shared/AppError.js';
import { sendAdminAccessCode } from '../../infrastructure/integrations/email/smtpProvider.js';

function normalizeAdminEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase();
}

function buildSessionToken(user) {
  const isSuperAdmin = Boolean(user.is_super_admin);
  return jwt.sign(
    { sub: user.id, email: user.email, super: isSuperAdmin },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn }
  );
}

async function buildLoginResponse(user) {
  const isSuperAdmin = Boolean(user.is_super_admin);
  const token = buildSessionToken(user);
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
      name: user.name || '',
      email: user.email,
      isSuperAdmin,
    },
    stores: safeStores,
  };
}

function generateNumericCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export async function requestAccessCode(email) {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) throw new AppError(400, 'Informe o e-mail.');

  const user = await repo.findAdminByEmail(normalized);
  if (!user) {
    return { ok: true };
  }

  const code = generateNumericCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + env.adminOtpExpiresMinutes * 60 * 1000);

  await repo.createAdminLoginCode({ adminUserId: user.id, codeHash, expiresAt });
  await sendAdminAccessCode({ to: user.email, name: user.name, code });

  return env.adminOtpDebugReturn ? { ok: true, code } : { ok: true };
}

export async function login(email, code) {
  const normalized = normalizeAdminEmail(email);
  const user = await repo.findAdminByEmail(normalized);
  if (!user) throw new AppError(401, 'Código inválido ou expirado');

  const loginCode = await repo.findLatestActiveAdminLoginCode(user.id);
  if (!loginCode || Number(loginCode.attempts) >= 5) {
    throw new AppError(401, 'Código inválido ou expirado');
  }

  let ok = false;
  try {
    ok = await bcrypt.compare(String(code ?? '').trim(), loginCode.code_hash);
  } catch {
    ok = false;
  }

  if (!ok) {
    await repo.incrementAdminLoginCodeAttempts(loginCode.id);
    throw new AppError(401, 'Código inválido ou expirado');
  }

  await repo.consumeAdminLoginCode(loginCode.id);
  return buildLoginResponse(user);
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
      name: user.name || '',
      email: user.email,
      isSuperAdmin,
    },
    stores: safeStores,
  };
}
