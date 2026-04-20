/**
 * MVP: retorna payload simulado. Trocar por PSP (Mercado Pago, Gerencianet, etc.).
 */
export const pixStubProvider = {
  async createCharge({ orderId, amount, customer }) {
    return {
      status: 'pending',
      provider: 'stub',
      providerRef: `PIX-STUB-${orderId}-${Date.now()}`,
      copyPaste: '00020126580014br.gov.bcb.pix0136stub-mvp5204000053039865802BR5925DELIVERY6009SAO PAULO62070503***6304ABCD',
      qrCodeBase64: null,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      meta: { orderId, amount, customerEmail: customer?.email },
    };
  },
};
