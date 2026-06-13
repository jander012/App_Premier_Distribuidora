import * as whatsappService from '../../../application/services/whatsappService.js';
import * as orderService from '../../../application/services/orderService.js';
import * as orderRepo from '../../../infrastructure/repositories/orderRepository.js';

export async function sendMenuLink(req, res, next) {
  try {
    const { phone, customerName } = req.body;
    const result = await whatsappService.sendMenuLink(String(phone).replace(/\D/g, ''), {
      customerName,
    });
    res.json({ ok: true, providerRef: result.providerRef });
  } catch (e) {
    next(e);
  }
}

export async function sendOrderConfirmation(req, res, next) {
  try {
    const { orderId } = req.body;
    const { order, items } = await orderService.getOrder(Number(orderId));
    const result = await whatsappService.sendOrderConfirmation(order, items);
    res.json({ ok: true, providerRef: result.providerRef });
  } catch (e) {
    next(e);
  }
}

export async function sendStatusUpdate(req, res, next) {
  try {
    const order = await orderRepo.getOrderById(Number(req.body.orderId));
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
    const result = await whatsappService.sendStatusUpdate(order);
    res.json({ ok: true, providerRef: result.providerRef });
  } catch (e) {
    next(e);
  }
}
