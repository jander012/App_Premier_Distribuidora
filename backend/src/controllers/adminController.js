import * as adminAuth from '../services/adminAuthService.js';
import { AppError } from '../utils/AppError.js';
import * as orderRepo from '../repositories/orderRepository.js';
import * as customerRepo from '../repositories/customerRepository.js';
import * as menuRepo from '../repositories/menuRepository.js';
import * as settingsRepo from '../repositories/settingsRepository.js';
import * as orderService from '../services/orderService.js';
import * as thermalReceiptService from '../services/thermalReceiptService.js';
import { formatOrder, formatItem } from './orderController.js';

export async function login(req, res, next) {
  try {
    const email = req.body?.email;
    const password = req.body?.password;
    if (email == null || String(email).trim() === '') {
      return next(new AppError(400, 'Informe o e-mail.'));
    }
    if (password == null || String(password) === '') {
      return next(new AppError(400, 'Informe a senha.'));
    }
    const { token, admin, stores } = await adminAuth.login(email, password);
    res.json({ token, admin, stores });
  } catch (e) {
    next(e);
  }
}

export async function getMe(req, res, next) {
  try {
    const raw = req.admin?.sub ?? req.admin?.id;
    const adminId = Number(raw);
    if (!Number.isFinite(adminId)) return next(new AppError(401, 'Token inválido'));
    const session = await adminAuth.getSessionForAdminId(adminId);
    res.json(session);
  } catch (e) {
    next(e);
  }
}

export async function getOrderAdmin(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return next(new AppError(400, 'ID inválido'));
    const { order, items } = await orderService.getOrderForAdmin(id, req.storeId);
    res.json({ order: formatOrder(order), items: items.map(formatItem) });
  } catch (e) {
    next(e);
  }
}

export async function printOrderThermal(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return next(new AppError(400, 'ID inválido'));
    const { order, items } = await orderService.getOrderForAdmin(id, req.storeId);
    await thermalReceiptService.printOrderThermalReceipt(order, items);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function listOrders(req, res, next) {
  try {
    const storeId = req.storeId;
    const status = req.query.status || undefined;
    const phone = req.query.phone || undefined;
    const orderId = req.query.orderId ? Number(req.query.orderId) : undefined;
    const fromDate = req.query.from || undefined;
    const toDate = req.query.to || undefined;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const page = Math.max(Number(req.query.page) || 1, 1);
    const offset = (page - 1) * limit;

    const filters = {
      storeId,
      status,
      phone,
      orderId: Number.isFinite(orderId) ? orderId : undefined,
      fromDate,
      toDate,
      limit,
      offset,
    };
    const countFilters = {
      storeId,
      status,
      phone,
      orderId: Number.isFinite(orderId) ? orderId : undefined,
      fromDate,
      toDate,
    };

    const [items, total] = await Promise.all([
      orderRepo.listOrdersAdmin(filters),
      orderRepo.countOrdersAdmin(countFilters),
    ]);

    res.json({
      items,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit) || 1),
    });
  } catch (e) {
    next(e);
  }
}

export async function listCustomers(req, res, next) {
  try {
    const rows = await customerRepo.listCustomersForAdminByStore(req.storeId, 200, 0);
    res.json(rows);
  } catch (e) {
    next(e);
  }
}

export async function createProduct(req, res, next) {
  try {
    const p = await menuRepo.adminCreateProduct({
      categoryId: Number(req.body.categoryId),
      name: req.body.name,
      description: req.body.description,
      price: Number(req.body.price),
      imageUrl: req.body.imageUrl,
      available: req.body.available,
      storeId: req.storeId,
    });
    res.status(201).json(p);
  } catch (e) {
    next(e);
  }
}

export async function updateProduct(req, res, next) {
  try {
    const id = Number(req.params.id);
    const body = {
      categoryId: req.body.categoryId != null ? Number(req.body.categoryId) : null,
      name: req.body.name ?? null,
      description: req.body.description ?? null,
      price: req.body.price != null ? Number(req.body.price) : null,
      available: req.body.available ?? null,
    };
    if ('imageUrl' in req.body) {
      body.imageUrl = req.body.imageUrl;
    }
    const p = await menuRepo.adminUpdateProduct(id, req.storeId, body);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(p);
  } catch (e) {
    next(e);
  }
}

export async function patchAvailability(req, res, next) {
  try {
    const id = Number(req.params.id);
    const p = await menuRepo.adminSetAvailability(id, req.storeId, Boolean(req.body.available));
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(p);
  } catch (e) {
    next(e);
  }
}

export async function deleteProduct(req, res, next) {
  try {
    const ok = await menuRepo.adminDeleteProduct(Number(req.params.id), req.storeId);
    if (!ok) return res.status(404).json({ error: 'Produto não encontrado' });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

export async function patchOrderStatus(req, res, next) {
  try {
    const order = await orderService.updateStatus(Number(req.params.id), req.body.status, {
      notify: req.body.notify !== false,
      storeId: req.storeId,
    });
    res.json(order);
  } catch (e) {
    next(e);
  }
}

export async function getSettings(req, res, next) {
  try {
    const s = await settingsRepo.getStoreConfig(req.storeId);
    res.json(s);
  } catch (e) {
    next(e);
  }
}

export async function putSettings(req, res, next) {
  try {
    const s = await settingsRepo.updateStoreConfig(req.storeId, req.body);
    res.json(s);
  } catch (e) {
    next(e);
  }
}

export async function listCategoriesAdmin(req, res, next) {
  try {
    res.json(await menuRepo.adminListCategories(req.storeId));
  } catch (e) {
    next(e);
  }
}

export async function createCategory(req, res, next) {
  try {
    const row = await menuRepo.adminCreateCategory({
      name: req.body.name,
      sortOrder: req.body.sortOrder != null ? Number(req.body.sortOrder) : 0,
      active: req.body.active,
      storeId: req.storeId,
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function updateCategory(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const patch = {};
    if (req.body.name !== undefined) {
      const t = String(req.body.name).trim();
      if (!t) return res.status(400).json({ error: 'Nome inválido' });
      patch.name = t;
    }
    if (req.body.sortOrder !== undefined) patch.sortOrder = Number(req.body.sortOrder);
    if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
    const row = await menuRepo.adminUpdateCategory(id, req.storeId, patch);
    if (!row) return res.status(404).json({ error: 'Categoria não encontrada' });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteCategory(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'ID inválido' });
    const result = await menuRepo.adminDeleteCategory(id, req.storeId);
    if (!result.ok && result.reason === 'has_products') {
      return res.status(409).json({
        error: `Existem ${result.productCount} produto(s) nesta categoria. Reatribua ou exclua os produtos antes.`,
      });
    }
    if (!result.ok) return res.status(404).json({ error: 'Categoria não encontrada' });
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}

export async function listProductsAdmin(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;
    const q = req.query.q || undefined;
    const data = await menuRepo.adminListProductsPage(req.storeId, { page, limit, q });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function getProductAdmin(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const p = await menuRepo.adminGetProductById(id, req.storeId);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(p);
  } catch (e) {
    next(e);
  }
}
