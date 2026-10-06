import * as cartRepo from '../../infrastructure/repositories/cartRepository.js';
import * as settingsRepo from '../../infrastructure/repositories/settingsRepository.js';
import * as deliveryPricingService from './deliveryPricingService.js';
import { AppError } from '../../domain/shared/AppError.js';

export async function getCartSummary(
  cartId,
  {
    distanceKm = null,
    deliveryLat = null,
    deliveryLng = null,
    /** Quando já calculado (ex.: pedido), evita segunda chamada ao OSRM */
    distanceResolution = null,
  } = {}
) {
  const cart = await cartRepo.getCart(cartId);
  if (!cart) throw new AppError(404, 'Carrinho não encontrado');
  const rows = await cartRepo.listCartItems(cartId);

  let storeId = cart.store_id;
  if (!storeId && rows.length) {
    storeId = rows[0].product_store_id;
  }
  // Pedidos são atendidos imediatamente: a janela de taxa é sempre a do horário do servidor.
  const at = new Date();

  let km =
    distanceKm != null && distanceKm !== '' && !Number.isNaN(Number(distanceKm))
      ? Number(String(distanceKm).replace(',', '.'))
      : null;
  let deliveryDistanceSource = 'none';
  let route = null;
  let routeError = null;

  if (distanceResolution && typeof distanceResolution === 'object') {
    km = distanceResolution.distanceKm;
    deliveryDistanceSource = distanceResolution.source || 'none';
    route = distanceResolution.route || null;
  } else if (storeId) {
    try {
      const resolved = await deliveryPricingService.resolveDeliveryDistanceKm(storeId, {
        manualKm: km,
        destLat: deliveryLat,
        destLng: deliveryLng,
      });
      km = resolved.distanceKm;
      deliveryDistanceSource = resolved.source;
      route = resolved.route || null;
    } catch (e) {
      km = null;
      deliveryDistanceSource = 'none';
      routeError = e?.message || 'Não foi possível calcular a rota.';
    }
  }

  let deliveryFee = 0;
  let deliveryRegion = null;
  let deliveryFeePending = false;
  if (storeId) {
    const config = await settingsRepo.getStoreConfig(storeId);
    const hasOrigin = deliveryPricingService.storeHasDeliveryOrigin(config);
    deliveryRegion = deliveryPricingService.formatPolygonZoneMatch(
      await deliveryPricingService.findPolygonZoneForPoint(storeId, deliveryLat, deliveryLng)
    );
    deliveryFeePending = hasOrigin && deliveryDistanceSource !== 'route' && !deliveryRegion;
    deliveryFee = deliveryFeePending
      ? 0
      : await deliveryPricingService.computeDeliveryFeeForStore(storeId, {
          distanceKm: km,
          at,
          destLat: deliveryLat,
          destLng: deliveryLng,
        });
  } else {
    const settings = await settingsRepo.getStoreConfig(1);
    deliveryFee = Number(settings?.delivery_fee ?? 0);
  }

  let subtotal = 0;
  const items = [];
  for (const row of rows) {
    const extras = await cartRepo.getOptionExtras(row.product_id, row.option_ids || []);
    const optSum = extras.reduce((s, o) => s + Number(o.price_extra), 0);
    const unit = Number(row.base_price) + optSum;
    const lineTotal = unit * row.quantity;
    subtotal += lineTotal;
    items.push({
      id: row.id,
      productId: row.product_id,
      name: row.product_name,
      description: row.product_description,
      imageUrl: row.product_image_url,
      quantity: row.quantity,
      note: row.note,
      optionIds: row.option_ids,
      options: extras,
      unitPrice: unit,
      lineTotal,
      available: row.available,
    });
  }

  return {
    cartId,
    storeId: storeId ?? null,
    items,
    subtotal,
    deliveryFee,
    total: Math.round((subtotal + deliveryFee) * 100) / 100,
    deliveryDistanceKm: km,
    deliveryDistanceSource,
    deliveryRegion,
    deliveryFeePending,
    deliveryRouteError: routeError,
    deliveryRoute: route
      ? {
          distanceKm: route.distanceKm,
          durationMinutes: Math.max(1, Math.round(route.durationSeconds / 60)),
          geometry: route.geometry,
        }
      : null,
  };
}

export async function createCart(customerId) {
  return cartRepo.createCart(customerId);
}

export const MAX_ITEM_QUANTITY = 999;

export function assertValidQuantity(q) {
  if (!Number.isInteger(q) || q < 1 || q > MAX_ITEM_QUANTITY) {
    throw new AppError(400, `Quantidade inválida (use um número inteiro entre 1 e ${MAX_ITEM_QUANTITY}).`);
  }
}

export async function addItem(cartId, body) {
  assertValidQuantity(body.quantity);
  const psid = await cartRepo.getProductStoreId(body.productId);
  if (!psid) throw new AppError(404, 'Produto não encontrado');
  const ageRestricted = await cartRepo.getProductAgeRestriction(body.productId, psid);
  if (ageRestricted && body.ageConfirmed !== true) {
    throw new AppError(403, 'Produto restrito para maiores de 18 anos.');
  }
  const cart = await cartRepo.getCart(cartId);
  if (!cart) throw new AppError(404, 'Carrinho não encontrado');
  if (cart.store_id != null && cart.store_id !== psid) {
    throw new AppError(
      400,
      'Este carrinho é de outra loja. Remova os itens ou finalize o pedido antes de adicionar produtos desta loja.'
    );
  }
  if (cart.store_id == null) {
    await cartRepo.setCartStoreId(cartId, psid);
  }
  return cartRepo.addCartItem({
    cartId,
    productId: body.productId,
    quantity: body.quantity,
    note: body.note,
    optionIds: body.optionIds,
  });
}

export async function updateItem(cartId, itemId, body) {
  if (body.quantity != null) assertValidQuantity(body.quantity);
  const row = await cartRepo.updateCartItem(cartId, itemId, body);
  if (!row) throw new AppError(404, 'Item do carrinho não encontrado');
  return row;
}

export async function removeItem(cartId, itemId) {
  const ok = await cartRepo.deleteCartItem(cartId, itemId);
  if (!ok) throw new AppError(404, 'Item do carrinho não encontrado');
}
