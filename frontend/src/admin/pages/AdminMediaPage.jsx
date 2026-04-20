import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

export function AdminMediaPage() {
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState('');
  const [qDebounced, setQDebounced] = useState('');
  const [publicUrl, setPublicUrl] = useState('');
  const [title, setTitle] = useState('');
  const [onlyRegisterUrl, setOnlyRegisterUrl] = useState(false);
  const [err, setErr] = useState(null);
  const [hint, setHint] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '24' });
      if (qDebounced) params.set('q', qDebounced);
      const res = await api.get(`/admin/media?${params}`, { headers: adminHeaders() });
      setItems(res.items || []);
      setTotal(res.total ?? 0);
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

  async function addMedia(e) {
    e.preventDefault();
    setErr(null);
    setHint(null);
    if (!publicUrl.trim()) return;
    try {
      await api.post(
        '/admin/media',
        {
          publicUrl: publicUrl.trim(),
          title: title.trim() || undefined,
          ...(onlyRegisterUrl ? { onlyRegisterUrl: true } : {}),
        },
        { headers: adminHeaders() }
      );
      setPublicUrl('');
      setTitle('');
      setHint(
        onlyRegisterUrl
          ? 'Link cadastrado (sem download). Copie a URL para o produto.'
          : 'Imagem baixada e hospedada neste servidor. Copie a URL abaixo para usar no produto.'
      );
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      setHint('URL copiada.');
    } catch {
      setHint(text);
    }
  }

  async function remove(id) {
    if (!id) {
      setErr('ID da mídia inválido.');
      return;
    }
    if (!confirm('Remover esta mídia?')) return;
    setErr(null);
    try {
      const enc = encodeURIComponent(String(id));
      await api.delete(`/admin/media/${enc}`, { headers: adminHeaders() });
      setHint(null);
      await load();
    } catch (e) {
      const st = e?.status;
      if (st === 409) {
        setErr(e.message || 'Imagem em uso em algum produto.');
      } else if (st === 403) {
        setErr(e.message || 'Sem permissão para excluir esta mídia.');
      } else if (st === 404) {
        setErr('Mídia não encontrada ou já removida. Atualize a página.');
      } else {
        setErr(e.message || 'Não foi possível excluir.');
      }
    }
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Imagens (biblioteca)</h1>
        <Link to="/admin/painel/produtos" className="btn btn-ghost" style={{ width: 'auto' }}>
          Produtos
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
        Para URLs <strong>http(s)</strong>, o servidor <strong>baixa a imagem</strong> e grava em disco; a URL pública vira{' '}
        <code>/api/media/files/…</code> (servida aqui), então o cardápio não depende do site original. Imagens idênticas são deduplicadas pelo conteúdo.
        Use <strong>Copiar URL</strong> no produto. Marque “só link” se quiser apenas registrar a URL sem baixar.
      </p>
      {err && <p className="err">{err}</p>}
      {hint && <p className="muted">{hint}</p>}

      <form className="card" onSubmit={addMedia} style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Nova imagem</h2>
        <div className="field">
          <label>URL pública *</label>
          <input
            type="url"
            value={publicUrl}
            onChange={(e) => setPublicUrl(e.target.value)}
            placeholder="https://…"
            required
          />
        </div>
        <div className="field">
          <label>Título (opcional)</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Pizza calabresa" />
        </div>
        <label className="field" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={onlyRegisterUrl}
            onChange={(e) => setOnlyRegisterUrl(e.target.checked)}
          />
          <span>Só cadastrar o link (não baixar arquivo)</span>
        </label>
        <button type="submit" className="btn btn-primary">
          Cadastrar
        </button>
      </form>

      <div className="field" style={{ marginBottom: '1rem' }}>
        <label>Buscar</label>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="URL ou título…" />
      </div>

      <div className="admin-product-grid">
        {items.map((m) => (
          <article key={m.id} className="card admin-product-card">
            <div className="admin-product-card__img">
              <img src={m.public_url} alt="" loading="lazy" onError={(e) => (e.target.style.opacity = 0.3)} />
            </div>
            <div className="admin-product-card__body">
              <h3 className="admin-product-card__title" style={{ fontSize: '0.95rem' }}>
                {m.title || 'Sem título'}
                {m.storage_path ? (
                  <span className="muted" style={{ fontWeight: 600, marginLeft: 6, fontSize: '0.75rem' }}>
                    · local
                  </span>
                ) : (
                  <span className="muted" style={{ fontWeight: 600, marginLeft: 6, fontSize: '0.75rem' }}>
                    · externa
                  </span>
                )}
              </h3>
              <p className="muted" style={{ fontSize: '0.72rem', wordBreak: 'break-all', margin: '0.35rem 0' }}>
                {m.public_url}
              </p>
              {m.source_url && m.storage_path ? (
                <p className="muted" style={{ fontSize: '0.68rem', wordBreak: 'break-all', margin: '0 0 0.35rem' }}>
                  Origem: {m.source_url}
                </p>
              ) : null}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
                  onClick={() => copyText(m.public_url)}
                >
                  Copiar URL
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.82rem' }}
                  onClick={() => remove(m.id)}
                >
                  Excluir
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
      <p className="muted" style={{ fontSize: '0.85rem' }}>
        Total: {total} — página {page}
      </p>
      <div className="admin-pagination">
        <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setPage((p) => p + 1)}>
          Próxima
        </button>
      </div>
    </div>
  );
}
