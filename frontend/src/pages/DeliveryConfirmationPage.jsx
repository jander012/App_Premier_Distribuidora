import { useEffect, useState } from 'react';
import { Link, useParams } from '../navigation.js';
import { api } from '../api/client.js';

export function DeliveryConfirmationPage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let on = true;
    setErr(null);
    api
      .get(`/delivery-confirmations/${encodeURIComponent(token)}`)
      .then((res) => {
        if (on) setData(res);
      })
      .catch((e) => {
        if (on) setErr(e.message);
      });
    return () => {
      on = false;
    };
  }, [token]);

  async function confirm() {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.post(`/delivery-confirmations/${encodeURIComponent(token)}/confirm`, {});
      setConfirmed(true);
      setData({ order: res.order });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (err && !data) {
    return (
      <div>
        <h1 className="page-title">Confirmar entrega</h1>
        <p className="err">{err}</p>
        <Link to="/" className="btn btn-primary" style={{ textAlign: 'center' }}>
          Voltar ao cardápio
        </Link>
      </div>
    );
  }

  if (!data?.order) return <p className="muted">Carregando confirmação…</p>;

  const order = data.order;
  const done = confirmed || order.status === 'delivered' || order.deliveryConfirmedAt;

  return (
    <div>
      <h1 className="page-title">Confirmar entrega</h1>
      <section className="card">
        <div className="section-label" style={{ marginTop: 0 }}>
          Pedido #{order.id}
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          {order.delivery?.street}, {order.delivery?.number} - {order.delivery?.neighborhood}
        </p>
        <p>
          <strong>Total: R$ {Number(order.total || 0).toFixed(2)}</strong>
        </p>
        {order.expired && !done && <p className="err">Este link de confirmação expirou.</p>}
        {done ? (
          <p className="muted" style={{ color: 'var(--accent)' }}>
            Entrega confirmada. Obrigado pela preferência!
          </p>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy || order.expired} onClick={confirm}>
            {busy ? 'Confirmando…' : 'Confirmar que recebi'}
          </button>
        )}
        {err && <p className="err">{err}</p>}
      </section>
      <Link to="/" className="btn btn-ghost" style={{ marginTop: '1rem', textAlign: 'center' }}>
        Voltar ao cardápio
      </Link>
    </div>
  );
}
