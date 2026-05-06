import { useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api, getClientToken } from '../api/client.js';

export function OrderSuccessPage() {
  const { id } = useParams();
  const loc = useLocation();
  const [data, setData] = useState(loc.state || null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (data?.order) return;
    let on = true;
    (async () => {
      try {
        if (!getClientToken()) {
          if (on) setErr('Sessão expirada. Abra o link do pedido com o mesmo aparelho ou faça login novamente.');
          return;
        }
        const res = await api.clientGet(`/orders/${id}`);
        if (on) setData(res);
      } catch (e) {
        if (on) setErr(e.message);
      }
    })();
    return () => {
      on = false;
    };
  }, [id, data]);

  if (err) {
    return <p className="err">{err}</p>;
  }

  if (!data?.order) {
    return <p className="muted">Carregando pedido…</p>;
  }

  const { order, items, pixCharge } = data;
  const discount = Number(order.couponDiscount || 0);

  return (
    <div className="order-success-page">
      <h1 className="page-title">Pedido confirmado</h1>
      <p className="muted">Enviamos o resumo no seu WhatsApp (modo stub: veja o terminal do servidor).</p>

      <section className="card order-receipt">
        <div className="order-receipt__head">
          <div>
            <span className="order-receipt__eyebrow">Cupom do cliente</span>
            <h2>Pedido #{order.id}</h2>
          </div>
          <span className="pill">{order.status}</span>
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
                <span>Valor unitário: R$ {Number(i.unitPrice).toFixed(2)}</span>
                {i.optionsSnapshot?.length > 0 && (
                  <span>Opcionais: {i.optionsSnapshot.map((o) => o.name).join(', ')}</span>
                )}
                {i.note && <span>Obs: {i.note}</span>}
              </div>
              <div className="order-receipt-item__totals">
                <span>{i.quantity}x</span>
                <strong>R$ {Number(i.lineTotal).toFixed(2)}</strong>
              </div>
            </div>
          ))}
        </div>

        <div className="order-receipt__summary">
          <div className="row-between">
            <span>Subtotal</span>
            <span>R$ {Number(order.subtotal).toFixed(2)}</span>
          </div>
          <div className="row-between">
            <span>Taxa de entrega</span>
            <span>R$ {Number(order.deliveryFee).toFixed(2)}</span>
          </div>
          {discount > 0 && (
            <div className="row-between">
              <span>Desconto</span>
              <span>- R$ {discount.toFixed(2)}</span>
            </div>
          )}
          <div className="row-between order-receipt__total">
            <span>Total</span>
            <span>R$ {Number(order.total).toFixed(2)}</span>
          </div>
        </div>

        <div className="order-receipt__delivery">
          <strong>Entrega</strong>
          <span>
            {order.delivery.street}, {order.delivery.number} - {order.delivery.neighborhood}
          </span>
          {order.delivery.locationUrl && (
            <a className="muted" href={order.delivery.locationUrl} target="_blank" rel="noreferrer">
              Ver localização no mapa
            </a>
          )}
        </div>
      </section>

      {pixCharge?.copyPaste && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            PIX copia e cola (simulado)
          </div>
          <textarea readOnly value={pixCharge.copyPaste} style={{ width: '100%', fontSize: '0.75rem' }} rows={4} />
        </div>
      )}

      <Link to="/" className="btn btn-primary" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
        Voltar ao cardápio
      </Link>
    </div>
  );
}
