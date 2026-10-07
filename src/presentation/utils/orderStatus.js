export const STATUS_LABELS = {
  received: 'Recebido',
  preparing: 'Em preparo',
  out_for_delivery: 'Saiu para entrega',
  delivered_pending_confirmation: 'Aguardando sua confirmação',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export const STATUS_DESCRIPTIONS = {
  received: 'A loja recebeu seu pedido e logo vai começar a separar.',
  preparing: 'Seu pedido está sendo separado e preparado.',
  out_for_delivery: 'O entregador está a caminho do seu endereço.',
  delivered_pending_confirmation: 'O entregador informou a entrega. Confirme pelo link enviado no WhatsApp.',
  delivered: 'Pedido entregue. Obrigado pela preferência!',
  cancelled: 'Este pedido foi cancelado. Em caso de dúvida, fale com a loja.',
};

/** Etapas exibidas na linha do tempo (cancelado é tratado à parte). */
export const ORDER_STEPS = ['received', 'preparing', 'out_for_delivery', 'delivered'];

export const PAYMENT_LABELS = {
  pix_online: 'PIX online',
  pix_delivery: 'PIX na entrega',
  debit_card: 'Cartão de débito na entrega',
  credit_card: 'Cartão de crédito na entrega',
  cash: 'Dinheiro',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

export function isOrderActive(status) {
  return status !== 'delivered' && status !== 'cancelled';
}

/** Índice da etapa atual na linha do tempo (aguardando confirmação conta como "a caminho" concluído). */
export function stepIndex(status) {
  if (status === 'delivered_pending_confirmation') return 3;
  const i = ORDER_STEPS.indexOf(status);
  return i < 0 ? 0 : i;
}

export function formatMoney(v) {
  return `R$ ${Number(v || 0).toFixed(2).replace('.', ',')}`;
}

export function formatDateTime(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
