import { NextResponse } from 'next/server';
import { openApiSpec } from '../../../server/interfaces/docs/openapi.js';
import { authenticateAdmin } from '../../../server/interfaces/http/middlewares/authenticateAdmin.js';
import { requireAdminStore } from '../../../server/interfaces/http/middlewares/requireAdminStore.js';
import { authenticateClient } from '../../../server/interfaces/http/middlewares/authenticateClient.js';
import { authenticateCart } from '../../../server/interfaces/http/middlewares/authenticateCart.js';
import { requireInternalApiKey } from '../../../server/interfaces/http/middlewares/requireInternalApiKey.js';
import { requireSuperAdmin } from '../../../server/interfaces/http/middlewares/requireSuperAdmin.js';
import * as menuController from '../../../server/interfaces/http/controllers/menuController.js';
import * as settingsController from '../../../server/interfaces/http/controllers/settingsController.js';
import * as customerController from '../../../server/interfaces/http/controllers/customerController.js';
import * as authClientController from '../../../server/interfaces/http/controllers/authClientController.js';
import * as cartController from '../../../server/interfaces/http/controllers/cartController.js';
import * as orderController from '../../../server/interfaces/http/controllers/orderController.js';
import * as paymentController from '../../../server/interfaces/http/controllers/paymentController.js';
import * as whatsappController from '../../../server/interfaces/http/controllers/whatsappController.js';
import * as adminController from '../../../server/interfaces/http/controllers/adminController.js';
import * as storeController from '../../../server/interfaces/http/controllers/storeController.js';
import * as adminDeliveryController from '../../../server/interfaces/http/controllers/adminDeliveryController.js';
import * as adminCouponController from '../../../server/interfaces/http/controllers/adminCouponController.js';
import * as adminPromotionController from '../../../server/interfaces/http/controllers/adminPromotionController.js';
import * as adminMediaController from '../../../server/interfaces/http/controllers/adminMediaController.js';
import * as mediaFileController from '../../../server/interfaces/http/controllers/mediaFileController.js';
import * as adminPlatformController from '../../../server/interfaces/http/controllers/adminPlatformController.js';
import * as healthDbController from '../../../server/interfaces/http/controllers/healthDbController.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const adminProtected = [authenticateAdmin, requireAdminStore];
const adminPlatform = [authenticateAdmin, requireSuperAdmin];

