import * as driverRepo from '../../../infrastructure/repositories/driverRepository.js';
import * as orderRepo from '../../../infrastructure/repositories/orderRepository.js';
import * as orderService from '../../../application/services/orderService.js';
import { AppError } from '../../../domain/shared/AppError.js';
import { query } from '../../../infrastructure/config/db.js';
import { env } from '../../../infrastructure/config/env.js';

function runPayload(row) {
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    orderStatus: row.order_status,
    driverId: row.driver_id,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    total: row.total != null ? Number(row.total) : null,
    deliveryFee: row.delivery_fee != null ? Number(row.delivery_fee) : null,
    orderCreatedAt: row.order_created_at,
    customer: {
      fullName: row.customer_full_name,
      phone: row.customer_phone,
    },
    delivery: {
      street: row.delivery_street,
      number: row.delivery_number,
      neighborhood: row.delivery_neighborhood,
      zipCode: row.delivery_zip_code,
      complement: row.delivery_complement,
      reference: row.delivery_reference,
      latitude: row.delivery_latitude != null ? Number(row.delivery_latitude) : null,
      longitude: row.delivery_longitude != null ? Number(row.delivery_longitude) : null,
    },
  };
}

async function resolveDriverByEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (!normalized) throw new AppError(400, 'email obrigatório');
  const { rows } = await query(
    `SELECT * FROM delivery_drivers WHERE lower(external_email) = $1 AND active = true ORDER BY is_default DESC, id ASC LIMIT 1`,
    [normalized]
  );
  if (!rows[0]) {
    const byUser = await query(
      `SELECT * FROM delivery_drivers WHERE lower(username) = $1 AND active = true LIMIT 1`,
      [normalized.split('@')[0]]
    );
    if (!byUser.rows[0]) throw new AppError(404, 'Entregador não encontrado na loja');
    return byUser.rows[0];
  }
  return rows[0];
}

export async function listRuns(req, res, next) {
  try {
    const driver = await resolveDriverByEmail(req.query.email);
    const available = await driverRepo.listAvailableRuns(driver.store_id);
    const mine = await driverRepo.listRunsForDriver(driver.id);
    const mineWithFee = [];
    for (const row of mine) {
      const order = await orderRepo.getOrderById(row.order_id);
      mineWithFee.push({ ...row, delivery_fee: order?.delivery_fee });
    }
    res.json({
      available: available.map(runPayload),
      mine: mineWithFee.map((r) =>
        runPayload({
          ...r,
          ...(r.status === 'completed' || r.order_status === 'delivered'
            ? { customer_full_name: r.customer_full_name, customer_phone: null, delivery_street: null }
            : {}),
        })
      ),
      driverId: driver.id,
      storeId: driver.store_id,
    });
  } catch (e) {
    next(e);
  }
}

export async function acceptRun(req, res, next) {
  try {
    const driver = await resolveDriverByEmail(req.body?.email);
    const row = await driverRepo.acceptRun(Number(req.params.id), driver.id, driver.store_id);
    if (!row || row.driver_id !== driver.id) throw new AppError(409, 'Corrida indisponível');
    await orderRepo.updateOrderStatus(row.order_id, 'out_for_delivery', driver.store_id);
    res.json({ ...runPayload(row), orderId: row.order_id, order_id: row.order_id });
  } catch (e) {
    next(e);
  }
}

export async function updateRunStatus(req, res, next) {
  try {
    const driver = await resolveDriverByEmail(req.body?.email);
    const status = String(req.body.status || '').trim();
    if (!['picked_up', 'completed'].includes(status)) throw new AppError(400, 'Status inválido');
    const row = await driverRepo.updateRunStatus(Number(req.params.id), driver.id, status);
    if (!row) throw new AppError(404, 'Corrida não encontrada');
    if (status === 'completed') {
      await orderService.updateStatus(row.order_id, 'delivered_pending_confirmation', {
        storeId: driver.store_id,
      });
    }
    res.json(runPayload(row));
  } catch (e) {
    next(e);
  }
}

