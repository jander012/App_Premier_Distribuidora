import * as promoRepo from '../../../infrastructure/repositories/productPromotionRepository.js';
import { AppError } from '../../../domain/shared/AppError.js';

function dateOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  return v;
}

function numOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function list(req, res, next) {
  try {
    const rows = await promoRepo.listByStore(req.storeId);
    res.json(
      rows.map((r) => ({
        id: r.id,
        productId: r.product_id,
        productName: r.product_name,
        productPrice: r.product_price != null ? Number(r.product_price) : null,
        productAvailable: Boolean(r.product_available),
        productImageUrl: r.product_image_url,
        sortOrder: Number(r.sort_order) || 0,
        active: Boolean(r.active),
        validFrom: r.valid_from,
        validUntil: r.valid_until,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }))
    );
  } catch (e) {
    next(e);
  }
}

export async function create(req, res, next) {
  try {
    const b = req.body || {};
    const productId = Number(b.productId ?? b.product_id);
    if (!Number.isFinite(productId)) throw new AppError(400, 'Informe o produto');
    const row = await promoRepo.insertPromotion(req.storeId, {
      product_id: productId,
      sort_order: numOrNull(b.sortOrder ?? b.sort_order) ?? 0,
      active: b.active !== false,
      valid_from: dateOrNull(b.validFrom ?? b.valid_from),
      valid_until: dateOrNull(b.validUntil ?? b.valid_until),
    });
    res.status(201).json({ id: row.id });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      next(new AppError(400, 'Este produto já está em destaque/promoção'));
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
    if (b.productId !== undefined || b.product_id !== undefined) {
      const productId = Number(b.productId ?? b.product_id);
      if (!Number.isFinite(productId)) throw new AppError(400, 'Produto inválido');
      patch.product_id = productId;
    }
    if (b.sortOrder !== undefined || b.sort_order !== undefined) {
      patch.sort_order = numOrNull(b.sortOrder ?? b.sort_order) ?? 0;
    }
    if (b.active !== undefined) patch.active = Boolean(b.active);
    if (b.validFrom !== undefined || b.valid_from !== undefined) {
      patch.valid_from = dateOrNull(b.validFrom ?? b.valid_from);
    }
    if (b.validUntil !== undefined || b.valid_until !== undefined) {
      patch.valid_until = dateOrNull(b.validUntil ?? b.valid_until);
    }
    const row = await promoRepo.updatePromotion(id, req.storeId, patch);
    if (!row) throw new AppError(404, 'Promoção não encontrada');
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') {
      next(new AppError(400, 'Este produto já está em destaque/promoção'));
      return;
    }
    next(e);
  }
}

export async function remove(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) throw new AppError(400, 'ID inválido');
    const ok = await promoRepo.deletePromotion(id, req.storeId);
    if (!ok) throw new AppError(404, 'Promoção não encontrada');
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}
