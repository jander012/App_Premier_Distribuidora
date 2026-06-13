export const linxStubProvider = {
  async sendOrder({ order, items }) {
    return {
      status: 'sent',
      externalRef: `LINX-STUB-${order.id}`,
      raw: {
        message: 'Pedido simulado para Linx POS. Configure LINX_PROVIDER real quando houver documentação.',
        orderId: order.id,
        itemCount: items.length,
      },
    };
  },

  async importProducts() {
    return {
      status: 'not_configured',
      products: [],
      raw: {
        message: 'Importação simulada. A API/layout do Linx POS ainda não foi configurada.',
      },
    };
  },
};
