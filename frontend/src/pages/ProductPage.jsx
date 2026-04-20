import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useStore, withStoreQuery } from '../context/StoreContext.jsx';

export function ProductPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const { addItem } = useCart();
  const { storeSlug } = useStore();
  const [product, setProduct] = useState(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState({});
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const p = await api.get(withStoreQuery(`/products/${id}`, storeSlug));
        if (on) setProduct(p);
      } catch (e) {
        if (on) setErr(e.message);
      }
    })();
    return () => {
      on = false;
    };
  }, [id, storeSlug]);

  function toggleOption(opt) {
    setSelected((prev) => {
      const cur = prev[opt.id] || false;
      if (opt.max_select === 1) {
        return { ...prev, [opt.id]: !cur };
      }
      return { ...prev, [opt.id]: !cur };
    });
  }

  async function handleAdd() {
    if (!product?.available) return;
    const options = product.options || [];
    const required = options.filter((o) => o.required_choice);
    const pickedIds = Object.entries(selected)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
    for (const r of required) {
      if (!pickedIds.includes(r.id)) {
        setErr(`Selecione: ${r.name}`);
        return;
      }
    }
    setErr(null);
    setBusy(true);
    try {
      await addItem({
        productId: product.id,
        quantity: qty,
        note,
        optionIds: pickedIds,
      });
      nav('/carrinho');
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!product) {
    return <p className="muted">{err || 'Carregando…'}</p>;
  }

  const extras = (product.options || []).reduce(
    (s, o) => (selected[o.id] ? s + Number(o.price_extra) : s),
    0
  );
  const unit = Number(product.price) + extras;

  return (
    <div>
      <Link to="/" className="muted" style={{ fontSize: '0.9rem' }}>
        ← Voltar
      </Link>
      {product.image_url && (
        <img
          src={product.image_url}
          alt=""
          style={{ width: '100%', borderRadius: 16, marginTop: '0.75rem', maxHeight: 220, objectFit: 'cover' }}
        />
      )}
      <h1 className="page-title" style={{ marginBottom: '0.35rem' }}>
        {product.name}
      </h1>
      <p className="muted" style={{ marginTop: 0 }}>
        {product.description}
      </p>
      <div className="price" style={{ fontSize: '1.25rem', margin: '0.75rem 0' }}>
        A partir de R$ {Number(product.price).toFixed(2)}
        {extras > 0 && (
          <span className="muted" style={{ fontWeight: 400, fontSize: '1rem' }}>
            {' '}
            + opcionais: R$ {extras.toFixed(2)} → unidade R$ {unit.toFixed(2)}
          </span>
        )}
      </div>

      {(product.options || []).length > 0 && (
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            Opcionais e adicionais
          </div>
          {(product.options || []).map((o) => (
            <label key={o.id} className="row-between" style={{ marginBottom: '0.5rem', cursor: 'pointer' }}>
              <span>
                {o.name}
                {o.required_choice && <span className="danger"> *</span>}
                {Number(o.price_extra) > 0 && (
                  <span className="muted" style={{ marginLeft: 6 }}>
                    +R$ {Number(o.price_extra).toFixed(2)}
                  </span>
                )}
              </span>
              <input type="checkbox" checked={!!selected[o.id]} onChange={() => toggleOption(o)} />
            </label>
          ))}
        </div>
      )}

      <div className="field" style={{ marginTop: '1rem' }}>
        <label>Observação do item</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: sem cebola" />
      </div>

      <div className="row-between" style={{ marginBottom: '1rem' }}>
        <span className="muted">Quantidade</span>
        <div className="qty">
          <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            −
          </button>
          <span>{qty}</span>
          <button type="button" onClick={() => setQty((q) => q + 1)}>
            +
          </button>
        </div>
      </div>

      {err && <p className="err">{err}</p>}

      <button type="button" className="btn btn-primary" disabled={!product.available || busy} onClick={handleAdd}>
        Adicionar — R$ {(unit * qty).toFixed(2)}
      </button>
    </div>
  );
}
