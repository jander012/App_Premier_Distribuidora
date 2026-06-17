import { MenuProductCard } from './MenuProductCard.jsx';

function formatPromotionMeta(product) {
  const until = product.promotion_valid_until;
  const from = product.promotion_valid_from;
  if (until) {
    const d = new Date(until);
    if (!Number.isNaN(d.getTime())) {
      const label = d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      return `Promoção até ${label}`;
    }
  }
  if (from) {
    const d = new Date(from);
    if (!Number.isNaN(d.getTime())) {
      const label = d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      return `Promoção a partir de ${label}`;
    }
  }
  return 'Destaque do dia';
}

export function MenuProductRail({ title, subtitle, products, mode = 'featured' }) {
  if (!products?.length) return null;

  return (
    <section className="menu-rail" aria-label={title}>
      <div className="menu-rail__head">
        <div>
          <h2 className="menu-rail__title">{title}</h2>
          {subtitle && <p className="menu-rail__subtitle muted">{subtitle}</p>}
        </div>
      </div>
      <div className="menu-rail__scroll">
        {products.map((p) => (
          <div key={p.id} className="menu-rail-card-wrap">
            <MenuProductCard
              product={p}
              meta={
                <>
                  {mode === 'buy-again' && p.purchased_qty > 0 && (
                    <p className="menu-product-card__meta muted">Você já pediu {p.purchased_qty}x</p>
                  )}
                  {mode === 'featured' && p.sold_qty > 0 && (
                    <p className="menu-product-card__meta muted">{p.sold_qty} vendidos</p>
                  )}
                  {mode === 'promotion' && (
                    <p className="menu-product-card__meta menu-product-card__meta--promo">
                      {formatPromotionMeta(p)}
                    </p>
                  )}
                </>
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
