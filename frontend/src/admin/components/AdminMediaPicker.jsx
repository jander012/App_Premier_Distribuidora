import { useCallback, useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

export function AdminMediaPicker({ open, onClose, onPick }) {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!open) return;
    setErr(null);
    try {
      const res = await api.get(`/admin/media?page=${page}&limit=30`, { headers: adminHeaders() });
      setItems(res.items || []);
    } catch (e) {
      setErr(e.message);
    }
  }, [open, page]);

  useEffect(() => {
    load();
  }, [load]);

  if (!open) return null;

  return (
    <div className="admin-modal-backdrop" role="dialog" aria-modal="true" aria-label="Biblioteca de imagens">
      <div className="admin-modal card">
        <div className="row-between" style={{ marginBottom: '0.75rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Escolher URL da biblioteca</h2>
          <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={onClose}>
            Fechar
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.82rem', marginTop: 0 }}>
          Clique na imagem para preencher o campo URL no produto.
        </p>
        {err && <p className="err">{err}</p>}
        {items.length === 0 && !err && <p className="muted">Nenhuma imagem nesta loja. Cadastre em Imagens.</p>}
        <div className="admin-media-picker-grid">
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              className="admin-media-picker-tile"
              onClick={() => {
                const hasLocal = Boolean(m.storage_path && String(m.storage_path).trim());
                onPick(hasLocal ? `/api/media/files/${m.id}` : (m.public_url || ''));
                onClose();
              }}
            >
              <img src={m.public_url} alt="" loading="lazy" />
              <span className="admin-media-picker-caption">{m.title || 'Sem título'}</span>
            </button>
          ))}
        </div>
        <div className="admin-pagination" style={{ marginTop: '0.75rem' }}>
          <button type="button" className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setPage((p) => p + 1)}>
            Próxima
          </button>
        </div>
      </div>
    </div>
  );
}