const routes = [
  ['GET', '/docs.json', [(_req, res) => res.json(openApiSpec)]],
  ['GET', '/health', [(_req, res) => res.json({ ok: true })]],
  ['GET', '/health/db', [healthDbController.getHealthDb]],
  ['GET', '/media/files/:id', [mediaFileController.serveMediaFile]],
  ['GET', '/settings/public', [settingsController.getPublicSettings]],
  ['GET', '/stores', [storeController.listStores]],
  ['POST', '/auth/client/request-code', [authClientController.requestCode]],
  ['POST', '/auth/client/verify-code', [authClientController.verifyCode]],
  ['GET', '/categories', [menuController.listCategories]],
  ['GET', '/products/best-sellers', [menuController.listBestSellers]],
  ['GET', '/products/promotions', [menuController.listPromotions]],
  ['GET', '/products/buy-again', [authenticateClient, menuController.listBuyAgain]],
  ['GET', '/products', [menuController.listProducts]],
  ['GET', '/products/:id', [menuController.getProduct]],
  ['GET', '/customers/me', [authenticateClient, customerController.getMe]],
  ['GET', '/customers/me/stores', [authenticateClient, customerController.getMyStores]],
  ['POST', '/customers/me', [authenticateClient, customerController.createMe]],
  ['PUT', '/customers/me', [authenticateClient, customerController.updateMe]],
  ['POST', '/customers/me/addresses', [authenticateClient, customerController.postAddressMe]],
  ['PUT', '/addresses/:id', [authenticateClient, customerController.putAddressMe]],
  ['POST', '/customers/me/validate-coupon', [authenticateClient, customerController.validateCoupon]],
  ['POST', '/cart', [cartController.createCart]],
  ['GET', '/cart/me', [authenticateCart, cartController.getCartMe]],
  ['POST', '/cart/items', [authenticateCart, cartController.addItem]],
  ['PUT', '/cart/items/:id', [authenticateCart, cartController.updateItem]],
  ['DELETE', '/cart/items/:id', [authenticateCart, cartController.deleteItem]],
  ['POST', '/orders', [authenticateClient, authenticateCart, orderController.create]],
  ['GET', '/orders/me', [authenticateClient, orderController.listMine]],
  ['GET', '/orders/:id', [authenticateClient, orderController.getOne]],
  ['PATCH', '/orders/:id/status', [...adminProtected, orderController.patchStatus]],
  ['GET', '/delivery-confirmations/:token', [orderController.getDeliveryConfirmation]],
  ['POST', '/delivery-confirmations/:token/confirm', [orderController.confirmDelivery]],
  ['POST', '/payments/pix', [requireInternalApiKey, paymentController.pix]],
  ['POST', '/payments/cash', [requireInternalApiKey, paymentController.cash]],
  ['POST', '/payments/card-on-delivery', [requireInternalApiKey, paymentController.cardOnDelivery]],
  ['POST', '/whatsapp/send-menu-link', [requireInternalApiKey, whatsappController.sendMenuLink]],
  ['POST', '/whatsapp/send-order-confirmation', [requireInternalApiKey, whatsappController.sendOrderConfirmation]],
  ['POST', '/whatsapp/send-status-update', [requireInternalApiKey, whatsappController.sendStatusUpdate]],
  ['POST', '/admin/login', [adminController.login]],
  ['GET', '/admin/me', [authenticateAdmin, adminController.getMe]],
  ['GET', '/admin/platform/stores', [...adminPlatform, adminPlatformController.listStores]],
  ['POST', '/admin/platform/stores', [...adminPlatform, adminPlatformController.createStore]],
  ['GET', '/admin/platform/admins', [...adminPlatform, adminPlatformController.listAdmins]],
  ['POST', '/admin/platform/admins', [...adminPlatform, adminPlatformController.createAdmin]],
  ['PATCH', '/admin/platform/admins/:id/stores', [...adminPlatform, adminPlatformController.patchAdminStores]],
  ['GET', '/admin/orders', [...adminProtected, adminController.listOrders]],
  ['GET', '/admin/orders/:id', [...adminProtected, adminController.getOrderAdmin]],
  ['POST', '/admin/orders/:id/print-thermal', [...adminProtected, adminController.printOrderThermal]],
  ['GET', '/admin/customers', [...adminProtected, adminController.listCustomers]],
  ['POST', '/admin/products', [...adminProtected, adminController.createProduct]],
  ['PUT', '/admin/products/:id', [...adminProtected, adminController.updateProduct]],
  ['PATCH', '/admin/products/:id/availability', [...adminProtected, adminController.patchAvailability]],
  ['DELETE', '/admin/products/:id', [...adminProtected, adminController.deleteProduct]],
  ['PATCH', '/admin/orders/:id/status', [...adminProtected, adminController.patchOrderStatus]],
  ['GET', '/admin/settings', [...adminProtected, adminController.getSettings]],
  ['PUT', '/admin/settings', [...adminProtected, adminController.putSettings]],
  ['GET', '/admin/categories', [...adminProtected, adminController.listCategoriesAdmin]],
  ['POST', '/admin/categories', [...adminProtected, adminController.createCategory]],
  ['PUT', '/admin/categories/:id', [...adminProtected, adminController.updateCategory]],
  ['DELETE', '/admin/categories/:id', [...adminProtected, adminController.deleteCategory]],
  ['GET', '/admin/products', [...adminProtected, adminController.listProductsAdmin]],
  ['GET', '/admin/products/:id', [...adminProtected, adminController.getProductAdmin]],
  ['GET', '/admin/delivery', [...adminProtected, adminDeliveryController.getDelivery]],
  ['PUT', '/admin/delivery', [...adminProtected, adminDeliveryController.putDelivery]],
  ['GET', '/admin/coupons', [...adminProtected, adminCouponController.list]],
  ['POST', '/admin/coupons', [...adminProtected, adminCouponController.create]],
  ['PATCH', '/admin/coupons/:id', [...adminProtected, adminCouponController.patch]],
  ['DELETE', '/admin/coupons/:id', [...adminProtected, adminCouponController.remove]],
  ['GET', '/admin/promotions', [...adminProtected, adminPromotionController.list]],
  ['POST', '/admin/promotions', [...adminProtected, adminPromotionController.create]],
  ['PATCH', '/admin/promotions/:id', [...adminProtected, adminPromotionController.patch]],
  ['DELETE', '/admin/promotions/:id', [...adminProtected, adminPromotionController.remove]],
  ['GET', '/admin/media', [...adminProtected, adminMediaController.listMedia]],
  ['POST', '/admin/media', [...adminProtected, adminMediaController.createMedia]],
  ['DELETE', '/admin/media/:id', [...adminProtected, adminMediaController.deleteMedia]],
];

