import { getWhatsAppProvider } from '../integrations/whatsapp/index.js';
import * as logRepo from '../repositories/whatsappRepository.js';
import { env } from '../config/env.js';

const STATUS_LABEL = {
  received: 'Pedido recebido',
  preparing: 'Em preparo',
  out_for_delivery: 'Saiu para entrega',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

const PAY_LABEL = {
  pix_online: 'PIX (online)',
  pix_delivery: 'PIX (na entrega)',
  debit_card: 'Cartão de débito',
  credit_card: 'Cartão de crédito',
  cash: 'Dinheiro',
};

export function buildMenuLinkMessage(phoneDigits) {
  const base = env.publicMenuUrl.replace(/\/$/, '');
  const q = new URLSearchParams({ phone: phoneDigits }).toString();
  return `Olá! Acesse nosso cardápio digital:\n${base}/?${q}\n\nDigite *menu* a qualquer momento para ver as opções.`;
}

export function buildOrderConfirmationMessage(order, items) {
  const pay = PAY_LABEL[order.payment_method_code] || order.payment_method_code;
  const hasLocation = order.delivery_latitude != null && order.delivery_longitude != null;
  const locationUrl = hasLocation
    ? `https://www.google.com/maps?q=${Number(order.delivery_latitude)},${Number(order.delivery_longitude)}`
    : null;
  const lines = items
    .map(
      (i) =>
        `• ${i.quantity}x ${i.product_name} — R$ ${Number(i.line_total).toFixed(2)}` +
        (i.options_snapshot?.length
          ? ` (${i.options_snapshot.map((o) => o.name).join(', ')})`
          : '')
    )
    .join('\n');

  let extra = '';
  const meta = order.payment_meta || {};
  if (order.payment_method_code === 'cash') {
    if (meta.changeNeeded) {
      extra += `\nTroco para: R$ ${Number(meta.changeForAmount || 0).toFixed(2)}`;
    } else {
      extra += `\nSem necessidade de troco`;
    }
  }

  return (
    `✅ Pedido #${order.id} confirmado!\n\n` +
    `${lines}\n\n` +
    `Subtotal: R$ ${Number(order.subtotal).toFixed(2)}\n` +
    `Taxa entrega: R$ ${Number(order.delivery_fee).toFixed(2)}\n` +
    `*Total: R$ ${Number(order.total).toFixed(2)}*\n` +
    `Pagamento: ${pay}${extra}\n\n` +
    `Cliente: ${order.customer_full_name}\n` +
    `Telefone: ${order.customer_phone}\n\n` +
    `Entrega:\n${order.delivery_street}, ${order.delivery_number} — ${order.delivery_neighborhood}\n` +
    `CEP ${order.delivery_zip_code}\n` +
    (order.delivery_complement ? `${order.delivery_complement}\n` : '') +
    (order.delivery_reference ? `Referência: ${order.delivery_reference}\n` : '') +
    (locationUrl ? `Localização: ${locationUrl}\n` : '') +
    `\nStatus: ${STATUS_LABEL[order.status] || order.status}\n` +
    `Obrigado pela preferência!`
  );
}

export function buildStatusUpdateMessage(order) {
  return `Pedido #${order.id}: ${STATUS_LABEL[order.status] || order.status}`;
}

export async function sendMenuLink(toPhoneDigits, metadata = {}) {
  const provider = getWhatsAppProvider();
  const body = buildMenuLinkMessage(toPhoneDigits);
  const result = await provider.sendText({ to: toPhoneDigits, body, metadata });
  await logRepo.logMessage({
    orderId: null,
    templateKey: 'menu_link',
    toPhone: toPhoneDigits,
    body,
    providerRef: result.providerRef,
    payload: { ...metadata, raw: result.raw },
    status: 'sent',
  });
  return result;
}

export async function sendOrderConfirmation(order, items) {
  const provider = getWhatsAppProvider();
  const body = buildOrderConfirmationMessage(order, items);
  const digits = String(order.customer_phone).replace(/\D/g, '');
  const result = await provider.sendText({ to: digits, body, metadata: { orderId: order.id } });
  await logRepo.logMessage({
    orderId: order.id,
    templateKey: 'order_confirm',
    toPhone: digits,
    body,
    providerRef: result.providerRef,
    payload: { orderId: order.id, raw: result.raw },
    status: 'sent',
  });
  return result;
}

export async function sendStatusUpdate(order) {
  const provider = getWhatsAppProvider();
  const body = buildStatusUpdateMessage(order);
  const digits = String(order.customer_phone).replace(/\D/g, '');
  const result = await provider.sendText({ to: digits, body });
  await logRepo.logMessage({
    orderId: order.id,
    templateKey: 'status_update',
    toPhone: digits,
    body,
    providerRef: result.providerRef,
    payload: { orderId: order.id, status: order.status },
    status: 'sent',
  });
  return result;
}
