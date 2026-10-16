import bcrypt from 'bcryptjs';
import * as driverRepo from '../../../infrastructure/repositories/driverRepository.js';
import * as orderRepo from '../../../infrastructure/repositories/orderRepository.js';
import * as tokenService from '../../../application/services/tokenService.js';
import * as entregadoresSync from '../../../application/services/entregadoresSyncService.js';
import { AppError } from '../../../domain/shared/AppError.js';

function publicDriver(row) {
  if (!row) return null;
  return {
    id: row.id,
    storeId: row.store_id,
    name: row.name,
    cpf: row.cpf,
    phone: row.phone || '',
    vehicleDescription: row.vehicle_description,
    vehiclePhotoUrl: row.vehicle_photo_url,
    username: row.username,
    active: row.active !== false,
    isDefault: Boolean(row.is_default),
    externalEmail: row.external_email || null,
    externalSource: row.external_source || null,
  };
}

function remoteCadastroError() {
  const url = entregadoresSync.cadastroUrl();
  return new AppError(
    400,
    url
      ? `Cadastre ou edite entregadores em ${url}. Aqui só é possível definir o padrão e usar nos pedidos.`
      : 'Cadastre os entregadores no sistema Premier (enviar_dados_entregador). Aqui só é possível definir o padrão.'
  );
}

function digitsPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function runPayload(row, { hideCustomer = false } = {}) {
  if (!row) return null;
  const completed = row.status === 'completed' || row.order_status === 'delivered';
  const hide = hideCustomer || completed;
  return {
    id: row.id,
    orderId: row.order_id,
    status: row.status,
    orderStatus: row.order_status,
    driverId: row.driver_id,
    driverName: row.driver_name,
    acceptedAt: row.accepted_at,
    completedAt: row.completed_at,
    total: row.total != null ? Number(row.total) : null,
    orderCreatedAt: row.order_created_at,
    customer: hide
      ? null
      : {
          fullName: row.customer_full_name,
          phone: row.customer_phone,
        },
    delivery: hide
      ? null
      : {
          street: row.delivery_street,
          number: row.delivery_number,
          neighborhood: row.delivery_neighborhood,
          zipCode: row.delivery_zip_code,
          complement: row.delivery_complement,
          reference: row.delivery_reference,
          latitude: row.delivery_latitude != null ? Number(row.delivery_latitude) : null,
          longitude: row.delivery_longitude != null ? Number(row.delivery_longitude) : null,
          locationUrl:
            row.delivery_latitude != null && row.delivery_longitude != null
              ? `https://www.google.com/maps?q=${Number(row.delivery_latitude)},${Number(row.delivery_longitude)}`
              : null,
        },
  };
}

export async function adminListDrivers(req, res, next) {
  try {
    const sync = req.query.sync !== '0' && req.query.sync !== 'false';
    let syncMeta = null;
    if (sync && entregadoresSync.remoteEntregadoresEnabled()) {
      try {
        const result = await entregadoresSync.syncStoreDriversFromPremier(req.storeId);
        syncMeta = {
          source: result.source,
          cadastroUrl: result.cadastroUrl,
          remoteCount: result.remoteCount,
        };
      } catch (syncErr) {
        // Continua com espelho local se a API remota falhar.
        syncMeta = {
          source: 'local-cache',
          cadastroUrl: entregadoresSync.cadastroUrl(),
          syncError: syncErr.message,
        };
      }
    } else if (entregadoresSync.remoteEntregadoresEnabled()) {
      syncMeta = { source: 'premier', cadastroUrl: entregadoresSync.cadastroUrl() };
    }
    const rows = await driverRepo.listDrivers(req.storeId);
    res.json({
      drivers: rows.map(publicDriver),
      remoteConfigured: entregadoresSync.remoteEntregadoresEnabled(),
      cadastroUrl: entregadoresSync.cadastroUrl() || null,
      sync: syncMeta,
    });
  } catch (e) {
    next(e);
  }
}

export async function adminSyncDrivers(req, res, next) {
  try {
    if (!entregadoresSync.remoteEntregadoresEnabled()) {
      throw new AppError(503, 'API de entregadores não configurada (ENTREGADORES_API_BASE_URL).');
    }
    const result = await entregadoresSync.syncStoreDriversFromPremier(req.storeId);
    res.json({
      drivers: result.drivers.map(publicDriver),
      remoteConfigured: true,
      cadastroUrl: result.cadastroUrl || null,
      sync: { source: result.source, remoteCount: result.remoteCount },
    });
  } catch (e) {
    next(e);
  }
}

