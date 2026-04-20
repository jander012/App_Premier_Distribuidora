import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { authenticateAdmin } from './middlewares/authenticateAdmin.js';
import { requireAdminStore } from './middlewares/requireAdminStore.js';
import { authenticateClient } from './middlewares/authenticateClient.js';
import { authenticateCart } from './middlewares/authenticateCart.js';
import { requireInternalApiKey } from './middlewares/requireInternalApiKey.js';
import {
  globalLimiter,
  authRequestCodeLimiter,
  authVerifyCodeLimiter,
  adminLoginLimiter,
  orderCreateLimiter,
} from './middlewares/rateLimiters.js';
import * as menuController from './controllers/menuController.js';
import * as settingsController from './controllers/settingsController.js';
import * as customerController from './controllers/customerController.js';
import * as authClientController from './controllers/authClientController.js';
import * as cartController from './controllers/cartController.js';
import * as orderController from './controllers/orderController.js';
import * as paymentController from './controllers/paymentController.js';
import * as whatsappController from './controllers/whatsappController.js';
import * as adminController from './controllers/adminController.js';
import * as storeController from './controllers/storeController.js';
import * as adminDeliveryController from './controllers/adminDeliveryController.js';
import * as adminCouponController from './controllers/adminCouponController.js';
import * as adminMediaController from './controllers/adminMediaController.js';
import * as mediaFileController from './controllers/mediaFileController.js';
import { requireSuperAdmin } from './middlewares/requireSuperAdmin.js';
import * as adminPlatformController from './controllers/adminPlatformController.js';
import * as healthDbController from './controllers/healthDbController.js';

const app = express();
app.set('trust proxy', env.trustProxy);

const adminProtected = [authenticateAdmin, requireAdminStore];
const adminPlatform = [authenticateAdmin, requireSuperAdmin];

const allowedOrigins = env.corsOrigins;

/** Permite Vite dev (5173), preview (4173) e qualquer porta em localhost/127.0.0.1 quando CORS_ORIGINS não está definido. */
function isDefaultLocalDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || '');
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.length > 0) {
        return cb(null, allowedOrigins.includes(origin));
      }
      if (isDefaultLocalDevOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Cart-Token', 'X-Store-Id'],
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ ok: true }));
app.get('/health/db', healthDbController.getHealthDb);

/** Imagens espelhadas no servidor (URL pública no banco: /api/media/files/:id) */
app.get('/media/files/:id', mediaFileController.serveMediaFile);

app.get('/settings/public', settingsController.getPublicSettings);
app.get('/stores', storeController.listStores);

app.post('/auth/client/request-code', authRequestCodeLimiter, authClientController.requestCode);
app.post('/auth/client/verify-code', authVerifyCodeLimiter, authClientController.verifyCode);

app.get('/categories', menuController.listCategories);
app.get('/products', menuController.listProducts);
app.get('/products/:id', menuController.getProduct);

app.get('/customers/me', authenticateClient, customerController.getMe);
app.get('/customers/me/stores', authenticateClient, customerController.getMyStores);
app.post('/customers/me', authenticateClient, customerController.createMe);
app.put('/customers/me', authenticateClient, customerController.updateMe);
app.post('/customers/me/addresses', authenticateClient, customerController.postAddressMe);
app.put('/addresses/:id', authenticateClient, customerController.putAddressMe);
app.post('/customers/me/validate-coupon', authenticateClient, customerController.validateCoupon);

app.post('/cart', cartController.createCart);
app.get('/cart/me', authenticateCart, cartController.getCartMe);
app.post('/cart/items', authenticateCart, cartController.addItem);
app.put('/cart/items/:id', authenticateCart, cartController.updateItem);
app.delete('/cart/items/:id', authenticateCart, cartController.deleteItem);

app.post(
  '/orders',
  orderCreateLimiter,
  authenticateClient,
  authenticateCart,
  orderController.create
);
app.get('/orders/me', authenticateClient, orderController.listMine);
app.get('/orders/:id', authenticateClient, orderController.getOne);
app.patch('/orders/:id/status', ...adminProtected, orderController.patchStatus);