function splitPath(pathname) {
  return pathname.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
}

function matchRoute(method, pathname) {
  const requestParts = splitPath(pathname);
  for (const [routeMethod, pattern, handlers] of routes) {
    if (routeMethod !== method) continue;
    const patternParts = splitPath(pattern);
    if (patternParts.length !== requestParts.length) continue;
    const params = {};
    let matched = true;
    for (let i = 0; i < patternParts.length; i += 1) {
      const part = patternParts[i];
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(requestParts[i]);
      } else if (part !== requestParts[i]) {
        matched = false;
        break;
      }
    }
    if (matched) return { handlers, params };
  }
  return null;
}

function headersToObject(headers) {
  const out = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

function queryToObject(searchParams) {
  const out = {};
  for (const [key, value] of searchParams.entries()) {
    if (out[key] === undefined) out[key] = value;
    else if (Array.isArray(out[key])) out[key].push(value);
    else out[key] = [out[key], value];
  }
  return out;
}

async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {};
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function createResponseAdapter() {
  const state = {
    status: 200,
    headers: new Headers(),
    body: null,
    sent: false,
  };

  const res = {
    get headersSent() {
      return state.sent;
    },
    status(code) {
      state.status = code;
      return res;
    },
    setHeader(name, value) {
      state.headers.set(name, String(value));
      return res;
    },
    json(payload) {
      state.headers.set('Content-Type', 'application/json; charset=utf-8');
      state.body = JSON.stringify(payload);
      state.sent = true;
      return res;
    },
    send(payload = '') {
      state.body = Buffer.isBuffer(payload) || typeof payload === 'string' ? payload : JSON.stringify(payload);
      state.sent = true;
      return res;
    },
    end(payload = '') {
      state.body = payload;
      state.sent = true;
      return res;
    },
    redirect(statusOrUrl, maybeUrl) {
      const status = typeof statusOrUrl === 'number' ? statusOrUrl : 302;
      const url = typeof statusOrUrl === 'number' ? maybeUrl : statusOrUrl;
      state.status = status;
      state.headers.set('Location', url);
      state.sent = true;
      return res;
    },
    toNextResponse() {
      if (state.status === 204 || state.status === 304) {
        return new NextResponse(null, { status: state.status, headers: state.headers });
      }
      return new NextResponse(state.body ?? '', { status: state.status, headers: state.headers });
    },
  };

  return { res, state };
}

async function runHandlers(handlers, req, res, state) {
  for (const handler of handlers) {
    let nextError;
    let nextCalled = false;
    const next = (err) => {
      nextCalled = true;
      if (err) nextError = err;
    };

    await handler(req, res, next);
    if (nextError) throw nextError;
    if (state.sent) return;
    if (!nextCalled && handler.length >= 3) return;
  }
}

function errorResponse(error) {
  const status = error?.status || error?.statusCode || 500;
  const body = {
    error: status >= 500 ? 'Erro interno' : error?.message || 'Erro na requisição',
  };
  if (error?.details) body.details = error.details;
  if (status >= 500) console.error(error);
  return NextResponse.json(body, { status });
}

async function handle(request, context) {
  const url = new URL(request.url);
  const params = await context.params;
  const pathname = `/${(params?.path || []).join('/')}`;
  const matched = matchRoute(request.method, pathname);

  if (!matched) {
    return NextResponse.json({ error: 'Rota não encontrada' }, { status: 404 });
  }

  const { res, state } = createResponseAdapter();
  const req = {
    method: request.method,
    url: `${pathname}${url.search}`,
    originalUrl: `${pathname}${url.search}`,
    path: pathname,
    params: matched.params,
    query: queryToObject(url.searchParams),
    headers: headersToObject(request.headers),
    body: await readBody(request),
    ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1',
  };

  try {
    await runHandlers(matched.handlers, req, res, state);
    if (!state.sent) return NextResponse.json({ ok: true });
    return res.toNextResponse();
  } catch (error) {
    return errorResponse(error);
  }
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    },
  });
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
