import { Link } from '../navigation.js';
import { useCart } from '../context/CartContext.jsx';

export function CartPage() {
  const { summary, loading, error, updateItem, removeItem, deliveryKm, setDeliveryKm, deliveryPublic } = useCart();
  const routeFromStore =
    Boolean(deliveryPublic?.deliveryPricingUsesRoute) &&
    Boolean(
      deliveryPublic?.deliveryAreaPolygon?.type === 'Polygon' &&
        deliveryPublic.deliveryAreaPolygon.coordinates?.[0]?.length >= 3
    );

  if (loading && !summary) {
    return <p className="muted">Carregando carrinho…</p>;
  }

  if (error && !summary) {
    return <p className="err">{error}</p>;
  }

  const items = summary?.items || [];

  return (
    <div>
      <h1 className="page-title">Carrinho</h1>
      {items.length === 0 ? (
        <p className="muted">
          Seu carrinho está vazio.{' '}
          <Link to="/" style={{ color: 'var(--accent)' }}>
            Ver cardápio
          </Link>
        </p>
      ) : (
        <>
          {items.map((line) => (
            <div key={line.id} className="card cart-item-card">
              <div className="cart-item-card__main">
                {line.imageUrl ? (
                  <img className="cart-item-card__image" src={line.imageUrl} alt="" loading="lazy" />
                ) : (
                  <div className="cart-item-card__image cart-item-card__image--placeholder" />
                )}
                <div className="cart-item-card__body">
                  <strong className="cart-item-card__name">{line.name}</strong>
                  {line.note && (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      Obs: {line.note}
                    </div>
                  )}
                  {line.options?.length > 0 && (
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {line.options.map((o) => o.name).join(', ')}
                    </div>
                  )}
                  <div className="price" style={{ marginTop: '0.35rem' }}>
                    R$ {Number(line.lineTotal).toFixed(2)}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost cart-item-card__remove" onClick={() => removeItem(line.id)}>
                  Remover
                </button>
              </div>
              <div className="qty cart-item-card__qty">
                <button
                  type="button"
                  onClick={() => updateItem(line.id, { quantity: Math.max(1, line.quantity - 1) })}
                >
                  −
                </button>
                <span>{line.quantity}</span>
                <button type="button" onClick={() => updateItem(line.id, { quantity: line.quantity + 1 })}>
                  +
                </button>
              </div>
            </div>
          ))}

          {deliveryPublic?.deliveryUseDistanceZones && routeFromStore && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="section-label" style={{ marginTop: 0 }}>
                Taxa por distância
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0, marginBottom: 0 }}>
                A loja calcula a taxa pela <strong>rota de carro</strong> até o pino que você marcar no checkout (não
                por raio). Total abaixo atualiza ao definir o ponto no mapa.
                {summary?.deliveryDistanceSource === 'route' && summary?.deliveryDistanceKm != null && (
                  <span>
                    {' '}
                    Rota atual: ~{Number(summary.deliveryDistanceKm).toFixed(2)} km.
                  </span>
                )}
              </p>
            </div>
          )}

          {deliveryPublic?.deliveryUseDistanceZones && !routeFromStore && (
            <div className="card" style={{ marginTop: '1rem' }}>
              <div className="section-label" style={{ marginTop: 0 }}>
                Distância (km)
              </div>
              <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
                Informe a distância aproximada para calcular a taxa por faixa.
                {deliveryPublic?.deliveryRequireDistanceKm ? ' Obrigatório no checkout.' : ''}
              </p>
              <div className="field" style={{ marginBottom: 0 }}>
                <input
                  inputMode="decimal"
                  value={deliveryKm}
                  onChange={(e) => setDeliveryKm(e.target.value)}
                  placeholder="Ex.: 3,2"
                />
              </div>
            </div>
          )}

          <div className="card" style={{ marginTop: '1rem' }}>
            <div className="row-between">
              <span className="muted">Subtotal</span>
              <span>R$ {Number(summary.subtotal).toFixed(2)}</span>
            </div>
            <div className="row-between">
              <span className="muted">Taxa de entrega</span>
              <span>R$ {Number(summary.deliveryFee).toFixed(2)}</span>
            </div>
            <div className="row-between" style={{ marginTop: '0.5rem', fontWeight: 700 }}>
              <span>Total</span>
              <span className="price">R$ {Number(summary.total).toFixed(2)}</span>
            </div>
          </div>

          <Link to="/checkout" className="btn btn-primary" style={{ marginTop: '1rem', textAlign: 'center' }}>
            Finalizar pedido
          </Link>
        </>
      )}
    </div>
  );
}
