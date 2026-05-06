export const pickingoStubProvider = {
  async createDelivery({ order, items }) {
    return {
      status: 'sent',
      externalRef: `PICKINGO-STUB-${order.id}`,
      raw: {
        message: 'Entrega simulada para Pickingo. Configure PICKINGO_PROVIDER real quando houver documentação.',
        orderId: order.id,
        itemCount: items.length,
        hasCoordinates: order.delivery_latitude != null && order.delivery_longitude != null,
      },
    };
  },
};
