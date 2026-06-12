import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getClientToken, setClientToken } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useStore, withStoreQuery } from '../context/StoreContext.jsx';

const STATUS_LABELS = {
  received: 'Recebido',
  preparing: 'Em preparo',
  out_for_delivery: 'Saiu para entrega',
  delivered_pending_confirmation: 'Aguardando confirmação',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
};

export function CustomerOrdersPage() {
  const { storeSlug } = useStore();
  const { phone, setPhone } = useCart();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [sessionReady, setSessionReady] = useState(!!getClientToken());
  const [busy, setBusy] = useState(false);

  async function loadOrders() {
    if (!getClientToken()) return;
    setLoading(true);
    setErr(null);
    try {
      const data = await api.clientGet(withStoreQuery('/orders/me', storeSlug));
      setOrders(data || []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionReady) void loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, storeSlug]);

  async function requestOtp() {
    setErr(null);
    setOtpHint('');
    if (!phone || phone.length < 10) {
      setErr('Informe um celular vÃ¡lido com DDD');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/auth/client/request-code', { phone });
      setOtpSent(true);
      if (res.debugCode) setOtpHint(`CÃ³digo de teste: ${res.debugCode}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setErr(null);
    setBusy(true);
    try {
      const res = await api.post('/auth/client/verify-code', { phone, code: otpCode });
      setClientToken(res.clientToken);
      setSessionReady(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="customer-orders-page">
      <h1 className="page-title">Meus pedidos</h1>

      {!sessionReady && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            Acessar com celular
          </div>
          <div className="field">
            <label>Celular (WhatsApp)</label>
            <input
              inputMode="numeric"
              placeholder="11999990000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {!otpSent ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={requestOtp}>
              Receber cÃ³digo
            </button>
          ) : (
            <>
              {otpHint && <p className="muted" style={{ fontSize: '0.85rem' }}>{otpHint}</p>}
              <div className="field">
                <label>CÃ³digo de 6 dÃ­gitos</label>
                <input inputMode="numeric" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} />
              </div>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={verifyOtp}>
                Confirmar
              </button>
            </>
          )}
        </section>
      )}

      {err && <p className="err">{err}</p>}
      {sessionReady && loading && <p className="muted">Carregando pedidos...</p>}
      {sessionReady && !loading && orders.length === 0 && (
        <section className="card">
          <strong>Nenhum pedido encontrado</strong>
          <p className="muted" style={{ marginBottom: 0 }}>
            Quando vocÃª finalizar pedidos com este celular, eles aparecerÃ£o aqui.
          </p>
        </section>
      )}

      {sessionReady && orders.length > 0 && (
        <div className="customer-orders-list">
          {orders.map((order) => (
            <Link key={order.id} to={`/pedido/${order.id}`} className="card customer-order-card">
              <div className="row-between">
                <div>
                  <strong>Pedido #{order.id}</strong>
                  <p className="muted" style={{ margin: '0.25rem 0 0' }}>
                    {new Date(order.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span className="pill">{STATUS_LABELS[order.status] || order.status}</span>
              </div>
              <div className="row-between" style={{ marginTop: '0.75rem' }}>
                <span className="muted">Total</span>
                <strong>R$ {Number(order.total).toFixed(2)}</strong>
              </div>
              <p className="muted" style={{ marginBottom: 0 }}>
                {order.delivery.street}, {order.delivery.number} - {order.delivery.neighborhood}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
