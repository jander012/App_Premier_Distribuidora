import { pool } from '../../infrastructure/config/db.js';
import * as cartService from './cartService.js';
import * as customerService from './customerService.js';
import * as cartRepo from '../../infrastructure/repositories/cartRepository.js';
import * as orderRepo from '../../infrastructure/repositories/orderRepository.js';
import * as customerRepo from '../../infrastructure/repositories/customerRepository.js';
import * as whatsappService from './whatsappService.js';
import * as paymentService from './paymentService.js';
import * as deliveryPricingService from './deliveryPricingService.js';
import * as couponService from './couponService.js';
import * as externalOrderIntegrationService from './externalOrderIntegrationService.js';
import { env } from '../../infrastructure/config/env.js';
import { normalizePhone } from '../../domain/shared/phone.js';
import { AppError } from '../../domain/shared/AppError.js';
import crypto from 'crypto';

export async function createOrder(body, opts = {}) {
  const phone =
    opts.verifiedPhone != null
      ? normalizePhone(opts.verifiedPhone)
      : normalizePhone(body.phone);
  if (!phone) throw new AppError(400, 'Telefone inválido');
  if (opts.verifiedPhone != null && body.phone != null && normalizePhone(body.phone) !== phone) {
    throw new AppError(400, 'Telefone não corresponde à sessão autenticada');
  }

  const cartId =
    opts.verifiedCartId != null ? String(opts.verifiedCartId) : body.cartId;
  if (!cartId) throw new AppError(400, 'Carrinho inválido');
  paymentService.assertPaymentMethod(body.paymentMethodCode);
  const paymentMeta = paymentService.normalizePaymentMeta(body.paymentMethodCode, body.paymentMeta || {});

  const rawKm = body.deliveryDistanceKm ?? body.delivery_distance_km;
  const distanceKm =
    rawKm !== undefined && rawKm !== null && String(rawKm).trim() !== ''
      ? Number(String(rawKm).replace(',', '.'))
      : null;
  const deliveryAt = body.deliveryAt || body.delivery_at || null;

  const cartRow = await cartRepo.getCart(cartId);
  if (!cartRow) throw new AppError(404, 'Carrinho não encontrado');
  const cartLines = await cartRepo.listCartItems(cartId);
  const peekStoreId = cartRow.store_id ?? cartLines[0]?.product_store_id ?? null;

  const addr = body.address || {};
  const deliveryLat = addr.latitude ?? addr.lat ?? body.deliveryLatitude ?? body.delivery_lat;
  const deliveryLng = addr.longitude ?? addr.lng ?? body.deliveryLongitude ?? body.delivery_lng;
  await deliveryPricingService.assertDeliveryInsidePolygonIfConfigured(peekStoreId, deliveryLat, deliveryLng);

  const distanceResolution = await deliveryPricingService.resolveDeliveryDistanceKm(peekStoreId, {
    manualKm: distanceKm,
    destLat: deliveryLat,
    destLng: deliveryLng,
  });
  await deliveryPricingService.assertDeliveryDistanceResolvedIfRequired(peekStoreId, distanceResolution);

  const summary = await cartService.getCartSummary(cartId, {
    distanceResolution,
    deliveryLat,
    deliveryLng,
    deliveryAt,
  });
  if (!summary.items.length) throw new AppError(400, 'Carrinho vazio');
  const bad = summary.items.find((i) => !i.available);
  if (bad) throw new AppError(400, `Produto indisponível: ${bad.name}`);
  if (!summary.storeId) throw new AppError(400, 'Loja do carrinho indefinida');

  const { customer, address } = await customerService.ensureCustomerForOrder(phone, body);

  const preTotal = Math.round((Number(summary.subtotal) + Number(summary.deliveryFee)) * 100) / 100;
  const rawCoupon = body.couponCode ?? body.coupon_code;
  let couponId = null;
  let couponDiscount = 0;
  if (rawCoupon != null && String(rawCoupon).trim() !== '') {
    const cr = await couponService.validateCouponForCustomer({
      storeId: summary.storeId,
      customerId: customer.id,
      code: String(rawCoupon).trim(),
      orderSubtotal: summary.subtotal,
      deliveryFee: summary.deliveryFee,
    });
    couponId = cr.couponId;
    couponDiscount = cr.discountAmount;
  }
  const finalTotal = Math.max(0, Math.round((preTotal - couponDiscount) * 100) / 100);

  const client = await pool.connect();
  let order;
  try {
    await client.query('BEGIN');

    const orderResult = await client.query(
      `INSERT INTO orders (
        store_id, customer_id, cart_id, status, subtotal, delivery_fee, coupon_id, coupon_discount, total,
        payment_method_code, payment_meta,
        delivery_street, delivery_number, delivery_neighborhood, delivery_zip_code,
        delivery_complement, delivery_reference, delivery_latitude, delivery_longitude,
        customer_full_name, customer_cpf, customer_email, customer_phone
      ) VALUES (
        $1, $2, $3, 'received', $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
      )`,
      [
        summary.storeId,
        customer.id,
        cartId,
        summary.subtotal,
        summary.deliveryFee,
        couponId,
        couponDiscount,
        finalTotal,
        body.paymentMethodCode,
        JSON.stringify(paymentMeta),
        address.street,
        address.number,
        address.neighborhood,
        address.zip_code,
        address.complement || null,
        address.reference_note || null,
        deliveryLat != null && deliveryLat !== '' ? Number(deliveryLat) : null,
        deliveryLng != null && deliveryLng !== '' ? Number(deliveryLng) : null,
        customer.full_name,
        customer.cpf,
        customer.email,
        phone,
      ]
    );
    const { rows: orderRows } = await client.query(`SELECT * FROM orders WHERE id = $1`, [orderResult.insertId]);
    order = orderRows[0];

    if (couponId != null && couponDiscount > 0) {
      await client.query(
        `INSERT INTO coupon_redemptions (coupon_id, customer_id, order_id, discount_amount)
         VALUES ($1, $2, $3, $4)`,
        [couponId, customer.id, order.id, couponDiscount]
      );
    }

    for (const line of summary.items) {
      await client.query(
        `INSERT INTO order_items
          (order_id, product_id, product_name, unit_price, quantity, note, options_snapshot, line_total)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          order.id,
          line.productId,
          line.name,
          line.unitPrice,
          line.quantity,
          line.note || null,
          JSON.stringify(line.options || []),
          line.lineTotal,
        ]
      );
    }

    await client.query(`INSERT INTO order_status_history (order_id, status) VALUES ($1, 'received')`, [
      order.id,
    ]);

    await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cartId]);
    await client.query(`UPDATE carts SET updated_at = now() WHERE id = $1`, [cartId]);

    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  try {
    await customerRepo.linkCustomerToStore(customer.id, summary.storeId);
  } catch (linkErr) {
    // eslint-disable-next-line no-console
    console.error('customer_stores:', linkErr.message);
  }

  const items = await orderRepo.getOrderItems(order.id);

  await externalOrderIntegrationService.dispatchOrderIntegrations(order, items);

  try {
    await whatsappService.sendOrderConfirmation(order, items);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('WhatsApp confirmação falhou (pedido já criado):', e.message);
  }

  let pix = null;
  if (body.paymentMethodCode === 'pix_online') {
    try {
      pix = await paymentService.createPixOnlinePayment(order);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('PIX pendente não registrado:', e.message);
    }
  }

  return { order, items, pixCharge: pix };
}

export async function getOrder(id) {
  const order = await orderRepo.getOrderById(id);
  if (!order) throw new AppError(404, 'Pedido não encontrado');
  const items = await orderRepo.getOrderItems(id);
  return { order, items };
}

export async function getOrderForClient(id, clientPhoneDigits) {
  const { order, items } = await getOrder(id);
  const normalized = normalizePhone(clientPhoneDigits);
  if (!normalized || normalizePhone(order.customer_phone) !== normalized) {
    throw new AppError(403, 'Acesso negado a este pedido');
  }
  return { order, items };
}

export async function getOrderForAdmin(orderId, storeId) {
  const { order, items } = await getOrder(orderId);
  if (storeId != null && order.store_id !== storeId) {
    throw new AppError(403, 'Pedido de outra loja');
  }
  return { order, items };
}

export async function listByPhone(rawPhone, storeId = null) {
  const phone = normalizePhone(rawPhone);
  if (!phone) throw new AppError(400, 'Telefone inválido');
  const orders = await orderRepo.listOrdersByPhone(phone, storeId);
  return orders;
}

export async function updateStatus(orderId, status, { notify = true, storeId = null } = {}) {
  const allowed = ['received', 'preparing', 'out_for_delivery', 'delivered_pending_confirmation', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) throw new AppError(400, 'Status inválido');
  const current = await orderRepo.getOrderById(orderId);
  if (!current) throw new AppError(404, 'Pedido não encontrado');
  if (storeId != null && current.store_id !== storeId) {
    throw new AppError(403, 'Pedido de outra loja');
  }
  let order = await orderRepo.updateOrderStatus(orderId, status, storeId);
  if (!order) throw new AppError(404, 'Pedido não encontrado');
  await orderRepo.addStatusHistory(orderId, status);
  if (status === 'delivered_pending_confirmation') {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    order = await orderRepo.setDeliveryConfirmationToken(orderId, token, expiresAt);
    const base = env.publicMenuUrl.replace(/\/$/, '');
    const confirmationUrl = `${base}/confirmar-entrega/${token}`;
    if (notify) {
      try {
        await whatsappService.sendDeliveryConfirmationRequest(order, confirmationUrl);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('WhatsApp confirmação entrega:', e.message);
      }
    }
    return order;
  }
  if (notify) {
    try {
      await whatsappService.sendStatusUpdate(order);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('WhatsApp status:', e.message);
    }
  }
  return order;
}

export async function getDeliveryConfirmation(token) {
  const safe = String(token || '').trim();
  if (!safe) throw new AppError(400, 'Token inválido');
  const order = await orderRepo.getOrderByDeliveryConfirmationToken(safe);
  if (!order) throw new AppError(404, 'Confirmação não encontrada');
  const expired =
    order.delivery_confirmation_expires_at != null &&
    new Date(order.delivery_confirmation_expires_at).getTime() < Date.now();
  return {
    order: {
      id: order.id,
      status: order.status,
      total: Number(order.total),
      customerName: order.customer_full_name,
      delivery: {
        street: order.delivery_street,
        number: order.delivery_number,
        neighborhood: order.delivery_neighborhood,
      },
      expired,
      confirmedAt: order.delivery_confirmed_at,
    },
  };
}

export async function confirmDelivery(token) {
  const safe = String(token || '').trim();
  if (!safe) throw new AppError(400, 'Token inválido');
  const before = await orderRepo.getOrderByDeliveryConfirmationToken(safe);
  if (!before) throw new AppError(404, 'Confirmação não encontrada');
  if (before.status === 'delivered') return { order: before, alreadyConfirmed: true };
  if (before.status !== 'delivered_pending_confirmation') {
    throw new AppError(400, 'Este pedido ainda não está aguardando confirmação de entrega');
  }
  if (
    before.delivery_confirmation_expires_at != null &&
    new Date(before.delivery_confirmation_expires_at).getTime() < Date.now()
  ) {
    throw new AppError(400, 'Link de confirmação expirado');
  }
  await orderRepo.confirmDeliveryByToken(safe);
  const order = await orderRepo.getOrderById(before.id);
  await orderRepo.addStatusHistory(before.id, 'delivered', 'Confirmado pelo cliente');
  try {
    await whatsappService.sendStatusUpdate(order);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('WhatsApp entrega confirmada:', e.message);
  }
  return { order, alreadyConfirmed: false };
}
