import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useStore, withStoreQuery } from '../context/StoreContext.jsx';

export function MenuPage() {
  const [params] = useSearchParams();
  const { setPhone } = useCart();
  const { storeSlug } = useStore();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [err, setErr] = useState(null);

  useEffect(() => {
    const p = params.get('phone');
    if (p) setPhone(p);
  }, [params, setPhone]);

  useEffect(() => {
    let on = true;
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
    <div>
      <h1 className="page-title">Cardápio</h1>
      <p className="muted" style={{ marginTop: '-0.5rem' }}>
        Toque no produto para ver detalhes e opcionais.
      </p>
      {err && <p className="err">{err}</p>}
      {byCat.map((cat) => (
        <section key={cat.id}>
          <div className="section-label">{cat.name}</div>
          {cat.items.map((p) => (
            <Link key={p.id} to={`/produto/${p.id}`} className={`card product-row ${!p.available ? 'unavailable' : ''}`}>
              {p.image_url ? (
                <img src={p.image_url} alt="" loading="lazy" />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 12, background: '#334155' }} />
              )}
              <div style={{ flex: 1 }}>
                <h3>{p.name}</h3>
                <p className="muted" style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.35 }}>
                  {p.description}
                </p>
                <div className="price" style={{ marginTop: '0.35rem' }}>
                  R$ {Number(p.price).toFixed(2)}
                  {!p.available && <span className="muted"> — indisponível</span>}
                </div>
              </div>
            </Link>
          ))}
        </section>
      ))}
    </div>
  );
}
