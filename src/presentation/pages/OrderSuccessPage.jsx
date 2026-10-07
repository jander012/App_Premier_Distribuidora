import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from '../navigation.js';
import { api, getClientToken, setClientToken } from '../api/client.js';
import {
  ORDER_STEPS,
  PAYMENT_LABELS,
  STATUS_DESCRIPTIONS,
  formatDateTime,
  formatMoney,
  isOrderActive,
  statusLabel,
  stepIndex,
} from '../utils/orderStatus.js';

const REFRESH_MS = 20_000;

function OrderTimeline({ status, history }) {
  if (status === 'cancelled') {
    const at = history.find((h) => h.status === 'cancelled')?.at;
    return (
      <div className="order-timeline order-timeline--cancelled">
        <div className="order-timeline__step is-current">
          <span className="order-timeline__dot" />
          <div>
            <strong>Cancelado</strong>
            {at && <span className="muted">{formatDateTime(at)}</span>}
          </div>
        </div>
      </div>
    );
  }
  const current = stepIndex(status);
  const firstAt = (s) => history.find((h) => h.status === s)?.at;
  return (
    <ol className="order-timeline">
      {ORDER_STEPS.map((s, i) => {
        const done = i < current || (i === current && status === 'delivered');
        const isCurrent = i === current && status !== 'delivered';
        const at = firstAt(s) || (s === 'out_for_delivery' && i <= current ? firstAt('delivered_pending_confirmation') : null);
        return (
          <li
            key={s}
            className={`order-timeline__step${done ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`}
          >
            <span className="order-timeline__dot" />
            <div>
              <strong>{statusLabel(s)}</strong>
              {at && (done || isCurrent) && <span className="muted">{formatDateTime(at)}</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function OrderSuccessPage() {
  const { id } = useParams();
  const loc = useLocation();
  const justPlaced = Boolean(loc.state?.order);
  const [data, setData] = useState(loc.state || null);
  const [pixCharge] = useState(loc.state?.pixCharge || null);
  const [err, setErr] = useState(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!getClientToken()) {
        setNeedsLogin(true);
        return;
      }
      try {
        const res = await api.clientGet(`/orders/${id}`);
        setData((prev) => ({ ...res, pixCharge: prev?.pixCharge }));
        setLastUpdate(new Date());
        setErr(null);
      } catch (e) {
        if (e?.status === 401) {
          setClientToken(null);
          setNeedsLogin(true);
          return;
        }
        if (!silent) setErr(e.message);
      }
    },
    [id]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const status = data?.order?.status;
  const active = status ? isOrderActive(status) : false;

  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => void load({ silent: true }), REFRESH_MS);
    const onFocus = () => void load({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', onFocus);
    };
  }, [active, load]);

  if (needsLogin && !data?.order) {
    return (
      <section className="card">
        <strong>Entre para ver este pedido</strong>
        <p className="muted">Confirme o celular usado no pedido para acompanhar o status.</p>
        <Link to="/meus-pedidos" className="btn btn-primary">
          Entrar em Minha conta
        </Link>
      </section>
    );
  }

  if (err && !data?.order) {
    return (
      <section className="card">
        <p className="err">{err}</p>
        <Link to="/meus-pedidos" className="btn btn-ghost">
          Ver meus pedidos
        </Link>
      </section>
    );
  }

  if (!data?.order) {
    return <p className="muted">Carregando pedido…</p>;
  }

  const { order, items = [], history = [] } = data;
  const discount = Number(order.couponDiscount || 0);
  const paymentLabel = PAYMENT_LABELS[order.paymentMethodCode] || order.paymentMethodCode;
  const changeFor = order.paymentMeta?.changeNeeded ? Number(order.paymentMeta.changeForAmount) : null;

  return (
    <div className="order-success-page">
      <Link to="/meus-pedidos" className="order-back-link">
        ‹ Meus pedidos
      </Link>
      <h1 className="page-title">{justPlaced ? 'Pedido confirmado!' : `Pedido #${order.id}`}</h1>
      {justPlaced && (
        <p className="muted">
          Você pode acompanhar o status por aqui a qualquer momento em <strong>Meus pedidos</strong>.
        </p>
      )}

      <section className={`card order-status-card order-status-card--${order.status}`}>
        <div className="row-between">
          <div>
            <span className="order-receipt__eyebrow">Status do pedido #{order.id}</span>
            <h2 className="order-status-card__title">{statusLabel(order.status)}</h2>
          </div>
          {active && <span className="order-live-dot" title="Atualizando automaticamente" />}
        </div>
        <p className="order-status-card__desc">{STATUS_DESCRIPTIONS[order.status] || ''}</p>
        <OrderTimeline status={order.status} history={history} />
        <p className="muted order-status-card__meta">
          Feito em {formatDateTime(order.createdAt)}
          {active && lastUpdate ? ` · atualizado às ${lastUpdate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : ''}
        </p>
      </section>

      <section className="card order-receipt" style={{ marginTop: '1rem' }}>
        <div className="order-receipt__head">
          <div>
            <span className="order-receipt__eyebrow">Itens</span>
            <h2>Resumo do pedido</h2>
          </div>
        </div>

        <div className="order-receipt__items">
          {items.map((i) => (
            <div key={i.id} className="order-receipt-item">
              {i.imageUrl ? (
                <img className="order-receipt-item__image" src={i.imageUrl} alt="" loading="lazy" />
              ) : (
                <div className="order-receipt-item__image order-receipt-item__image--placeholder" />
              )}
              <div className="order-receipt-item__body">
                <strong>{i.productName}</strong>
                <span>Valor unitário: {formatMoney(i.unitPrice)}</span>
                {i.optionsSnapshot?.length > 0 && (
                  <span>Opcionais: {i.optionsSnapshot.map((o) => o.name).join(', ')}</span>
                )}
                {i.note && <span>Obs: {i.note}</span>}
              </div>
              <div className="order-receipt-item__totals">
                <span>{i.quantity}x</span>
                <strong>{formatMoney(i.lineTotal)}</strong>
              </div>
            </div>
          ))}
        </div>

        <div className="order-receipt__summary">
          <div className="row-between">
            <span>Subtotal</span>
            <span>{formatMoney(order.subtotal)}</span>
          </div>
          <div className="row-between">
            <span>Taxa de entrega</span>
            <span>{formatMoney(order.deliveryFee)}</span>
          </div>
          {discount > 0 && (
            <div className="row-between">
              <span>Desconto</span>
              <span>- {formatMoney(discount)}</span>
            </div>
          )}
          <div className="row-between order-receipt__total">
            <span>Total</span>
            <span>{formatMoney(order.total)}</span>
          </div>
          <div className="row-between">
            <span>Pagamento</span>
            <span>
              {paymentLabel}
              {Number.isFinite(changeFor) && changeFor > 0 ? ` (troco para ${formatMoney(changeFor)})` : ''}
            </span>
          </div>
        </div>

        <div className="order-receipt__delivery">
          <strong>Entrega</strong>
          <span>
            {order.delivery.street}, {order.delivery.number}
            {order.delivery.complement ? ` - ${order.delivery.complement}` : ''} · {order.delivery.neighborhood}
          </span>
          {order.delivery.locationUrl && (
            <a className="muted" href={order.delivery.locationUrl} target="_blank" rel="noreferrer">
              Ver localização no mapa
            </a>
          )}
        </div>
      </section>

      {pixCharge?.copyPaste && active && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            PIX copia e cola
          </div>
          <textarea readOnly value={pixCharge.copyPaste} style={{ width: '100%', fontSize: '0.75rem' }} rows={4} />
        </div>
      )}

      <div className="order-success-actions">
        <Link to="/meus-pedidos" className="btn btn-ghost">
          Ver todos os pedidos
        </Link>
        <Link to="/" className="btn btn-primary">
          Voltar ao cardápio
        </Link>
      </div>
    </div>
  );
}
