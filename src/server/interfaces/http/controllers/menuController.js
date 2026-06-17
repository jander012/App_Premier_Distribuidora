import * as menuRepo from '../../../infrastructure/repositories/menuRepository.js';
import * as promoRepo from '../../../infrastructure/repositories/productPromotionRepository.js';
import * as storeRepo from '../../../infrastructure/repositories/storeRepository.js';
import { AppError } from '../../../domain/shared/AppError.js';

async function storeIdFromSlug(req) {
  const slug = String(req.query.storeSlug || 'principal').trim();
  const store = await storeRepo.findStoreBySlug(slug);
  if (!store) throw new AppError(404, 'Loja não encontrada');
  return store.id;
}

export async function listCategories(req, res, next) {
  try {
    const storeId = await storeIdFromSlug(req);
    const rows = await menuRepo.listCategories(storeId);
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function listProducts(req, res, next) {
  try {
    const storeId = await storeIdFromSlug(req);
    const raw = req.query.categoryId;
    const categoryId =
      raw !== undefined && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : undefined;
    const rawPage = req.query.page;
    const q = req.query.q != null && String(req.query.q).trim() ? String(req.query.q).trim() : undefined;
    if (rawPage !== undefined && rawPage !== '') {
      const page = Number(rawPage);
      const limit = Number(req.query.limit) || 24;
      const result = await menuRepo.listProductsPage(storeId, {
        page,
        limit,
        categoryId: q ? undefined : categoryId,
        q,
        availableOnly: true,
      });
      return res.json(result);
    }
    const rows = await menuRepo.listProducts({ storeId, categoryId, availableOnly: true });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function listBestSellers(req, res, next) {
  try {
    const storeId = await storeIdFromSlug(req);
    const limit = Number(req.query.limit) || 12;
    const rows = await menuRepo.listBestSellingProducts(storeId, { limit });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function listBuyAgain(req, res, next) {
  try {
    const storeId = await storeIdFromSlug(req);
    const limit = Number(req.query.limit) || 12;
    const rows = await menuRepo.listBuyAgainProducts(storeId, req.clientPhone, { limit });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function listPromotions(req, res, next) {
  try {
    const storeId = await storeIdFromSlug(req);
    const limit = Number(req.query.limit) || 12;
    const rows = await promoRepo.listActivePromotedProducts(storeId, { limit });
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function getProduct(req, res, next) {
  try {
    const storeId = await storeIdFromSlug(req);
    const id = Number(req.params.id);
    const p = await menuRepo.getProductWithOptions(id, storeId);
    if (!p) {
      return res.status(404).json({ error: 'Produto não encontrado' });
    }
    res.json(p);
  } catch (e) {
    next(e);
  }
}
