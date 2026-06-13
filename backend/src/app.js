import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openApiSpec } from './docs/openapi.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { authenticateAdmin } from './middlewares/authenticateAdmin.js';
import { requireAdminStore } from './middlewares/requireAdminStore.js';
import { authenticateClient } from './middlewares/authenticateClient.js';
import { authenticateCart } from './middlewares/authenticateCart.js';
import { requireInternalApiKey } from './middlewares/requireInternalApiKey.js';
import { requireSuperAdmin } from './middlewares/requireSuperAdmin.js';
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
import * as adminPlatformController from './controllers/adminPlatformController.js';
import * as healthDbController from './controllers/healthDbController.js';

const app = express();
const api = express.Router();

app.set('trust proxy', env.trustProxy);

const adminProtected = [authenticateAdmin, requireAdminStore];
const adminPlatform = [authenticateAdmin, requireSuperAdmin];

function isDefaultLocalDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin || '');
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (env.corsOrigins.length > 0) return cb(null, env.corsOrigins.includes(origin));
      if (isDefaultLocalDevOrigin(origin)) return cb(null, true);
      return cb(null, false);
    },
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Cart-Token', 'X-Store-Id', 'X-Internal-Key'],
  })
);
app.use(express.json({ limit: '1mb' }));

api.use(globalLimiter);

api.get('/docs.json', (_req, res) => res.json(openApiSpec));
api.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
api.get('/health', (_req, res) => res.json({ ok: true }));
api.get('/health/db', healthDbController.getHealthDb);
api.get('/media/files/:id', mediaFileController.serveMediaFile);
api.get('/settings/public', settingsController.getPublicSettings);
api.get('/stores', storeController.listStores);
api.post('/auth/client/request-code', authRequestCodeLimiter, authClientController.requestCode);
api.post('/auth/client/verify-code', authVerifyCodeLimiter, authClientController.verifyCode);
api.get('/categories', menuController.listCategories);
api.get('/products', menuController.listProducts);
api.get('/products/:id', menuController.getProduct);
api.get('/customers/me', authenticateClient, customerController.getMe);
api.get('/customers/me/stores', authenticateClient, customerController.getMyStores);
api.post('/customers/me', authenticateClient, customerController.createMe);
api.put('/customers/me', authenticateClient, customerController.updateMe);
api.post('/customers/me/addresses', authenticateClient, customerController.postAddressMe);
api.put('/addresses/:id', authenticateClient, customerController.putAddressMe);
api.post('/customers/me/validate-coupon', authenticateClient, customerController.validateCoupon);
api.post('/cart', cartController.createCart);
api.get('/cart/me', authenticateCart, cartController.getCartMe);
api.post('/cart/items', authenticateCart, cartController.addItem);
api.put('/cart/items/:id', authenticateCart, cartController.updateItem);
api.delete('/cart/items/:id', authenticateCart, cartController.deleteItem);
api.post('/orders', orderCreateLimiter, authenticateClient, authenticateCart, orderController.create);
api.get('/orders/me', authenticateClient, orderController.listMine);
api.get('/orders/:id', authenticateClient, orderController.getOne);
api.patch('/orders/:id/status', ...adminProtected, orderController.patchStatus);
api.get('/delivery-confirmations/:token', orderController.getDeliveryConfirmation);
api.post('/delivery-confirmations/:token/confirm', orderController.confirmDelivery);
api.post('/payments/pix', requireInternalApiKey, paymentController.pix);
api.post('/payments/cash', requireInternalApiKey, paymentController.cash);
api.post('/payments/card-on-delivery', requireInternalApiKey, paymentController.cardOnDelivery);
api.post('/whatsapp/send-menu-link', requireInternalApiKey, whatsappController.sendMenuLink);
api.post('/whatsapp/send-order-confirmation', requireInternalApiKey, whatsappController.sendOrderConfirmation);
api.post('/whatsapp/send-status-update', requireInternalApiKey, whatsappController.sendStatusUpdate);
api.post('/admin/login', adminLoginLimiter, adminController.login);
api.get('/admin/me', authenticateAdmin, adminController.getMe);
api.get('/admin/platform/stores', ...adminPlatform, adminPlatformController.listStores);
api.post('/admin/platform/stores', ...adminPlatform, adminPlatformController.createStore);
api.get('/admin/platform/admins', ...adminPlatform, adminPlatformController.listAdmins);
api.post('/admin/platform/admins', ...adminPlatform, adminPlatformController.createAdmin);
api.patch('/admin/platform/admins/:id/stores', ...adminPlatform, adminPlatformController.patchAdminStores);
api.get('/admin/orders', ...adminProtected, adminController.listOrders);
api.get('/admin/orders/:id', ...adminProtected, adminController.getOrderAdmin);
api.post('/admin/orders/:id/print-thermal', ...adminProtected, adminController.printOrderThermal);
api.get('/admin/customers', ...adminProtected, adminController.listCustomers);
api.post('/admin/products', ...adminProtected, adminController.createProduct);
api.put('/admin/products/:id', ...adminProtected, adminController.updateProduct);
api.patch('/admin/products/:id/availability', ...adminProtected, adminController.patchAvailability);
api.delete('/admin/products/:id', ...adminProtected, adminController.deleteProduct);
api.patch('/admin/orders/:id/status', ...adminProtected, adminController.patchOrderStatus);
api.get('/admin/settings', ...adminProtected, adminController.getSettings);
api.put('/admin/settings', ...adminProtected, adminController.putSettings);
api.get('/admin/categories', ...adminProtected, adminController.listCategoriesAdmin);
api.post('/admin/categories', ...adminProtected, adminController.createCategory);
api.put('/admin/categories/:id', ...adminProtected, adminController.updateCategory);
api.delete('/admin/categories/:id', ...adminProtected, adminController.deleteCategory);
api.get('/admin/products', ...adminProtected, adminController.listProductsAdmin);
api.get('/admin/products/:id', ...adminProtected, adminController.getProductAdmin);
api.get('/admin/delivery', ...adminProtected, adminDeliveryController.getDelivery);
api.put('/admin/delivery', ...adminProtected, adminDeliveryController.putDelivery);
api.get('/admin/coupons', ...adminProtected, adminCouponController.list);
api.post('/admin/coupons', ...adminProtected, adminCouponController.create);
api.patch('/admin/coupons/:id', ...adminProtected, adminCouponController.patch);
api.delete('/admin/coupons/:id', ...adminProtected, adminCouponController.remove);
api.get('/admin/media', ...adminProtected, adminMediaController.listMedia);
api.post('/admin/media', ...adminProtected, adminMediaController.createMedia);
api.delete('/admin/media/:id', ...adminProtected, adminMediaController.deleteMedia);

app.use('/api', api);
app.use('/', api);
app.use(errorHandler);

export default app;
