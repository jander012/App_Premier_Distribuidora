import * as couponRepo from '../../../infrastructure/repositories/couponRepository.js';
import { AppError } from '../../../domain/shared/AppError.js';

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function list(req, res, next) {
  try {
    const rows = await couponRepo.listByStore(req.storeId);
    res.json(
      rows.map((c) => ({
        id: c.id,
        code: c.code,
        active: c.active,
        discountType: c.discount_type,
        percentValue: c.percent_value != null ? Number(c.percent_value) : null,
        maxDiscountPerOrder: c.max_discount_per_order != null ? Number(c.max_discount_per_order) : null,
        fixedAmount: c.fixed_amount != null ? Number(c.fixed_amount) : null,
        maxUsesPerUser: c.max_uses_per_user != null ? Number(c.max_uses_per_user) : null,
        maxTotalDiscountPerUser:
          c.max_total_discount_per_user != null ? Number(c.max_total_discount_per_user) : null,
        validFrom: c.valid_from,
        validUntil: c.valid_until,
        createdAt: c.created_at,
      }))
    );
  } catch (e) {
    next(e);
  }
}

export async function create(req, res, next) {
  try {
    const b = req.body || {};
    const type = String(b.discountType || b.discount_type || '').toLowerCase();
    if (type !== 'percent' && type !== 'fixed') {
      throw new AppError(400, 'discountType deve ser percent ou fixed');
    }
    if (!b.code || !String(b.code).trim()) {
      throw new AppError(400, 'Informe o código do cupom');
    }
    const row = await couponRepo.insertCoupon(req.storeId, {
      code: String(b.code).trim(),
      active: b.active !== false,
      discount_type: type,
      percent_value: type === 'percent' ? numOrNull(b.percentValue ?? b.percent_value) : null,
      max_discount_per_order: numOrNull(b.maxDiscountPerOrder ?? b.max_discount_per_order),
      fixed_amount: type === 'fixed' ? numOrNull(b.fixedAmount ?? b.fixed_amount) : null,
      max_uses_per_user: b.maxUsesPerUser != null ? Number(b.maxUsesPerUser) : null,
      max_total_discount_per_user: numOrNull(b.maxTotalDiscountPerUser ?? b.max_total_discount_per_user),
      valid_from: b.validFrom || b.valid_from || null,
      valid_until: b.validUntil || b.valid_until || null,
    });
    res.status(201).json({ id: row.id, code: row.code });
  } catch (e) {
    if (e.code === '23505') {
      next(new AppError(400, 'Já existe cupom com este código nesta loja'));
      return;
    }
    next(e);
  }
}

export async function patch(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new AppError(400, 'ID inválido');
    const b = req.body || {};
    const patch = {};
    if (b.code !== undefined) patch.code = String(b.code).trim();
    if (b.active !== undefined) patch.active = Boolean(b.active);
    if (b.discountType !== undefined || b.discount_type !== undefined) {
      const t = String(b.discountType || b.discount_type).toLowerCase();
      if (t !== 'percent' && t !== 'fixed') throw new AppError(400, 'discountType inválido');
      patch.discount_type = t;
    }
    if (b.percentValue !== undefined || b.percent_value !== undefined) {
      patch.percent_value = numOrNull(b.percentValue ?? b.percent_value);
    }
    if (b.maxDiscountPerOrder !== undefined || b.max_discount_per_order !== undefined) {
      patch.max_discount_per_order = numOrNull(b.maxDiscountPerOrder ?? b.max_discount_per_order);
    }
    if (b.fixedAmount !== undefined || b.fixed_amount !== undefined) {
      patch.fixed_amount = numOrNull(b.fixedAmount ?? b.fixed_amount);
    }
    if (b.maxUsesPerUser !== undefined || b.max_uses_per_user !== undefined) {
      patch.max_uses_per_user = b.maxUsesPerUser != null ? Number(b.maxUsesPerUser) : null;
    }
    if (b.maxTotalDiscountPerUser !== undefined || b.max_total_discount_per_user !== undefined) {
      patch.max_total_discount_per_user = numOrNull(
        b.maxTotalDiscountPerUser ?? b.max_total_discount_per_user
      );
    }
    if (b.validFrom !== undefined || b.valid_from !== undefined) {
      patch.valid_from = b.validFrom ?? b.valid_from ?? null;
    }
    if (b.validUntil !== undefined || b.valid_until !== undefined) {
      patch.valid_until = b.validUntil ?? b.valid_until ?? null;
    }
    const row = await couponRepo.updateCoupon(id, req.storeId, patch);
    if (!row) throw new AppError(404, 'Cupom não encontrado');
    res.json({ ok: true });
  } catch (e) {
    if (e.code === '23505') {
      next(new AppError(400, 'Já existe cupom com este código nesta loja'));
      return;
    }
    next(e);
  }
}

export async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new AppError(400, 'ID inválido');
    const ok = await couponRepo.deleteCoupon(id, req.storeId);
    if (!ok) throw new AppError(404, 'Cupom não encontrado');
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}
