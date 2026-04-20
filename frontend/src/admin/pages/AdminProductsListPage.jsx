import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

function excerpt(text, max = 100) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

export function AdminProductsListPage() {
  const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [err, setErr] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '12' });
      if (qDebounced) params.set('q', qDebounced);
      const res = await api.get(`/admin/products?${params.toString()}`, { headers: adminHeaders() });
      setData({
        items: res.items || [],
        total: res.total ?? 0,
        page: res.page ?? page,
        totalPages: res.totalPages ?? 1,
      });
    } catch (e) {
      setErr(e.message);
    }
  }, [page, qDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [qDebounced]);

  const products = data.items;

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Produtos</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/admin/painel/categorias" className="btn btn-ghost" style={{ width: 'auto', textAlign: 'center' }}>
            Categorias
          </Link>
          <Link to="/admin/painel/produtos/novo" className="btn btn-primary" style={{ width: 'auto', textAlign: 'center' }}>
            Novo produto
          </Link>
        </div>
      </div>
      <div className="admin-toolbar" style={{ marginTop: '-0.25rem' }}>
        <input
          type="search"
          placeholder="Buscar por nome ou descrição…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="admin-search-input"
          style={{
            flex: 1,
            minWidth: 200,
            padding: '0.5rem 0.75rem',
            borderRadius: 10,
            border: '1px solid var(--surface2)',
            background: 'var(--bg)',
            color: 'var(--text)',
          }}
        />
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
        {data.total} produto(s) — página {data.page} de {data.totalPages}
      </p>
      {err && <p className="err">{err}</p>}
      <div className="admin-product-grid">
        {products.map((p) => (
          <article key={p.id} className="card admin-product-card">
            <div className="admin-product-card__img">
              {p.image_url ? (
                <img src={p.image_url} alt="" loading="lazy" />
              ) : (
                <div className="admin-product-card__placeholder" />
              )}
            </div>
            <div className="admin-product-card__body">
              <h3 className="admin-product-card__title">{p.name}</h3>
              <p className="muted admin-product-card__desc">{excerpt(p.description)}</p>
              <div className="admin-product-card__meta">
                <span className="price">R$ {Number(p.price).toFixed(2)}</span>
                <span className="muted" style={{ fontSize: '0.8rem' }}>
                  {p.available ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.65rem' }}>
                <Link
                  to={`/admin/painel/produtos/${p.id}`}
                  className="btn btn-ghost"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                >
                  Ver
                </Link>
                <Link
                  to={`/admin/painel/produtos/${p.id}/editar`}
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                >
                  Alterar
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
      {data.totalPages > 1 && (
        <div className="admin-pagination">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Anterior
          </button>
          <span className="muted" style={{ fontSize: '0.9rem' }}>
            {page} / {data.totalPages}
          </span>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </button>
        </div>
      )}
      {products.length === 0 && !err && <p className="muted">Nenhum produto nesta página.</p>}
    </div>
  );
}
