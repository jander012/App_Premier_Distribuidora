import * as orderService from '../services/orderService.js';
import * as storeRepo from '../repositories/storeRepository.js';

export async function create(req, res, next) {
  try {
    const result = await orderService.createOrder(req.body, {
      verifiedPhone: req.clientPhone,
      verifiedCartId: req.cartId,
    });
    res.status(201).json({
      order: formatOrder(result.order),
      items: result.items.map(formatItem),
      pixCharge: result.pixCharge,
    });
  } catch (e) {
    next(e);
  }
}

export async function getOne(req, res, next) {
  try {
    const { order, items } = await orderService.getOrderForClient(
      Number(req.params.id),
      req.clientPhone
    );
    res.json({ order: formatOrder(order), items: items.map(formatItem) });
  } catch (e) {
    next(e);
  }
}

export async function listMine(req, res, next) {
  try {
    let storeId = null;
    const slug = req.query.storeSlug;
    if (slug != null && String(slug).trim() !== '') {
      const store = await storeRepo.findStoreBySlug(String(slug).trim());
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
      storeId = store.id;
    }
    const orders = await orderService.listByPhone(req.clientPhone, storeId);
    res.json(orders.map(formatOrder));
  } catch (e) {
    next(e);
  }
}

export async function patchStatus(req, res, next) {
  try {
    const order = await orderService.updateStatus(Number(req.params.id), req.body.status, {
      notify: req.body.notify !== false,
      storeId: req.storeId ?? null,
    });
    res.json(formatOrder(order));
  } catch (e) {
    next(e);
  }
}

export function formatOrder(o) {
  return {
    id: o.id,
    customerId: o.customer_id,
    status: o.status,
    subtotal: Number(o.subtotal),
    deliveryFee: Number(o.delivery_fee),
    couponDiscount: o.coupon_discount != null ? Number(o.coupon_discount) : 0,
    total: Number(o.total),
    paymentMethodCode: o.payment_method_code,
    paymentMeta: o.payment_meta,
    delivery: {
      street: o.delivery_street,
      number: o.delivery_number,
      neighborhood: o.delivery_neighborhood,
      zipCode: o.delivery_zip_code,
      complement: o.delivery_complement,
      reference: o.delivery_reference,
    },
    customer: {
      fullName: o.customer_full_name,
      cpf: o.customer_cpf,
      email: o.customer_email,
      phone: o.customer_phone,
    },
    createdAt: o.created_at,
  };
}

export function formatItem(i) {
  return {
    id: i.id,
    productId: i.product_id,
    productName: i.product_name,
    unitPrice: Number(i.unit_price),
    quantity: i.quantity,
    note: i.note,
    optionsSnapshot: i.options_snapshot,
    lineTotal: Number(i.line_total),
  };
}