export async function adminCreateDriver(req, res, next) {
  try {
    if (entregadoresSync.remoteEntregadoresEnabled()) throw remoteCadastroError();
    const password = String(req.body.password || '').trim();
    if (password.length < 4) throw new AppError(400, 'Informe uma senha com pelo menos 4 caracteres.');
    const phone = digitsPhone(req.body.phone);
    if (phone && phone.length < 10) throw new AppError(400, 'Informe um WhatsApp válido com DDD.');
    const row = await driverRepo.createDriver(req.storeId, {
      name: String(req.body.name || '').trim(),
      cpf: String(req.body.cpf || '').trim(),
      phone: phone || null,
      vehicleDescription: String(req.body.vehicleDescription || req.body.vehicle_description || '').trim(),
      vehiclePhotoUrl: String(req.body.vehiclePhotoUrl || req.body.vehicle_photo_url || '').trim(),
      username: String(req.body.username || '').trim().toLowerCase(),
      passwordHash: await bcrypt.hash(password, 10),
      active: req.body.active !== false,
      isDefault: Boolean(req.body.isDefault ?? req.body.is_default),
    });
    res.status(201).json(publicDriver(row));
  } catch (e) {
    next(e);
  }
}

export async function adminUpdateDriver(req, res, next) {
  try {
    const id = Number(req.params.id);
    const current = await driverRepo.findDriverById(id, req.storeId);
    if (!current) return res.status(404).json({ error: 'Entregador não encontrado' });

    // Com cadastro remoto: só permite marcar/desmarcar padrão (dados vêm do Premier).
    if (entregadoresSync.remoteEntregadoresEnabled() || current.external_source === 'premier') {
      if (req.body.isDefault === true || req.body.is_default === true) {
        await driverRepo.setDefaultDriver(req.storeId, id);
      } else if (req.body.isDefault === false || req.body.is_default === false) {
        if (current.is_default) await driverRepo.setDefaultDriver(req.storeId, null);
      } else {
        throw remoteCadastroError();
      }
      return res.json(publicDriver(await driverRepo.findDriverById(id, req.storeId)));
    }

    const patch = {};
    for (const k of ['name', 'cpf', 'username']) {
      if (req.body[k] !== undefined) patch[k] = String(req.body[k] || '').trim();
    }
    if (req.body.phone !== undefined) {
      const phone = digitsPhone(req.body.phone);
      if (phone && phone.length < 10) throw new AppError(400, 'Informe um WhatsApp válido com DDD.');
      patch.phone = phone || null;
    }
    if (req.body.vehicleDescription !== undefined || req.body.vehicle_description !== undefined) {
      patch.vehicleDescription = String(req.body.vehicleDescription ?? req.body.vehicle_description ?? '').trim();
    }
    if (req.body.vehiclePhotoUrl !== undefined || req.body.vehicle_photo_url !== undefined) {
      patch.vehiclePhotoUrl = String(req.body.vehiclePhotoUrl ?? req.body.vehicle_photo_url ?? '').trim();
    }
    if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
    if (req.body.password) patch.passwordHash = await bcrypt.hash(String(req.body.password), 10);
    const row = await driverRepo.updateDriver(id, req.storeId, patch);
    if (!row) return res.status(404).json({ error: 'Entregador não encontrado' });
    if (req.body.isDefault === true || req.body.is_default === true) {
      await driverRepo.setDefaultDriver(req.storeId, id);
    } else if (req.body.isDefault === false || req.body.is_default === false) {
      if (row.is_default) await driverRepo.setDefaultDriver(req.storeId, null);
    }
    res.json(publicDriver(await driverRepo.findDriverById(id, req.storeId)));
  } catch (e) {
    next(e);
  }
}

export async function adminSetDefaultDriver(req, res, next) {
  try {
    const driverId = req.body?.driverId != null ? Number(req.body.driverId) : null;
    if (driverId != null && !Number.isFinite(driverId)) {
      throw new AppError(400, 'Entregador inválido');
    }
    const row = await driverRepo.setDefaultDriver(req.storeId, driverId);
    if (driverId != null && !row) return res.status(404).json({ error: 'Entregador não encontrado ou inativo' });
    const drivers = await driverRepo.listDrivers(req.storeId);
    res.json({ defaultDriver: publicDriver(row), drivers: drivers.map(publicDriver) });
  } catch (e) {
    next(e);
  }
}

