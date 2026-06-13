import { getPixProvider } from '../../infrastructure/integrations/pix/index.js';
import * as orderRepo from '../../infrastructure/repositories/orderRepository.js';
import { AppError } from '../../domain/shared/AppError.js';

const ALLOWED = new Set([
  'pix_online',
  'pix_delivery',
  'debit_card',
  'credit_card',
  'cash',
]);

export function assertPaymentMethod(code) {
  if (!ALLOWED.has(code)) {
    throw new AppError(400, 'Forma de pagamento inválida');
  }
}

export function normalizePaymentMeta(methodCode, meta = {}) {
  const m = { ...meta };
  if (methodCode === 'cash') {
    if (typeof m.changeNeeded !== 'boolean') {
      throw new AppError(400, 'Para dinheiro, informe changeNeeded (true/false)');
    }
    if (m.changeNeeded === true) {
      const v = Number(m.changeForAmount);
      if (!Number.isFinite(v) || v <= 0) {
        throw new AppError(400, 'Informe changeForAmount (> 0) quando precisar de troco');
      }
    }
  }
  return m;
}

export async function createPixOnlinePayment(order) {
  if (order.payment_method_code !== 'pix_online') {
    throw new AppError(400, 'Pedido não é PIX online');
  }
  const pix = getPixProvider();
  const charge = await pix.createCharge({
    orderId: order.id,
    amount: Number(order.total),
    customer: { email: order.customer_email, name: order.customer_full_name },
  });
  await orderRepo.insertPayment({
    orderId: order.id,
    methodCode: 'pix_online',
    amount: order.total,
    status: 'pending',
    provider: charge.provider,
    providerRef: charge.providerRef,
    meta: charge,
  });
  return charge;
}

export async function attachCashMeta(orderId, meta) {
  const order = await orderRepo.getOrderById(orderId);
  if (!order) throw new AppError(404, 'Pedido não encontrado');
  normalizePaymentMeta('cash', meta);
  // MVP: apenas validação; valores já estão em orders.payment_meta na criação
  return order;
}