app.post('/payments/pix', requireInternalApiKey, paymentController.pix);
app.post('/payments/cash', requireInternalApiKey, paymentController.cash);
app.post('/payments/card-on-delivery', requireInternalApiKey, paymentController.cardOnDelivery);

app.post('/whatsapp/send-menu-link', requireInternalApiKey, whatsappController.sendMenuLink);
app.post(
  '/whatsapp/send-order-confirmation',
  requireInternalApiKey,
  whatsappController.sendOrderConfirmation
);
app.post('/whatsapp/send-status-update', requireInternalApiKey, whatsappController.sendStatusUpdate);

app.post('/admin/login', adminLoginLimiter, adminController.login);
app.get('/admin/me', authenticateAdmin, adminController.getMe);
app.get('/admin/platform/stores', ...adminPlatform, adminPlatformController.listStores);
app.post('/admin/platform/stores', ...adminPlatform, adminPlatformController.createStore);
app.get('/admin/platform/admins', ...adminPlatform, adminPlatformController.listAdmins);
app.post('/admin/platform/admins', ...adminPlatform, adminPlatformController.createAdmin);
app.patch(
  '/admin/platform/admins/:id/stores',
  ...adminPlatform,
  adminPlatformController.patchAdminStores
);
app.get('/admin/orders', ...adminProtected, adminController.listOrders);
app.get('/admin/orders/:id', ...adminProtected, adminController.getOrderAdmin);
app.post('/admin/orders/:id/print-thermal', ...adminProtected, adminController.printOrderThermal);
app.get('/admin/customers', ...adminProtected, adminController.listCustomers);
app.post('/admin/products', ...adminProtected, adminController.createProduct);
app.put('/admin/products/:id', ...adminProtected, adminController.updateProduct);
app.patch('/admin/products/:id/availability', ...adminProtected, adminController.patchAvailability);
app.delete('/admin/products/:id', ...adminProtected, adminController.deleteProduct);
app.patch('/admin/orders/:id/status', ...adminProtected, adminController.patchOrderStatus);
app.get('/api/admin/orders/:id', ...adminProtected, adminController.getOrderAdmin);
app.post('/api/admin/orders/:id/print-thermal', ...adminProtected, adminController.printOrderThermal);
app.get('/admin/settings', ...adminProtected, adminController.getSettings);
app.put('/admin/settings', ...adminProtected, adminController.putSettings);
app.get('/admin/categories', ...adminProtected, adminController.listCategoriesAdmin);
app.post('/admin/categories', ...adminProtected, adminController.createCategory);
app.put('/admin/categories/:id', ...adminProtected, adminController.updateCategory);
app.delete('/admin/categories/:id', ...adminProtected, adminController.deleteCategory);
app.get('/admin/products', ...adminProtected, adminController.listProductsAdmin);
app.get('/admin/products/:id', ...adminProtected, adminController.getProductAdmin);

app.get('/admin/delivery', ...adminProtected, adminDeliveryController.getDelivery);
app.put('/admin/delivery', ...adminProtected, adminDeliveryController.putDelivery);
const adminCouponsGet = [...adminProtected, adminCouponController.list];
const adminCouponsPost = [...adminProtected, adminCouponController.create];
const adminCouponsPatch = [...adminProtected, adminCouponController.patch];
const adminCouponsDelete = [...adminProtected, adminCouponController.remove];
app.get('/admin/coupons', ...adminCouponsGet);
app.post('/admin/coupons', ...adminCouponsPost);
app.patch('/admin/coupons/:id', ...adminCouponsPatch);
app.delete('/admin/coupons/:id', ...adminCouponsDelete);
/** Alguns proxies encaminham com prefixo /api sem reescrever o path. */
app.get('/api/admin/coupons', ...adminCouponsGet);
app.post('/api/admin/coupons', ...adminCouponsPost);
app.patch('/api/admin/coupons/:id', ...adminCouponsPatch);
app.delete('/api/admin/coupons/:id', ...adminCouponsDelete);
app.get('/admin/media', ...adminProtected, adminMediaController.listMedia);
app.post('/admin/media', ...adminProtected, adminMediaController.createMedia);
app.delete('/admin/media/:id', ...adminProtected, adminMediaController.deleteMedia);

app.use(errorHandler);

export default app;
