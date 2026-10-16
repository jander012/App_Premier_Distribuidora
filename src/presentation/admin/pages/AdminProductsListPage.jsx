import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '../../navigation.js';
import { api, apiBase } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';
import { readListSession, restoreListScroll, writeListSession } from '../../utils/listSession.js';

const LIST_KEY = 'admin-products';

function excerpt(text, max = 100) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max).trim()}…`;
}

function initialListState() {
  const saved = readListSession(LIST_KEY);
  return {
    page: Math.max(1, Number(saved?.page) || 1),
    q: typeof saved?.q === 'string' ? saved.q : '',
    scrollY: Number(saved?.scrollY) || 0,
  };
}

export function AdminProductsListPage() {
  const boot = useRef(initialListState());
  const [data, setData] = useState({ items: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(boot.current.page);
  const [q, setQ] = useState(boot.current.q);
  const [qDebounced, setQDebounced] = useState(boot.current.q.trim());
  const [err, setErr] = useState(null);
  const fileRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const skipPageReset = useRef(true);
  const scrollRestored = useRef(false);

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
    if (skipPageReset.current) {
      skipPageReset.current = false;
      return;
    }
    setPage(1);
  }, [qDebounced]);

  useEffect(() => {
    writeListSession(LIST_KEY, { page, q, scrollY: typeof window !== 'undefined' ? window.scrollY : 0 });
  }, [page, q]);

  useEffect(() => {
    const persist = () => writeListSession(LIST_KEY, { page, q, scrollY: window.scrollY });
    window.addEventListener('pagehide', persist);
    return () => {
      persist();
      window.removeEventListener('pagehide', persist);
    };
  }, [page, q]);

  useEffect(() => {
    if (scrollRestored.current || data.items.length === 0) return;
    scrollRestored.current = true;
    restoreListScroll(boot.current.scrollY);
  }, [data.items.length]);

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setImporting(true);
    setImportResult(null);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch(`${apiBase}/admin/products/import`, {
        method: 'POST',
        headers: adminHeaders(),
        body: fd,
      });
      const text = await res.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      if (!res.ok) {
        throw new Error(json?.error || res.statusText || 'Falha ao importar');
      }
      setImportResult(json);
      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setImporting(false);
    }
  }

  const products = data.items;

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Produtos</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/admin/painel/categorias" className="btn btn-ghost" style={{ width: 'auto', textAlign: 'center' }}>
            Categorias
          </Link>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportFile}
            style={{ display: 'none' }}
          />
          <button
            type="button"
            className="btn btn-ghost"
            style={{ width: 'auto', textAlign: 'center' }}
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            title="Atualiza preço e nome pelo código único; cria o produto se não existir. Atualiza a imagem quando houver link."
          >
            {importing ? 'Importando…' : 'Importar/Atualizar (XLSX)'}
          </button>
          <Link to="/admin/painel/produtos/novo" className="btn btn-primary" style={{ width: 'auto', textAlign: 'center' }}>
            Novo produto
          </Link>
        </div>
      </div>
      {importResult && (
        <div className="card" style={{ marginBottom: '0.75rem', padding: '0.75rem 1rem' }}>
          <strong>Importação concluída</strong>
          <p className="muted" style={{ margin: '0.35rem 0 0' }}>
            {importResult.created} criado(s) · {importResult.updated} atualizado(s) ·{' '}
            {importResult.imagesUpdated} imagem(ns) · {importResult.skipped} ignorado(s)
            {importResult.errorCount > 0 ? ` · ${importResult.errorCount} erro(s)` : ''}
          </p>
          {importResult.errorCount > 0 && (
            <details style={{ marginTop: '0.35rem' }}>
              <summary className="muted" style={{ cursor: 'pointer' }}>
                Ver erros ({importResult.errorCount})
              </summary>
              <ul className="muted" style={{ margin: '0.35rem 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem' }}>
                {(importResult.errors || []).map((er, i) => (
                  <li key={i}>
                    Linha {er.line}: {er.error}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
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