export async function adminAssignOrderDriver(req, res, next) {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isFinite(orderId)) throw new AppError(400, 'Pedido inválido');
    const raw = req.body?.driverId ?? req.body?.driver_id;
    const driverId = raw === null || raw === '' || raw === undefined ? null : Number(raw);
    if (driverId != null && !Number.isFinite(driverId)) throw new AppError(400, 'Entregador inválido');
    const order = await orderRepo.getOrderById(orderId);
    if (!order || order.store_id !== req.storeId) throw new AppError(404, 'Pedido não encontrado');
    const run = await driverRepo.assignDriverToOrder(orderId, req.storeId, driverId);
    if (driverId != null && !run?.driver_id) throw new AppError(404, 'Entregador não encontrado ou inativo');
    if (driverId != null && run?.driver_id) {
      try {
        const { notifyAppEntregadorAssignment } = await import('./internalEntregadorController.js');
        const driver = await driverRepo.findDriverById(run.driver_id, req.storeId);
        const email = driver?.external_email || driver?.username;
        if (email) await notifyAppEntregadorAssignment(email, orderId);
      } catch (notifyErr) {
        // eslint-disable-next-line no-console
        console.warn('notify app entregador:', notifyErr.message);
      }
    }
    res.json({
      orderId,
      driverId: run?.driver_id ?? null,
      driverName: run?.driver_name || null,
      driverPhone: run?.driver_phone || null,
      runStatus: run?.status || null,
    });
  } catch (e) {
    next(e);
  }
}

export async function adminListRuns(req, res, next) {
  try {
    const rows = await driverRepo.listRunsForAdmin(req.storeId);
    res.json(rows.map((r) => runPayload(r)));
  } catch (e) {
    next(e);
  }
}

/** Lista logins SSO vinculados ao entregador (N logins → 1 cadastro). */
export async function adminListDriverSsoLogins(req, res, next) {
  try {
    const driverId = Number(req.params.id);
    const driver = await driverRepo.findDriverById(driverId, req.storeId);
    if (!driver) throw new AppError(404, 'Entregador não encontrado');
    const logins = await driverRepo.listSsoLogins(driverId, req.storeId);
    res.json({
      driverId,
      driver: publicDriver(driver),
      logins: logins.map((l) => ({
        id: l.id,
        email: l.email,
        ssoSub: l.sso_sub,
        label: l.label,
        createdAt: l.created_at,
      })),
    });
  } catch (e) {
    next(e);
  }
}

export async function adminAddDriverSsoLogin(req, res, next) {
  try {
    const driverId = Number(req.params.id);
    const email = String(req.body?.email || '').trim();
    const label = String(req.body?.label || '').trim() || null;
    const ssoSub = req.body?.ssoSub != null ? String(req.body.ssoSub) : null;
    const logins = await driverRepo.addSsoLogin(driverId, req.storeId, { email, ssoSub, label });
    if (!logins) throw new AppError(404, 'Entregador não encontrado');
    res.status(201).json({
      driverId,
      logins: logins.map((l) => ({
        id: l.id,
        email: l.email,
        ssoSub: l.sso_sub,
        label: l.label,
        createdAt: l.created_at,
      })),
    });
  } catch (e) {
    if (e.status) return next(new AppError(e.status, e.message));
    next(e);
  }
}

export async function adminRemoveDriverSsoLogin(req, res, next) {
  try {
    const driverId = Number(req.params.id);
    const loginId = Number(req.params.loginId);
    const driver = await driverRepo.findDriverById(driverId, req.storeId);
    if (!driver) throw new AppError(404, 'Entregador não encontrado');
    const logins = await driverRepo.removeSsoLogin(driverId, req.storeId, loginId);
    res.json({
      driverId,
      logins: logins.map((l) => ({
        id: l.id,
        email: l.email,
        ssoSub: l.sso_sub,
        label: l.label,
        createdAt: l.created_at,
      })),
    });
  } catch (e) {
    next(e);
  }
}

export async function driverLogin(req, res, next) {
  try {
    const storeId = Number(req.body.storeId || req.body.store_id || 1);
    const username = String(req.body.username || '').trim().toLowerCase();
    const row = await driverRepo.findDriverByUsername(storeId, username);
    if (!row) throw new AppError(401, 'Credenciais inválidas');
    const ok = await bcrypt.compare(String(req.body.password || ''), row.password_hash);
    if (!ok) throw new AppError(401, 'Credenciais inválidas');
    res.json({ token: tokenService.signDriverToken(row.id, row.store_id, row.password_hash), driver: publicDriver(row) });
  } catch (e) {
    next(e);
  }
}

