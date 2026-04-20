import * as couponRepo from '../repositories/couponRepository.js';
import { AppError } from '../utils/AppError.js';

function roundMoney(v) {
  return Math.max(0, Math.round(Number(v) * 100) / 100);
}

/**
 * @param {{
 *   storeId: number,
 *   customerId: number,
 *   code: string,
 *   orderSubtotal: number,
 *   deliveryFee: number,
 * }} opts
 */
export async function validateCouponForCustomer(opts) {
  const { storeId, customerId, code, orderSubtotal, deliveryFee } = opts;
  const base = roundMoney(Number(orderSubtotal) + Number(deliveryFee));
  if (base <= 0) {
    throw new AppError(400, 'Valor do pedido inválido para aplicar cupom');
  }

  const coupon = await couponRepo.findActiveByCode(storeId, code);
  if (!coupon) {
    throw new AppError(400, 'Cupom inválido ou inativo');
  }

  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    throw new AppError(400, 'Cupom ainda não está válido');
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    throw new AppError(400, 'Cupom expirado');
  }

  if (coupon.max_uses_per_user != null) {
    const uses = await couponRepo.countUsesByCustomer(coupon.id, customerId);
    if (uses >= Number(coupon.max_uses_per_user)) {
      throw new AppError(400, 'Você já utilizou este cupom o número máximo de vezes');
    }
  }

  let discount = 0;
  const type = String(coupon.discount_type || '').toLowerCase();
  if (type === 'percent') {
    const p = Number(coupon.percent_value);
    if (!Number.isFinite(p) || p <= 0) {
      throw new AppError(400, 'Cupom mal configurado (percentual)');
    }
    discount = base * (p / 100);
    if (coupon.max_discount_per_order != null) {
      discount = Math.min(discount, Number(coupon.max_discount_per_order));
    }
  } else if (type === 'fixed') {
    discount = Number(coupon.fixed_amount ?? 0);
    if (!Number.isFinite(discount) || discount <= 0) {
      throw new AppError(400, 'Cupom mal configurado (valor fixo)');
    }
  } else {
    throw new AppError(400, 'Tipo de cupom inválido');
  }

  discount = Math.min(discount, base);
  discount = roundMoney(discount);

  if (coupon.max_total_discount_per_user != null) {
    const usedSum = await couponRepo.sumDiscountByCustomer(coupon.id, customerId);
    const cap = Number(coupon.max_total_discount_per_user);
    const remaining = roundMoney(cap - usedSum);
    if (remaining < discount) {
      discount = Math.max(0, remaining);
    }
    if (discount <= 0) {
      throw new AppError(400, 'Valor limite deste cupom para sua conta já foi atingido');
    }
  }

  return { couponId: coupon.id, discountAmount: discount };
}
