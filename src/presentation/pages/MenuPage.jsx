import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from '../navigation.js';
import { api } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useStore, withStoreQuery } from '../context/StoreContext.jsx';

export function MenuPage() {
  const [params] = useSearchParams();
  const { setPhone } = useCart();
  const { storeSlug } = useStore();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const p = params.get('phone');
    if (p) setPhone(p);
  }, [params, setPhone]);

  useEffect(() => {
    let on = true;
    setLoading(true);
    setErr(null);
    (async () => {
      try {
        const [c, pr] = await Promise.all([
          api.get(withStoreQuery('/categories', storeSlug)),
          api.get(withStoreQuery('/products', storeSlug)),
        ]);
        if (on) {
          setCategories(c);
          setProducts(pr);
        }
      } catch (e) {
        if (on) setErr(e.message);
      } finally {
        if (on) setLoading(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [storeSlug]);

  const byCat = useMemo(() => {
    const m = new Map();
    for (const c of categories) m.set(c.id, { ...c, items: [] });
    for (const p of products) {
      const bucket = m.get(p.category_id);
      if (bucket) bucket.items.push(p);
    }
    return [...m.values()].filter((c) => c.items.length);
  }, [categories, products]);

  return (
    <div className="menu-page">
      <section className="menu-hero">
        <div>
          <span className="menu-hero__eyebrow">Delivery Premier</span>
          <h1 className="page-title">Cardápio</h1>
          <p className="muted">Escolha seus produtos favoritos e finalize o pedido em poucos passos.</p>
        </div>
        <div className="menu-hero__meta">
          <strong>Aberto</strong>
          <span>Entrega rápida</span>
        </div>
      </section>
      {byCat.length > 0 && (
        <div className="category-strip" aria-label="Categorias">
          {byCat.map((cat) => (
            <a key={cat.id} href={`#cat-${cat.id}`} className="category-pill">
              {cat.name}
            </a>
          ))}
        </div>
      )}
      {err && <p className="err">{err}</p>}
      {loading && <MenuSkeleton />}
      {byCat.map((cat) => (
        <section key={cat.id} id={`cat-${cat.id}`} className="menu-section">
          <div className="section-label">{cat.name}</div>
          <div className="product-grid">
            {cat.items.map((p) => (
              <Link key={p.id} to={`/produto/${p.id}`} className={`card product-row ${!p.available ? 'unavailable' : ''}`}>
                {p.image_url ? (
                  <img src={p.image_url} alt="" loading="lazy" />
                ) : (
                  <div className="product-placeholder" />
                )}
                <div className="product-row__body">
                  <h3>{p.name}</h3>
                  {p.description && <p className="muted">{p.description}</p>}
                  <div className="price">
                    R$ {Number(p.price).toFixed(2)}
                    {!p.available && <span className="muted"> — indisponível</span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="menu-skeleton" aria-label="Carregando cardápio" aria-busy="true">
      <div className="category-strip category-strip--skeleton" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="category-pill skeleton-block" />
        ))}
      </div>
      {[0, 1].map((section) => (
        <section key={section} className="menu-section" aria-hidden="true">
          <div className="section-label skeleton-block skeleton-title" />
          <div className="product-grid">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="card product-row product-row--skeleton">
                <div className="product-placeholder skeleton-block" />
                <div className="product-row__body">
                  <div className="skeleton-block skeleton-line skeleton-line--name" />
                  <div className="skeleton-block skeleton-line" />
                  <div className="skeleton-block skeleton-line skeleton-line--short" />
                  <div className="skeleton-block skeleton-price" />
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
