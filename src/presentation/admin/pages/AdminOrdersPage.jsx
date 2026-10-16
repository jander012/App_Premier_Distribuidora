import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';
import { readListSession, restoreListScroll, writeListSession } from '../../utils/listSession.js';

const PAGE_SIZE = 10;
const LIST_KEY = 'admin-orders';

function orderLocationUrl(row) {
  const lat = row.delivery_latitude != null ? Number(row.delivery_latitude) : null;
  const lng = row.delivery_longitude != null ? Number(row.delivery_longitude) : null;
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }
  const parts = [row.delivery_street, row.delivery_number, row.delivery_neighborhood, row.delivery_zip_code]
    .map((p) => String(p || '').trim())
    .filter(Boolean);
  if (!parts.length) return null;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
}

function whatsappDriverUrl(driverPhone, order) {
  const digits = String(driverPhone || '').replace(/\D/g, '');
  if (!digits) return null;
  const phone = digits.startsWith('55') ? digits : `55${digits}`;
  const maps = orderLocationUrl(order);
  const address = [order.delivery_street, order.delivery_number, order.delivery_neighborhood]
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(', ');
  const lines = [
    `Pedido #${order.id}`,
    address ? `Endereço: ${address}` : null,
    order.customer_phone ? `Cliente: ${order.customer_phone}` : null,
    maps ? `Localização: ${maps}` : null,
  ].filter(Boolean);
  return `https://wa.me/${phone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

const EMPTY_FILTERS = {
  status: '',
  phone: '',
  orderId: '',
  from: '',
  to: '',
};

function initialListState() {
  const saved = readListSession(LIST_KEY);
  const filters = { ...EMPTY_FILTERS };
  if (saved?.filters && typeof saved.filters === 'object') {
    for (const key of Object.keys(EMPTY_FILTERS)) {
      if (typeof saved.filters[key] === 'string') filters[key] = saved.filters[key];
    }
  }
  return {
    page: Math.max(1, Number(saved?.page) || 1),
    filters,
    scrollY: Number(saved?.scrollY) || 0,
  };
}

const STATUSES = [
  { v: 'received', l: 'Pedido recebido' },
  { v: 'preparing', l: 'Em preparo' },
  { v: 'out_for_delivery', l: 'Saiu para entrega' },
  { v: 'delivered_pending_confirmation', l: 'Aguardando confirmação' },
  { v: 'delivered', l: 'Entregue' },
  { v: 'cancelled', l: 'Cancelado' },
];

function formatOrderCreatedAt(row) {
  const raw = row.created_at ?? row.createdAt;
  if (raw == null) return '—';
  try {
    return new Date(raw).toLocaleString('pt-BR');
  } catch {
    return '—';
  }
}

function statusLabel(status) {
  return STATUSES.find((s) => s.v === status)?.l ?? status;
}

function escHtml(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatOptionsSnapshot(snap) {
  if (!Array.isArray(snap) || snap.length === 0) return '—';
  const parts = snap
    .map((o) => {
      if (o == null) return '';
      if (typeof o === 'string') return o;
      if (typeof o.name === 'string') return o.name;
      if (o.label != null) return String(o.label);
      return '';
    })
    .filter(Boolean);
  return parts.length ? parts.join(', ') : '—';
}

function formatMoney(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2) : '—';
}

/** HTML estreito (~80mm) para térmica via diálogo do sistema (sem pop-up bloqueado). */
function buildThermalReceiptHtml(order, items) {
  const created =
    order.createdAt != null ? escHtml(new Date(order.createdAt).toLocaleString('pt-BR')) : '—';
  const cust = order.customer || {};
  const del = order.delivery || {};
  const addr = [
    del.street,
    del.number,
    del.neighborhood,
    del.zipCode,
    del.complement,
    del.reference,
  ]
    .filter((x) => x != null && String(x).trim() !== '')
    .map((x) => escHtml(String(x).trim()))
    .join(', ');
  const st = escHtml(statusLabel(order.status));

  const blocks = [];
  blocks.push(`<div class="c">PEDIDO #${order.id}</div>`);
  blocks.push(`<div class="s">${created}</div>`);
  blocks.push(`<div class="s">${st}</div>`);
  blocks.push('<div class="rule"></div>');
  blocks.push(`<div>${escHtml(cust.fullName || '—')}</div>`);
  blocks.push(`<div class="s">Tel. ${escHtml(cust.phone || '—')}</div>`);
  blocks.push('<div class="h">ENTREGA</div>');
  blocks.push(`<div class="s">${addr || '—'}</div>`);
  blocks.push('<div class="rule"></div>');

  for (const i of items) {
    const opts = formatOptionsSnapshot(i.optionsSnapshot);
    const optEsc = opts !== '—' ? escHtml(opts) : '';
    blocks.push(`<div><b>${escHtml(String(i.quantity))}x</b> ${escHtml(i.productName)}</div>`);
    if (optEsc) blocks.push(`<div class="s indent">${optEsc}</div>`);
    if (i.note) blocks.push(`<div class="s indent">Obs: ${escHtml(String(i.note))}</div>`);
    blocks.push(`<div class="s indent">R$ ${formatMoney(i.lineTotal)}</div>`);
  }

  blocks.push('<div class="rule"></div>');
  blocks.push(`<div class="row"><span>Subtotal</span><span>R$ ${formatMoney(order.subtotal)}</span></div>`);
  blocks.push(`<div class="row"><span>Entrega</span><span>R$ ${formatMoney(order.deliveryFee)}</span></div>`);
  if (Number(order.couponDiscount) > 0) {
    blocks.push(
      `<div class="row"><span>Cupom</span><span>− R$ ${formatMoney(order.couponDiscount)}</span></div>`
    );
  }
  blocks.push(`<div class="row total"><span>TOTAL</span><span>R$ ${formatMoney(order.total)}</span></div>`);
  blocks.push(`<div class="s">Pag.: ${escHtml(order.paymentMethodCode || '—')}</div>`);
  blocks.push('<div class="rule"></div>');

  const inner = blocks.join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Pedido #${order.id}</title>
  <style>
    @page { size: 80mm auto; margin: 2mm; }
    html, body { margin: 0; padding: 0; }
    body {
      font-family: ui-monospace, 'Cascadia Mono', 'Consolas', monospace;
      font-size: 11pt;
      line-height: 1.35;
      color: #000;
      background: #fff;
      max-width: 72mm;
      margin: 0 auto;
      padding: 2mm 3mm 6mm;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .c { text-align: center; font-weight: 700; font-size: 12pt; margin-bottom: 0.2rem; }
    .s { font-size: 9.5pt; color: #222; }
    .h { font-weight: 700; margin-top: 0.35rem; margin-bottom: 0.15rem; font-size: 10pt; }
    .rule { border-top: 1px dashed #000; margin: 0.35rem 0; }
    .indent { padding-left: 0.35rem; }
    .row { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 10pt; margin: 0.12rem 0; }
    .row.total { font-weight: 700; font-size: 11pt; margin-top: 0.35rem; }
    @media screen { body { padding: 12px; border: 1px solid #ccc; margin-top: 8px; } }
  </style>
</head>
<body>${inner}</body>
</html>`;
}

/** Impressão pelo navegador sem nova janela (evita bloqueio de pop-up no celular). */
function printOrderThermalIframe(order, items) {
  const html = buildThermalReceiptHtml(order, items);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', `Impressão pedido ${order.id}`);
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
  win.focus();
  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* ignore */
    }
  };
  win.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => {
    try {
      win.print();
    } catch {
      cleanup();
    }
  }, 150);
  setTimeout(cleanup, 120000);
}

export function AdminOrdersPage() {
  const boot = useRef(initialListState());
  const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(boot.current.page);
  const [filters, setFilters] = useState(boot.current.filters);
  const [err, setErr] = useState(null);
  /** null | 'loading' | { order, items } | { error: string } */
  const [detail, setDetail] = useState(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [printHint, setPrintHint] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [driverBusyId, setDriverBusyId] = useState(null);
  const skipPageReset = useRef(true);
  const scrollRestored = useRef(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (filters.status) params.set('status', filters.status);
      if (filters.phone.trim()) params.set('phone', filters.phone.trim());
      if (filters.orderId.trim()) params.set('orderId', filters.orderId.trim());
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const res = await api.get(`/admin/orders?${params.toString()}`, { headers: adminHeaders() });
      setData({
        items: res.items || [],
        total: res.total ?? 0,
        page: res.page ?? page,
        totalPages: res.totalPages ?? 1,
      });
    } catch (e) {
      setErr(e.message);
    }
  }, [page, filters]);

  const loadDrivers = useCallback(async () => {
    try {
      const rows = await api.get('/admin/drivers', { headers: adminHeaders() });
      setDrivers(Array.isArray(rows) ? rows.filter((d) => d.active !== false) : []);
    } catch {
      setDrivers([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadDrivers();
  }, [loadDrivers]);

  async function assignDriver(orderId, driverId) {
    setDriverBusyId(orderId);
    setErr(null);
    try {
      const res = await api.patch(
        `/admin/orders/${orderId}/driver`,
        { driverId: driverId === '' ? null : Number(driverId) },
        { headers: adminHeaders() }
      );
      setData((prev) => ({
        ...prev,
        items: prev.items.map((row) =>
          row.id === orderId
            ? {
                ...row,
                driver_id: res.driverId,
                assigned_driver_id: res.driverId,
                driver_name: res.driverName,
                driver_phone: res.driverPhone,
              }
            : row
        ),
      }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setDriverBusyId(null);
    }
  }

  useEffect(() => {
    if (skipPageReset.current) {
      skipPageReset.current = false;
      return;
    }
    setPage(1);
  }, [filters.status, filters.phone, filters.orderId, filters.from, filters.to]);

  useEffect(() => {
    writeListSession(LIST_KEY, {
      page,
      filters,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    });
  }, [page, filters]);

  useEffect(() => {
    const persist = () =>
      writeListSession(LIST_KEY, {
        page,
        filters,
        scrollY: window.scrollY,
      });
    window.addEventListener('pagehide', persist);
    return () => {
      persist();
      window.removeEventListener('pagehide', persist);
    };
  }, [page, filters]);

  useEffect(() => {
    if (scrollRestored.current || data.items.length === 0) return;
    scrollRestored.current = true;
    restoreListScroll(boot.current.scrollY);
  }, [data.items.length]);

  async function patchOrderStatus(id, status) {
    try {
      await api.patch(`/admin/orders/${id}/status`, { status, notify: true }, { headers: adminHeaders() });
      await load();
      if (detail && detail.order && detail.order.id === id) {
        setDetail((d) => (d && d.order ? { ...d, order: { ...d.order, status } } : d));
      }
    } catch (e) {
      setErr(e.message);
    }
  }

  async function openDetail(orderId) {
    setDetail('loading');
    try {
      const res = await api.get(`/admin/orders/${orderId}`, { headers: adminHeaders() });
      setDetail({
        order: res.order,
        items: Array.isArray(res.items) ? res.items : [],
      });
    } catch (e) {
      setDetail({ error: e.message || 'Não foi possível carregar o pedido.' });
    }
  }

  function closeDetail() {
    setDetail(null);
    setPrintHint(null);
  }

  async function handlePrintOrder() {
    if (!detail?.order) return;
    const oid = detail.order.id;
    setPrintHint(null);
    setPrintBusy(true);
    try {
      await api.post(`/admin/orders/${oid}/print-thermal`, {}, { headers: adminHeaders() });
      setPrintHint('Cupom enviado para a impressora (backend → rede).');
    } catch (e) {
      const code = e.details?.code;
      if (e.status === 503 && code === 'THERMAL_NOT_CONFIGURED') {
        printOrderThermalIframe(detail.order, detail.items);
        setPrintHint(
          'Servidor sem térmica configurada: abrimos a impressão do navegador (80mm). Escolha a impressora térmica no diálogo.'
        );
      } else if (e.status === 502 || e.status === 503) {
        const go = window.confirm(
          `${e.message}\n\nTentar impressão pelo navegador (layout 80mm para térmica)?`
        );
        if (go) {
          printOrderThermalIframe(detail.order, detail.items);
          setPrintHint('Selecione a impressora térmica ou driver RAW no sistema.');
        }
      } else {
        setPrintHint(e.message || 'Não foi possível imprimir.');
      }
    } finally {
      setPrintBusy(false);
    }
  }

  const orders = data.items;

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Pedidos</h1>
        <Link to="/admin/painel/entregadores" className="btn btn-ghost" style={{ width: 'auto' }}>
          Entregadores
        </Link>
      </div>
      <div className="card admin-filters" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div className="admin-filters__grid">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
              style={{ width: '100%' }}
            >
              <option value="">Todos</option>
              {STATUSES.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.l}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Telefone (parcial)</label>
            <input
              value={filters.phone}
              onChange={(e) => setFilters((f) => ({ ...f, phone: e.target.value }))}
              placeholder="ex.: 99999"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Nº do pedido</label>
            <input
              value={filters.orderId}
              onChange={(e) => setFilters((f) => ({ ...f, orderId: e.target.value }))}
              inputMode="numeric"
              placeholder="ID"
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>De (data)</label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Até (data)</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </div>
        </div>
        <p className="muted" style={{ margin: '0.75rem 0 0', fontSize: '0.85rem' }}>
          {data.total} pedido(s) com estes filtros · {PAGE_SIZE} por página · ordem de criação (mais antigos
          primeiro) · página {data.page} de {data.totalPages}
        </p>
      </div>
      {err && <p className="err">{err}</p>}
      {orders.length === 0 ? (
        <p className="muted card" style={{ padding: '1.25rem' }}>
          Nenhum pedido encontrado com os filtros atuais.
        </p>
      ) : (
        <div className="admin-orders-cards">
          {orders.map((row) => (
            <article key={row.id} className="card admin-order-card">
              <div className="admin-order-card__head">
                <div>
                  <p className="admin-order-card__id">Pedido #{row.id}</p>
                  <p className="admin-order-card__meta">Criado em {formatOrderCreatedAt(row)}</p>
                </div>
                <div className="admin-order-card__total">R$ {Number(row.total).toFixed(2)}</div>
              </div>
              <p style={{ margin: 0, fontSize: '0.9rem', wordBreak: 'break-word' }}>
                <span className="muted">Cliente · </span>
                {row.customer_phone || '—'}
              </p>
              <p style={{ margin: 0, fontSize: '0.82rem' }} className="muted">
                Pagamento: {row.payment_method_code || '—'}
              </p>
              <div className="field" style={{ margin: '0.65rem 0 0' }}>
                <label style={{ fontSize: '0.8rem' }}>Entregador</label>
                <select
                  value={row.assigned_driver_id || row.driver_id || ''}
                  disabled={driverBusyId === row.id}
                  onChange={(e) => assignDriver(row.id, e.target.value)}
                  aria-label={`Entregador do pedido ${row.id}`}
                  style={{ width: '100%' }}
                >
                  <option value="">Sem entregador</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                      {d.isDefault ? ' (padrão)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="admin-order-card__actions">
                <select value={row.status} onChange={(e) => patchOrderStatus(row.id, e.target.value)} aria-label="Status do pedido">
                  {STATUSES.map((s) => (
                    <option key={s.v} value={s.v}>
                      {s.l}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => openDetail(row.id)}>
                  Ver / imprimir
                </button>
                {(() => {
                  const driver =
                    drivers.find((d) => d.id === (row.assigned_driver_id || row.driver_id)) ||
                    (row.driver_phone ? { phone: row.driver_phone, name: row.driver_name } : null);
                  const wa = driver?.phone ? whatsappDriverUrl(driver.phone, row) : null;
                  if (!wa) return null;
                  return (
                    <a
                      className="btn btn-primary"
                      style={{ width: 'auto', textDecoration: 'none' }}
                      href={wa}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Enviar localização no WhatsApp do entregador"
                    >
                      WhatsApp localização
                    </a>
                  );
                })()}
              </div>
            </article>
          ))}
        </div>
      )}
      {data.total > 0 && (
        <div className="admin-pagination" style={{ marginTop: '1.25rem' }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            Página {page} de {data.totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}

      {detail != null && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes do pedido"
          onClick={(e) => e.target === e.currentTarget && closeDetail()}
          onKeyDown={(e) => e.key === 'Escape' && closeDetail()}
        >
          <div className="admin-modal card" style={{ maxWidth: 720 }} onClick={(e) => e.stopPropagation()}>
            {detail === 'loading' && <p className="muted">Carregando itens…</p>}
            {detail && detail.error && (
              <>
                <p className="err">{detail.error}</p>
                <button type="button" className="btn btn-ghost" onClick={closeDetail}>
                  Fechar
                </button>
              </>
            )}
            {detail && detail.order && (
              <>
                <div className="admin-toolbar" style={{ marginBottom: '1rem' }}>
                  <h2 style={{ margin: 0, fontSize: '1.15rem' }}>Pedido #{detail.order.id}</h2>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: 'auto' }}
                      disabled={printBusy}
                      onClick={() => handlePrintOrder()}
                    >
                      {printBusy ? 'Imprimindo…' : 'Imprimir pedido'}
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={closeDetail}>
                      Fechar
                    </button>
                  </div>
                </div>
                {printHint && (
                  <p className="muted" style={{ margin: '0 0 0.75rem', fontSize: '0.85rem' }}>
                    {printHint}
                  </p>
                )}
                <p className="muted" style={{ marginTop: 0, fontSize: '0.88rem' }}>
                  {statusLabel(detail.order.status)}
                  {detail.order.createdAt
                    ? ` · ${new Date(detail.order.createdAt).toLocaleString('pt-BR')}`
                    : ''}
                </p>
                <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.35rem' }}>Cliente</h3>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                  {detail.order.customer?.fullName || '—'} · {detail.order.customer?.phone || '—'}
                </p>
                <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.35rem' }}>Entrega</h3>
                <p style={{ margin: 0, fontSize: '0.9rem' }}>
                  {[
                    detail.order.delivery?.street,
                    detail.order.delivery?.number,
                    detail.order.delivery?.neighborhood,
                    detail.order.delivery?.zipCode,
                    detail.order.delivery?.complement,
                    detail.order.delivery?.reference,
                  ]
                    .filter((x) => x != null && String(x).trim() !== '')
                    .join(', ') || '—'}
                </p>
                <h3 style={{ fontSize: '0.95rem', margin: '1rem 0 0.35rem' }}>Itens</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Produto</th>
                        <th>Qtd</th>
                        <th>Unit.</th>
                        <th>Total</th>
                        <th>Opções / obs.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items.map((i) => (
                        <tr key={i.id}>
                          <td>{i.productName}</td>
                          <td>{i.quantity}</td>
                          <td>R$ {Number(i.unitPrice).toFixed(2)}</td>
                          <td>R$ {Number(i.lineTotal).toFixed(2)}</td>
                          <td style={{ fontSize: '0.82rem', maxWidth: 220 }} className="muted">
                            {formatOptionsSnapshot(i.optionsSnapshot)}
                            {i.note ? ` · Obs.: ${i.note}` : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div
                  style={{
                    marginTop: '1rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--surface2)',
                    fontSize: '0.92rem',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Subtotal</span>
                    <span>R$ {Number(detail.order.subtotal).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="muted">Entrega</span>
                    <span>R$ {Number(detail.order.deliveryFee).toFixed(2)}</span>
                  </div>
                  {Number(detail.order.couponDiscount) > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="muted">Cupom</span>
                      <span>− R$ {Number(detail.order.couponDiscount).toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginTop: '0.35rem' }}>
                    <span>Total</span>
                    <span>R$ {Number(detail.order.total).toFixed(2)}</span>
                  </div>
                  <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.85rem' }}>
                    Pagamento: {detail.order.paymentMethodCode || '—'}
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
