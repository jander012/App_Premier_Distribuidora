import * as cartService from '../services/cartService.js';
import * as tokenService from '../services/tokenService.js';

export async function createCart(req, res, next) {
  try {
    const customerId = req.body.customerId ? Number(req.body.customerId) : null;
    const cart = await cartService.createCart(customerId);
    const accessToken = tokenService.signCartToken(cart.id);
    res.status(201).json({ id: cart.id, accessToken });
  } catch (e) {
    next(e);
  }
}

export async function getCartMe(req, res, next) {
  try {
    const rawKm = req.query.distanceKm;
    const distanceKm =
      rawKm !== undefined && rawKm !== null && String(rawKm).trim() !== ''
        ? Number(String(rawKm).replace(',', '.'))
        : null;
    const rawLa = req.query.destLat ?? req.query.deliveryLat;
    const rawLn = req.query.destLng ?? req.query.deliveryLng;
    const destLat =
      rawLa !== undefined && rawLa !== null && String(rawLa).trim() !== ''
        ? Number(String(rawLa).replace(',', '.'))
        : null;
    const destLng =
      rawLn !== undefined && rawLn !== null && String(rawLn).trim() !== ''
        ? Number(String(rawLn).replace(',', '.'))
        : null;
    const deliveryAt = req.query.deliveryAt || req.query.delivery_at || null;
    const summary = await cartService.getCartSummary(req.cartId, {
      distanceKm: distanceKm != null && !Number.isNaN(distanceKm) ? distanceKm : null,
      deliveryLat: destLat != null && !Number.isNaN(destLat) ? destLat : null,
      deliveryLng: destLng != null && !Number.isNaN(destLng) ? destLng : null,
      deliveryAt,
    });
    res.json(summary);
  } catch (e) {
    next(e);
  }
}

export async function addItem(req, res, next) {
  try {
    const row = await cartService.addItem(req.cartId, {
      productId: Number(req.body.productId),
      quantity: Number(req.body.quantity),
      note: req.body.note,
      optionIds: Array.isArray(req.body.optionIds) ? req.body.optionIds.map(Number) : [],
    });
    res.status(201).json(row);
  } catch (e) {
    next(e);
  }
}

export async function updateItem(req, res, next) {
  try {
    const row = await cartService.updateItem(req.cartId, Number(req.params.id), {
      quantity: req.body.quantity != null ? Number(req.body.quantity) : null,
      note: req.body.note,
      optionIds: req.body.optionIds != null ? req.body.optionIds.map(Number) : null,
    });
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function deleteItem(req, res, next) {
  try {
    await cartService.removeItem(req.cartId, Number(req.params.id));
    res.status(204).send();
  } catch (e) {
    next(e);
  }
}
