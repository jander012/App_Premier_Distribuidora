import * as menuRepo from '../repositories/menuRepository.js';
import * as storeRepo from '../repositories/storeRepository.js';
import { AppError } from '../utils/AppError.js';

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
    const rows = await menuRepo.listProducts({ storeId, categoryId, availableOnly: true });
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
