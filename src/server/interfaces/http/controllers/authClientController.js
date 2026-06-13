import { normalizePhone } from '../../../domain/shared/phone.js';
import { AppError } from '../../../domain/shared/AppError.js';
import * as otpService from '../../../application/services/clientOtpService.js';
import * as tokenService from '../../../application/services/tokenService.js';
import { env } from '../../../infrastructure/config/env.js';

export async function requestCode(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) throw new AppError(400, 'Telefone inválido');
    const code = otpService.createAndStoreOtp(phone);
    const payload = { ok: true, message: 'Código enviado (use o canal configurado na loja).' };
    if (env.otpDebugReturn) {
      payload.debugCode = code;
    }
    // eslint-disable-next-line no-console
    console.log(`[OTP ${phone}] código: ${code}`);
    res.json(payload);
  } catch (e) {
    next(e);
  }
}

export async function verifyCode(req, res, next) {
  try {
    const phone = normalizePhone(req.body.phone);
    if (!phone) throw new AppError(400, 'Telefone inválido');
    const ok = otpService.verifyOtp(phone, req.body.code);
    if (!ok) throw new AppError(400, 'Código inválido ou expirado');
    const clientToken = tokenService.signClientToken(phone);
    res.json({ ok: true, clientToken });
  } catch (e) {
    next(e);
  }
}
