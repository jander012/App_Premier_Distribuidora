import { MenuProductCard } from './MenuProductCard.jsx';

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
                </>
              }
            />
          </div>
        ))}
      </div>
    </section>
  );
}
