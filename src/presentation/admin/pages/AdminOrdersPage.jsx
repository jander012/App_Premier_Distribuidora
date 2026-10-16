import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

const KANBAN_COLS = [
  { key: 'received', title: 'Recebido', statuses: ['received'] },
  { key: 'preparing', title: 'Em preparo', statuses: ['preparing'] },
  { key: 'andamento', title: 'Em andamento', statuses: ['out_for_delivery', 'delivered_pending_confirmation'] },
];

const STATUS_LABEL = {
  received: 'Recebido',
  preparing: 'Em preparo',
  out_for_delivery: 'Saiu para entrega',
  delivered_pending_confirmation: 'Aguardando confirmação',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

function statusLabel(status) {
  return STATUS_LABEL[status] || status;
}

function escHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatElapsed(from, to = Date.now()) {
  if (!from) return '—';
  const ms = Math.max(0, new Date(to).getTime() - new Date(from).getTime());
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}min`;
}

function formatClock(from) {
  if (!from) return '—';
  return new Date(from).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function orderCreatedAt(row) {
  return row.created_at || row.createdAt || null;
}

function orderCustomerName(row) {
  return (
    row.customer_full_name ||
    row.customer?.fullName ||
    row.customer?.full_name ||
    ''
  ).trim();
}

function orderCustomerPhone(row) {
  return row.customer_phone || row.customer?.phone || '';
}

function orderClaimCode(orderId) {
  return String(orderId);
}

function formatMoney(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : '—';
}

/** Cupom 80mm com QR + código de barras + itens. */
function buildOrderPrintHtml(order, items = []) {
  const code = orderClaimCode(order.id);
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=8&data=${encodeURIComponent(code)}`;
  const barcodeUrl = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(code)}&scale=2&height=12&includetext&textsize=10`;
  const created =
    order.createdAt || order.created_at
      ? escHtml(new Date(order.createdAt || order.created_at).toLocaleString('pt-BR'))
      : '—';
  const cust = order.customer || {};
  const del = order.delivery || {};
  const phone = cust.phone || order.customer_phone || '—';
  const name = cust.fullName || cust.full_name || order.customer_full_name || '—';
  const addr = [
    del.street || order.delivery_street,
    del.number || order.delivery_number,
    del.neighborhood || order.delivery_neighborhood,
    del.zipCode || order.delivery_zip_code,
    del.complement || order.delivery_complement,
    del.reference || order.delivery_reference,
  ]
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => escHtml(String(x).trim()))
    .join(', ');

  const itemBlocks = (items || [])
    .map((i) => {
      const qty = i.quantity ?? i.qty ?? 1;
      const pname = escHtml(i.productName || i.product_name || 'Item');
      const total = formatMoney(i.lineTotal ?? i.line_total ?? i.total);
      return `<div><b>${escHtml(String(qty))}x</b> ${pname}</div><div class="s indent">R$ ${total}</div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"/>