export async function driverMe(req, res, next) {
  try {
    const row = await driverRepo.findDriverById(req.driverId, req.storeId);
    if (!row) throw new AppError(404, 'Entregador não encontrado');
    res.json(publicDriver(row));
  } catch (e) {
    next(e);
  }
}

export async function driverListRuns(req, res, next) {
  try {
    const available = await driverRepo.listAvailableRuns(req.storeId);
    const mine = await driverRepo.listRunsForDriver(req.driverId);
    res.json({
      available: available.map((r) => runPayload(r)),
      mine: mine.map((r) => runPayload(r, { hideCustomer: r.status === 'completed' || r.order_status === 'delivered' })),
    });
  } catch (e) {
    next(e);
  }
}

export async function driverAcceptRun(req, res, next) {
  try {
    const row = await driverRepo.acceptRun(Number(req.params.id), req.driverId, req.storeId);
    if (!row || row.driver_id !== req.driverId) throw new AppError(409, 'Corrida indisponível.');
    await orderRepo.updateOrderStatus(row.order_id, 'out_for_delivery', req.storeId);
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function driverUpdateRun(req, res, next) {
  try {
    const status = String(req.body.status || '').trim();
    if (!['picked_up', 'completed'].includes(status)) throw new AppError(400, 'Status inválido');
    const row = await driverRepo.updateRunStatus(Number(req.params.id), req.driverId, status);
    if (!row) throw new AppError(404, 'Corrida não encontrada');
    if (status === 'completed') await orderRepo.updateOrderStatus(row.order_id, 'delivered', req.storeId);
    res.json(row);
  } catch (e) {
    next(e);
  }
}

export async function listOrderMessages(req, res, next) {
  try {
    const order = await orderRepo.getOrderById(Number(req.params.id));
    if (!order) throw new AppError(404, 'Pedido não encontrado');
    if (req.clientPhone && order.customer_phone !== req.clientPhone) throw new AppError(403, 'Acesso negado');
    if (req.driverId) {
      const run = await driverRepo.findRunByOrder(order.id);
      if (!run || run.driver_id !== req.driverId || run.status === 'completed' || order.status === 'delivered') {
        throw new AppError(403, 'Acesso negado');
      }
    }
    res.json(await driverRepo.listMessages(order.id));
  } catch (e) {
    next(e);
  }
}

export async function addOrderMessage(req, res, next) {
  try {
    const order = await orderRepo.getOrderById(Number(req.params.id));
    if (!order) throw new AppError(404, 'Pedido não encontrado');
    if (order.status === 'delivered' || order.status === 'cancelled') {
      throw new AppError(400, 'Conversa encerrada para este pedido.');
    }
    const body = String(req.body.body || '').trim();
    if (!body) throw new AppError(400, 'Mensagem vazia');
    if (req.clientPhone) {
      if (order.customer_phone !== req.clientPhone) throw new AppError(403, 'Acesso negado');
      return res.status(201).json(await driverRepo.addMessage(order.id, 'client', null, body));
    }
    if (req.driverId) {
      const run = await driverRepo.findRunByOrder(order.id);
      if (!run || run.driver_id !== req.driverId || run.status === 'completed') throw new AppError(403, 'Acesso negado');
      if (!(await driverRepo.hasClientMessage(order.id))) {
        throw new AppError(403, 'Aguarde o primeiro contato do cliente para responder.');
      }
      return res.status(201).json(await driverRepo.addMessage(order.id, 'driver', req.driverId, body));
    }
    throw new AppError(401, 'Sessão inválida');
  } catch (e) {
    next(e);
  }
}

export async function addOrderReview(req, res, next) {
  try {
    const order = await orderRepo.getOrderById(Number(req.params.id));
    if (!order) throw new AppError(404, 'Pedido não encontrado');
    if (req.clientPhone && order.customer_phone !== req.clientPhone) throw new AppError(403, 'Acesso negado');
    if (order.status !== 'delivered') throw new AppError(400, 'Avaliação disponível após entrega.');
    const targetType = String(req.body.targetType || '').trim();
    if (!['driver', 'store', 'product'].includes(targetType)) throw new AppError(400, 'Tipo de avaliação inválido');
    const rating = Math.min(5, Math.max(1, Number(req.body.rating) || 0));
    if (!rating) throw new AppError(400, 'Informe a nota.');
    const run = await driverRepo.findRunByOrder(order.id);
    await driverRepo.upsertReview({
      orderId: order.id,
      storeId: order.store_id,
      driverId: targetType === 'driver' ? run?.driver_id ?? order.driver_id ?? null : null,
      targetType,
      rating,
      comment: String(req.body.comment || '').trim(),
    });
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
}
