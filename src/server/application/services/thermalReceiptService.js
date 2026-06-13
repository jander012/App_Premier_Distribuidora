import { createRequire } from 'module';
import { env } from '../../infrastructure/config/env.js';
import { AppError } from '../../domain/shared/AppError.js';

const require = createRequire(import.meta.url);
const nt = require('node-thermal-printer');
const ThermalPrinter = nt.printer;
const PrinterTypes = nt.printerTypes || nt.types;
const CharacterSet = nt.characterSet;

function parsePrinterType(raw) {
  const r = String(raw || 'epson').toLowerCase();
  const map = {
    epson: PrinterTypes.EPSON,
    star: PrinterTypes.STAR,
    tanca: PrinterTypes.TANCA,
    daruma: PrinterTypes.DARUMA,
    brother: PrinterTypes.BROTHER,
    custom: PrinterTypes.CUSTOM,
  };
  return map[r] || PrinterTypes.EPSON;
}

function foldText(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\r\n/g, '\n');
}

function money(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : '0.00';
}

function formatItemOpts(snap) {
  if (!Array.isArray(snap) || snap.length === 0) return '';
  return snap
    .map((o) => {
      if (o == null) return '';
      if (typeof o === 'string') return o;
      return o.name || o.label || '';
    })
    .filter(Boolean)
    .join(', ');
}

function writeReceiptBody(printer, order, items) {
  printer.alignLeft();
  printer.drawLine();
  printer.println(`Cliente: ${foldText(order.customer_full_name || '-')}`);
  printer.println(`Tel: ${foldText(order.customer_phone || '-')}`);
  printer.drawLine();
  printer.bold(true);
  printer.println('ENTREGA');
  printer.bold(false);
  const addr = [
    order.delivery_street,
    order.delivery_number,
    order.delivery_neighborhood,
    order.delivery_zip_code,
    order.delivery_complement,
    order.delivery_reference,
  ]
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => foldText(x));
  printer.println(addr.length ? addr.join(', ') : '-');
  printer.drawLine();

  for (const it of items) {
    const name = foldText(it.product_name || '');
    const qty = Number(it.quantity) || 0;
    printer.println(`${qty}x ${name}`);
    const opts = formatItemOpts(it.options_snapshot);
    if (opts) printer.println(`   ${foldText(opts)}`);
    if (it.note) printer.println(`   Obs: ${foldText(it.note)}`);
    printer.println(`   R$ ${money(it.line_total)}`);
  }

  printer.drawLine();
  printer.println(`Subtotal    R$ ${money(order.subtotal)}`);
  printer.println(`Entrega     R$ ${money(order.delivery_fee)}`);
  if (Number(order.coupon_discount) > 0) {
    printer.println(`Cupom      -R$ ${money(order.coupon_discount)}`);
  }
  printer.bold(true);
  printer.println(`TOTAL       R$ ${money(order.total)}`);
  printer.bold(false);
  printer.println(`Pagamento: ${foldText(order.payment_method_code || '-')}`);
  printer.drawLine();
}

/**
 * Envia cupom ESC/POS para impressora em rede (ex.: tcp://192.168.0.50:9100).
 * Requer THERMAL_PRINTER_INTERFACE no .env do backend.
 */
export async function printOrderThermalReceipt(order, items) {
  const iface = env.thermalPrinterInterface;
  if (!iface) {
    throw new AppError(503, 'Impressora térmica não configurada (THERMAL_PRINTER_INTERFACE).', {
      code: 'THERMAL_NOT_CONFIGURED',
    });
  }

  const printer = new ThermalPrinter({
    type: parsePrinterType(env.thermalPrinterType),
    interface: iface,
    width: env.thermalPrinterWidth,
    characterSet: CharacterSet.PC860_PORTUGUESE,
    removeSpecialCharacters: false,
    lineCharacter: '-',
  });

  let connected = false;
  try {
    connected = await printer.isPrinterConnected();
  } catch (e) {
    throw new AppError(502, `Impressora inacessível: ${e.message || 'erro de rede'}`);
  }
  if (!connected) {
    throw new AppError(502, 'Impressora térmica não respondeu (verifique IP, porta 9100 e rede).');
  }

  printer.clear();
  printer.alignCenter();
  printer.bold(true);
  printer.println(`PEDIDO #${order.id}`);
  printer.bold(false);
  if (order.created_at) {
    printer.println(new Date(order.created_at).toLocaleString('pt-BR'));
  }
  writeReceiptBody(printer, order, items);
  printer.cut();

  try {
    await printer.execute();
  } catch (e) {
    throw new AppError(502, `Falha ao enviar para a impressora: ${e.message || 'execute'}`);
  }
}