export async function publishGps(req, res, next) {
  try {
    const driver = await resolveDriverByEmail(req.body?.email);
    const orderId = Number(req.params.id);
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new AppError(400, 'lat/lng inválidos');
    const order = await orderRepo.getOrderById(orderId);
    if (!order || order.store_id !== driver.store_id) throw new AppError(404, 'Pedido não encontrado');
    if (order.driver_id && order.driver_id !== driver.id) throw new AppError(403, 'Pedido de outro entregador');
    await query(
      `UPDATE orders SET driver_lat = $2, driver_lng = $3, driver_location_at = now(), updated_at = now() WHERE id = $1`,
      [orderId, lat, lng]
    );
    res.json({ orderId, lat, lng, at: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
}

export async function getGps(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const order = await orderRepo.getOrderById(orderId);
    if (!order) throw new AppError(404, 'Pedido não encontrado');
    res.json({
      orderId,
      lat: order.driver_lat != null ? Number(order.driver_lat) : null,
      lng: order.driver_lng != null ? Number(order.driver_lng) : null,
      at: order.driver_location_at,
    });
  } catch (e) {
    next(e);
  }
}

/** Público para a página do pedido do cliente (sem endereço do entregador — só lat/lng). */
export async function getPublicOrderGps(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    const order = await orderRepo.getOrderById(orderId);
    if (!order) throw new AppError(404, 'Pedido não encontrado');
    const tracking =
      order.status === 'out_for_delivery' ||
      order.status === 'delivered_pending_confirmation' ||
      (order.driver_location_at &&
        Date.now() - new Date(order.driver_location_at).getTime() < 30 * 60 * 1000);
    res.json({
      orderId,
      lat: tracking && order.driver_lat != null ? Number(order.driver_lat) : null,
      lng: tracking && order.driver_lng != null ? Number(order.driver_lng) : null,
      at: tracking ? order.driver_location_at : null,
      trackingActive: Boolean(tracking && order.driver_lat != null),
    });
  } catch (e) {
    next(e);
  }
}

export async function completeOrder(req, res, next) {
  try {
    const driver = await resolveDriverByEmail(req.body?.email);
    const orderId = Number(req.params.id);
    const code = String(req.body.code || '').trim();
    const order = await orderRepo.getOrderById(orderId);
    if (!order || order.store_id !== driver.store_id) throw new AppError(404, 'Pedido não encontrado');
    if (order.driver_id && order.driver_id !== driver.id) throw new AppError(403, 'Pedido de outro entregador');

    // Gera código curto se ainda não houver (cliente vê no site / WhatsApp)
    let shortCode = order.delivery_confirmation_code;
    if (!shortCode) {
      shortCode = String(Math.floor(100000 + Math.random() * 900000));
      await query(`UPDATE orders SET delivery_confirmation_code = $2 WHERE id = $1`, [orderId, shortCode]);
    }

    if (code && code === shortCode) {
      await orderService.updateStatus(orderId, 'delivered', { storeId: driver.store_id });
      const run = await driverRepo.findRunByOrder(orderId);
      if (run) await driverRepo.updateRunStatus(run.id, driver.id, 'completed');
      return res.json({ orderId, status: 'delivered', delivered: true, clientConfirmed: true });
    }

    if (order.status !== 'delivered' && order.status !== 'delivered_pending_confirmation') {
      await orderService.updateStatus(orderId, 'delivered_pending_confirmation', { storeId: driver.store_id });
    }

    res.json({
      orderId,
      status: 'delivered_pending_confirmation',
      delivered: false,
      clientConfirmed: false,
      confirmationCode: shortCode,
    });
  } catch (e) {
    next(e);
  }
}

export async function history(req, res, next) {
  try {
    const driver = await resolveDriverByEmail(req.query.email);
    const from = String(req.query.from || '');
    const to = String(req.query.to || '');
    if (!from || !to) throw new AppError(400, 'from e to obrigatórios');
    const { rows } = await query(
      `SELECT o.id, o.customer_full_name, o.delivery_fee, o.status, o.updated_at,
              dr.completed_at, dr.status AS run_status
         FROM delivery_runs dr
         JOIN orders o ON o.id = dr.order_id
        WHERE dr.driver_id = $1
          AND (dr.status = 'completed' OR o.status = 'delivered')
          AND DATE(COALESCE(dr.completed_at, o.updated_at)) >= $2
          AND DATE(COALESCE(dr.completed_at, o.updated_at)) <= $3
        ORDER BY COALESCE(dr.completed_at, o.updated_at) DESC`,
      [driver.id, from, to]
    );
    res.json({
      items: rows.map((r) => ({
        orderId: r.id,
        orderNumber: r.id,
        customerName: r.customer_full_name,
        deliveryFee: Number(r.delivery_fee || 0),
        completedAt: r.completed_at || r.updated_at,
      })),
    });
  } catch (e) {
    next(e);
  }
}

/** Notifica o backend do app entregador (Hostinger) sobre atribuição. */
export async function notifyAppEntregadorAssignment(email, orderId) {
  const base = String(env.appEntregadorApiBaseUrl || process.env.APP_ENTREGADOR_API_BASE_URL || '').replace(/\/$/, '');
  const key = env.internalApiKey || process.env.INTERNAL_API_KEY || '';
  if (!base || !key) return;
  try {
    await fetch(`${base}/corridas/notify-assignment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': key,
      },
      body: JSON.stringify({ email, orderId }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('notify app entregador:', err.message);
  }
}
