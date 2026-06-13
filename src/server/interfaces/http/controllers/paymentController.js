import * as paymentService from '../../../application/services/paymentService.js';
import * as orderService from '../../../application/services/orderService.js';

export async function pix(req, res, next) {
  try {
    const { orderId } = req.body;
    const { order } = await orderService.getOrder(Number(orderId));
    const charge = await paymentService.createPixOnlinePayment(order);
    res.status(201).json(charge);
  } catch (e) {
    next(e);
  }
}

export async function cash(req, res, next) {
  try {
    await paymentService.attachCashMeta(Number(req.body.orderId), req.body);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

export async function cardOnDelivery(req, res, next) {
  try {
    res.status(201).json({
      ok: true,
      message: 'MVP: pagamento na entrega registrado no pedido',
      orderId: req.body.orderId,
      method: req.body.methodCode || 'credit_card',
    });
  } catch (e) {
    next(e);
  }
}
