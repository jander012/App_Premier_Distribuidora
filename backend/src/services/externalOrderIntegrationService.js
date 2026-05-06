import { env } from '../config/env.js';
import { getLinxProvider } from '../integrations/linx/index.js';
import { getPickingoProvider } from '../integrations/pickingo/index.js';
import * as integrationRepo from '../repositories/integrationRepository.js';
import * as settingsRepo from '../repositories/settingsRepository.js';

function buildOrderPayload(order, items) {
  return {
    order: {
      id: order.id,
      storeId: order.store_id,
      status: order.status,
      subtotal: Number(order.subtotal),
      deliveryFee: Number(order.delivery_fee),
      couponDiscount: Number(order.coupon_discount || 0),
      total: Number(order.total),
      paymentMethodCode: order.payment_method_code,
      paymentMeta: order.payment_meta || {},
      customer: {
        name: order.customer_full_name,
        cpf: order.customer_cpf,
        email: order.customer_email,
        phone: order.customer_phone,
      },
      delivery: {
        street: order.delivery_street,
        number: order.delivery_number,
        neighborhood: order.delivery_neighborhood,
        zipCode: order.delivery_zip_code,
        complement: order.delivery_complement,
        reference: order.delivery_reference,
        latitude: order.delivery_latitude != null ? Number(order.delivery_latitude) : null,
        longitude: order.delivery_longitude != null ? Number(order.delivery_longitude) : null,
      },
      createdAt: order.created_at,
    },
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id,
      name: item.product_name,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      note: item.note,
      options: item.options_snapshot || [],
      lineTotal: Number(item.line_total),
    })),
  };
}

async function sendWithTracking({ providerName, action, order, items, enabled, providerCall }) {
  const payload = buildOrderPayload(order, items);
  if (!enabled) {
    await integrationRepo.upsertOrderIntegration({
      orderId: order.id,
      provider: providerName,
      status: 'disabled',
      requestPayload: payload,
      responsePayload: { message: 'Integração desativada por configuração.' },
    });
    await integrationRepo.logIntegration({
      orderId: order.id,
      provider: providerName,
      direction: 'outbound',
      action,
      status: 'disabled',
      payload,
    });
    return;
  }

  await integrationRepo.upsertOrderIntegration({
    orderId: order.id,
    provider: providerName,
    status: 'pending',
    requestPayload: payload,
  });

  try {
    const response = await providerCall(payload);
    await integrationRepo.markOrderIntegrationAttempt({
      orderId: order.id,
      provider: providerName,
      status: response?.status || 'sent',
      externalRef: response?.externalRef || null,
      requestPayload: payload,
      responsePayload: response?.raw ? response.raw : response,
      lastError: null,
    });
    await integrationRepo.logIntegration({
      orderId: order.id,
      provider: providerName,
      direction: 'outbound',
      action,
      status: response?.status || 'sent',
      payload: response,
    });
  } catch (e) {
    await integrationRepo.markOrderIntegrationAttempt({
      orderId: order.id,
      provider: providerName,
      status: 'error',
      requestPayload: payload,
      lastError: e.message,
    });
    await integrationRepo.logIntegration({
      orderId: order.id,
      provider: providerName,
      direction: 'outbound',
      action,
      status: 'error',
      payload,
      error: e.message,
    });
    throw e;
  }
}

export async function dispatchOrderIntegrations(order, items) {
  const config = await settingsRepo.getStoreConfig(order.store_id);
  const linxEnabled = env.linxIntegrationEnabled && Boolean(config?.linx_integration_enabled);
  const pickingoEnabled = env.pickingoIntegrationEnabled && Boolean(config?.pickingo_integration_enabled);
  const tasks = [
    sendWithTracking({
      providerName: 'linx_pos',
      action: 'send_order',
      order,
      items,
      enabled: linxEnabled,
      providerCall: (payload) => getLinxProvider().sendOrder({ order, items, payload }),
    }),
    sendWithTracking({
      providerName: 'pickingo',
      action: 'create_delivery',
      order,
      items,
      enabled: pickingoEnabled,
      providerCall: (payload) => getPickingoProvider().createDelivery({ order, items, payload }),
    }),
  ];

  const results = await Promise.allSettled(tasks);
  for (const result of results) {
    if (result.status === 'rejected') {
      // eslint-disable-next-line no-console
      console.error('Integração externa falhou:', result.reason?.message || result.reason);
    }
  }
}
