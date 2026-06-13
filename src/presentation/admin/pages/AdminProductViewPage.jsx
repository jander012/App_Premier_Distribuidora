import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

export function AdminProductViewPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [product, setProduct] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const p = await api.get(`/admin/products/${id}`, { headers: adminHeaders() });
      setProduct(p);
    } catch (e) {
      setErr(e.message);
      setProduct(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDelete() {
    if (!window.confirm('Excluir este produto permanentemente?')) return;
    try {
      await api.delete(`/admin/products/${id}`, { headers: adminHeaders() });
      nav('/admin/painel/produtos');
    } catch (e) {
      setErr(e.message);
    }
  }

  if (err && !product) {
    return (
      <div>
        <p className="err">{err}</p>
        <Link to="/admin/painel/produtos">← Voltar à lista</Link>
      </div>
    );
  }

  if (!product) {
    return <p className="muted">Carregando…</p>;
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Produto #{product.id}</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/admin/painel/produtos" className="btn btn-ghost" style={{ width: 'auto' }}>
            ← Lista
          </Link>
          <Link to={`/admin/painel/produtos/${id}/editar`} className="btn btn-primary" style={{ width: 'auto' }}>
            Alterar
          </Link>
          <button type="button" className="btn btn-ghost" style={{ width: 'auto', color: 'var(--danger)' }} onClick={handleDelete}>
            Excluir
          </button>
        </div>
      </div>

      <div className="card">
        <div className="section-label" style={{ marginTop: 0 }}>Dados</div>
        <p>
          <span className="muted">Categoria:</span> {product.category_name} (id {product.category_id})
        </p>
        <p>
          <span className="muted">Nome:</span> {product.name}
        </p>
        <p>
          <span className="muted">Descrição:</span> {product.description || '—'}
        </p>
        <p>
          <span className="muted">Preço:</span> R$ {Number(product.price).toFixed(2)}
        </p>
        <p>
          <span className="muted">URL da imagem:</span>{' '}
          {product.image_url ? (
            <a href={product.image_url} target="_blank" rel="noreferrer">
              {product.image_url}
            </a>
          ) : (
            '—'
          )}
        </p>
        <p>
          <span className="muted">Disponível:</span> {product.available ? 'Sim' : 'Não'}
        </p>
      </div>

      {product.image_url && (
        <div className="card" style={{ marginTop: '0.75rem' }}>
          <img src={product.image_url} alt="" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 12 }} />
        </div>
      )}

      {product.options?.length > 0 && (
        <div className="card" style={{ marginTop: '0.75rem' }}>
          <div className="section-label" style={{ marginTop: 0 }}>Opcionais vinculados</div>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>+R$</th>
                <th>Obrig.</th>
                <th>Ativo</th>
              </tr>
            </thead>
            <tbody>
              {product.options.map((o) => (
                <tr key={o.id}>
                  <td>{o.name}</td>
                  <td>{Number(o.price_extra).toFixed(2)}</td>
                  <td>{o.required_choice ? 'Sim' : 'Não'}</td>
                  <td>{o.active ? 'Sim' : 'Não'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
