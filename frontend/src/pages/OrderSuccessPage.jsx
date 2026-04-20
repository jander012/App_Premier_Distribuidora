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

  return (
    <div>
      <h1 className="page-title">Pedido confirmado</h1>
      <p className="muted">Enviamos o resumo no seu WhatsApp (modo stub: veja o terminal do servidor).</p>
      <div className="card">
        <div className="row-between">
          <span>Número do pedido</span>
          <strong>#{order.id}</strong>
        </div>
        {Number(order.couponDiscount || 0) > 0 && (
          <div className="row-between">
            <span className="muted">Desconto (cupom)</span>
            <span>− R$ {Number(order.couponDiscount).toFixed(2)}</span>
          </div>
        )}
        <div className="row-between">
          <span>Total</span>
          <span className="price">R$ {Number(order.total).toFixed(2)}</span>
        </div>
        <div className="row-between">
          <span>Status</span>
          <span className="pill">{order.status}</span>
        </div>
      </div>

      {pixCharge?.copyPaste && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            PIX copia e cola (simulado)
          </div>
          <textarea readOnly value={pixCharge.copyPaste} style={{ width: '100%', fontSize: '0.75rem' }} rows={4} />
        </div>
      )}

      <div className="section-label">Itens</div>
      {items.map((i) => (
        <div key={i.id} className="card">
          <strong>
            {i.quantity}x {i.productName}
          </strong>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            R$ {Number(i.lineTotal).toFixed(2)}
          </div>
        </div>
      ))}

      <Link to="/" className="btn btn-primary" style={{ marginTop: '1.25rem', textAlign: 'center' }}>
        Voltar ao cardápio
      </Link>
    </div>
  );
}