<title>Pedido #${escHtml(code)}</title>
<style>
  @page { size: 80mm auto; margin: 2mm; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 11pt; line-height: 1.35; color: #000; background: #fff;
    max-width: 72mm; margin: 0 auto; padding: 2mm 3mm 8mm;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .c { text-align: center; font-weight: 700; font-size: 13pt; margin-bottom: 0.2rem; }
  .s { font-size: 9.5pt; color: #222; }
  .h { font-weight: 700; margin-top: 0.35rem; margin-bottom: 0.15rem; font-size: 10pt; }
  .rule { border-top: 1px dashed #000; margin: 0.4rem 0; }
  .indent { padding-left: 0.35rem; }
  .row { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 10pt; margin: 0.12rem 0; }
  .row.total { font-weight: 700; font-size: 11pt; margin-top: 0.35rem; }
  .scan { text-align: center; margin: 0.4rem 0; }
  .scan img.qr { width: 42mm; height: 42mm; image-rendering: pixelated; }
  .scan img.bc { width: 62mm; height: auto; max-height: 18mm; }
  .code { font-size: 18pt; font-weight: 700; letter-spacing: 0.12em; margin: 0.25rem 0; }
  .hint { font-size: 8.5pt; }
</style></head>
<body>
  <div class="c">PEDIDO #${escHtml(code)}</div>
  <div class="s" style="text-align:center">${created}</div>
  <div class="s" style="text-align:center">${escHtml(statusLabel(order.status || ''))}</div>
  <div class="rule"></div>
  <div class="scan">
    <img class="qr" src="${qrUrl}" alt="QR ${escHtml(code)}" />
    <div class="code">${escHtml(code)}</div>
    <img class="bc" src="${barcodeUrl}" alt="Barras ${escHtml(code)}" />
    <div class="hint">Bipe o QR ou o código de barras no app</div>
  </div>
  <div class="rule"></div>
  <div>${escHtml(String(name))}</div>
  <div class="s">Tel. ${escHtml(String(phone))}</div>
  <div class="h">ENTREGA</div>
  <div class="s">${addr || '—'}</div>
  <div class="rule"></div>
  ${itemBlocks || '<div class="s">—</div>'}
  <div class="rule"></div>
  <div class="row"><span>Subtotal</span><span>R$ ${formatMoney(order.subtotal)}</span></div>
  <div class="row"><span>Entrega</span><span>R$ ${formatMoney(order.deliveryFee ?? order.delivery_fee)}</span></div>
  ${
    Number(order.couponDiscount ?? order.coupon_discount) > 0
      ? `<div class="row"><span>Cupom</span><span>− R$ ${formatMoney(order.couponDiscount ?? order.coupon_discount)}</span></div>`
      : ''
  }
  <div class="row total"><span>TOTAL</span><span>R$ ${formatMoney(order.total)}</span></div>
  <div class="s">Pag.: ${escHtml(order.paymentMethodCode || order.payment_method_code || '—')}</div>
  <div class="rule"></div>
</body></html>`;
}

function printHtml(html, title) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', title || 'Impressão');
  Object.assign(iframe.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
    border: '0',
    zIndex: '-1',
  });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const win = iframe.contentWindow;
  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };
  win.addEventListener('afterprint', cleanup, { once: true });

  const doPrint = () => {
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };

  // Espera QR e código de barras carregarem antes de imprimir
  const imgs = Array.from(doc.images || []);
  if (!imgs.length) {
    setTimeout(doPrint, 200);
  } else {
    let left = imgs.length;
    const done = () => {
      left -= 1;
      if (left <= 0) setTimeout(doPrint, 100);
    };
    imgs.forEach((img) => {
      if (img.complete) done();
      else {
        img.addEventListener('load', done, { once: true });
        img.addEventListener('error', done, { once: true });
      }
    });
    setTimeout(doPrint, 4000);
  }
  setTimeout(cleanup, 120000);
}

function colForStatus(status) {
  if (status === 'received') return 'received';
  if (status === 'preparing') return 'preparing';
  if (status === 'out_for_delivery' || status === 'delivered_pending_confirmation') return 'andamento';
  return null;
}

function targetStatusForCol(colKey) {
  if (colKey === 'received') return 'received';
  if (colKey === 'preparing') return 'preparing';
  if (colKey === 'andamento') return 'out_for_delivery';
  return null;
}

export function AdminOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [view, setView] = useState('kanban'); // kanban | historico
  const [err, setErr] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const pollRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  const loadKanban = useCallback(async () => {
    setErr(null);
    try {
      const res = await api.get('/admin/orders?limit=200&page=1', { headers: adminHeaders() });
      const items = res.items || [];
      setOrders(items.filter((o) => colForStatus(o.status)));
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setErr(null);
    try {
      const [del, can] = await Promise.all([
        api.get('/admin/orders?limit=100&page=1&status=delivered', { headers: adminHeaders() }),
        api.get('/admin/orders?limit=50&page=1&status=cancelled', { headers: adminHeaders() }),
      ]);
      const items = [...(del.items || []), ...(can.items || [])].sort(
        (a, b) => new Date(b.created_at || b.createdAt || 0) - new Date(a.created_at || a.createdAt || 0)
      );
      setHistory(items);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    if (view === 'kanban') {
      loadKanban();
      pollRef.current = setInterval(loadKanban, 15000);
      return () => clearInterval(pollRef.current);
    }
    loadHistory();
    return undefined;
  }, [view, loadKanban, loadHistory]);

  const columns = useMemo(() => {
    const map = { received: [], preparing: [], andamento: [] };
    for (const o of orders) {
      const c = colForStatus(o.status);
      if (c) map[c].push(o);
    }
    return map;
  }, [orders]);

  async function printOrder(row) {
    setBusyId(row.id);
    setErr(null);
    try {
      // Preferência: térmica ESC/POS (QR + código de barras nativos)
      try {
        await api.post(`/admin/orders/${row.id}/print-thermal`, {}, { headers: adminHeaders() });
        return;
      } catch {
        /* fallback navegador */
      }
      let order = row;
      let items = [];
      try {
        const detail = await api.get(`/admin/orders/${row.id}`, { headers: adminHeaders() });
        order = detail.order || detail;
        items = detail.items || [];
      } catch {
        /* imprime com dados da lista */
      }
      printHtml(buildOrderPrintHtml(order, items), `Pedido #${row.id}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function moveToColumn(orderId, colKey) {
    const nextStatus = targetStatusForCol(colKey);
    if (!nextStatus) return;
    const row = orders.find((o) => Number(o.id) === Number(orderId));
    if (!row) return;
    // Já na coluna certa e com o status alvo → nada a fazer
    if (colForStatus(row.status) === colKey && row.status === nextStatus) return;
    // Em andamento com confirmação pendente: não rebaixa para out_for_delivery
    if (colKey === 'andamento' && row.status === 'delivered_pending_confirmation') return;

    setBusyId(orderId);
    setErr(null);
    // Otimista: move o card e atualiza o status na hora
    setOrders((prev) =>
      prev
        .map((o) => (Number(o.id) === Number(orderId) ? { ...o, status: nextStatus } : o))
        .filter((o) => colForStatus(o.status))
    );
    try {
      const updated = await api.patch(
        `/admin/orders/${orderId}/status`,
        { status: nextStatus, notify: true },
        { headers: adminHeaders() }
      );
      const confirmed = updated?.status || nextStatus;
      setOrders((prev) =>
        prev
          .map((o) => (Number(o.id) === Number(orderId) ? { ...o, ...updated, status: confirmed } : o))
          .filter((o) => colForStatus(o.status))
      );
    } catch (e) {
      setErr(e.message || 'Não foi possível atualizar o status');
      loadKanban();
    } finally {
      setBusyId(null);
    }
  }

  function onDropCol(colKey, e) {
    e.preventDefault();
    e.stopPropagation();
    const raw =
      e.dataTransfer.getData('text/order-id') ||
      e.dataTransfer.getData('text/plain') ||
      dragId;
    const id = Number(raw);
    if (Number.isFinite(id) && id > 0) moveToColumn(id, colKey);
    setDragId(null);
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Pedidos</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`btn ${view === 'kanban' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ width: 'auto' }}
            onClick={() => setView('kanban')}
          >
            Kanban
          </button>
          <button
            type="button"
            className={`btn ${view === 'historico' ? 'btn-primary' : 'btn-ghost'}`}
            style={{ width: 'auto' }}
            onClick={() => setView('historico')}
          >
            Histórico / relatório
          </button>
          <Link to="/admin/painel/entregadores" className="btn btn-ghost" style={{ width: 'auto' }}>
            Entregadores
          </Link>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        Ao mudar de coluna (arrastar ou botão), o status do pedido atualiza junto. O entregador é definido só pelo app
        (QR/código). Finalizados ficam no histórico.
      </p>

      {err && <p className="err">{err}</p>}

      {view === 'kanban' && (
        <div className="admin-kanban">
          {KANBAN_COLS.map((col) => (
            <section
              key={col.key}
              className="admin-kanban__col"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => onDropCol(col.key, e)}
            >
              <header className="admin-kanban__head">
                <strong>{col.title}</strong>
                <span className="muted">{columns[col.key]?.length || 0}</span>
              </header>
              <div className="admin-kanban__list">
                {(columns[col.key] || []).map((row) => {
                  const created = orderCreatedAt(row);
                  const name = orderCustomerName(row);
                  const phone = orderCustomerPhone(row);
                  return (
                  <article
                    key={row.id}
                    className={`card admin-kanban__card${busyId === row.id ? ' is-busy' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      setDragId(row.id);
                      e.dataTransfer.setData('text/order-id', String(row.id));
                      e.dataTransfer.setData('text/plain', String(row.id));
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragEnd={() => setDragId(null)}
                  >
                    <div className="admin-kanban__card-top">
                      <strong>#{row.id}</strong>
                      <span>R$ {Number(row.total).toFixed(2)}</span>
                    </div>
                    <p className="admin-kanban__status">{statusLabel(row.status)}</p>
                    <p className="admin-kanban__customer">
                      {name || 'Cliente sem nome'}
                    </p>
                    {phone ? (
                      <p className="muted" style={{ margin: '0.15rem 0 0', fontSize: '0.85rem' }}>
                        {phone}
                      </p>
                    ) : null}
                    <p className="admin-kanban__time">
                      <span>{formatClock(created)}</span>
                      <span aria-hidden="true"> · </span>
                      <span>há {formatElapsed(created, now)}</span>
                    </p>
                    <p className="muted" style={{ margin: '0.2rem 0 0', fontSize: '0.78rem' }}>
                      {row.driver_name ? row.driver_name : 'Sem entregador'}
                    </p>
                    <div className="admin-kanban__card-actions">
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.82rem' }}
                        disabled={busyId === row.id}
                        onClick={() => printOrder(row)}
                      >
                        Imprimir
                      </button>
                      {col.key === 'received' && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.82rem' }}
                          disabled={busyId === row.id}
                          onClick={() => moveToColumn(row.id, 'preparing')}
                        >
                          → Preparo
                        </button>
                      )}
                      {col.key === 'preparing' && (
                        <>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.82rem' }}
                            disabled={busyId === row.id}
                            onClick={() => moveToColumn(row.id, 'received')}
                          >
                            ← Recebido
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.82rem' }}
                            disabled={busyId === row.id}
                            onClick={() => moveToColumn(row.id, 'andamento')}
                          >
                            → Andamento
                          </button>
                        </>
                      )}
                      {col.key === 'andamento' && (
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ width: 'auto', padding: '0.3rem 0.6rem', fontSize: '0.82rem' }}
                          disabled={busyId === row.id || row.status === 'delivered_pending_confirmation'}
                          onClick={() => moveToColumn(row.id, 'preparing')}
                        >
                          ← Preparo
                        </button>
                      )}
                    </div>
                  </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {view === 'historico' && (
        <div className="admin-orders-cards">
          {history.length === 0 ? (
            <p className="muted card" style={{ padding: '1.25rem' }}>
              Nenhum pedido finalizado encontrado.
            </p>
          ) : (
            history.map((row) => (
              <article key={row.id} className="card admin-order-card">
                <div className="admin-order-card__head">
                  <div>
                    <p className="admin-order-card__id">Pedido #{row.id}</p>
                    <p className="admin-order-card__meta">
                      {statusLabel(row.status)} · {orderCustomerName(row) || 'Cliente'} · criado{' '}
                      {orderCreatedAt(row) ? new Date(orderCreatedAt(row)).toLocaleString('pt-BR') : '—'}
                    </p>
                  </div>
                  <div className="admin-order-card__total">R$ {Number(row.total).toFixed(2)}</div>
                </div>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                  Duração: {formatElapsed(orderCreatedAt(row), row.delivered_at || row.updated_at || Date.now())}
                  {row.driver_name ? ` · ${row.driver_name}` : ''}
                </p>
              </article>
            ))
          )}
        </div>
      )}
    </div>
  );
}
