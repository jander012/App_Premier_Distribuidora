import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';
import { AdminProductForm } from '../components/AdminProductForm.jsx';

export function AdminProductNewPage() {
  const nav = useNavigate();
  const [categories, setCategories] = useState([]);
  const [err, setErr] = useState(null);
  const [catLoading, setCatLoading] = useState(true);

  const loadCategories = useCallback(async () => {
    setCatLoading(true);
    setErr(null);
    try {
      const c = await api.get('/admin/categories', { headers: adminHeaders() });
      setCategories(Array.isArray(c) ? c : []);
    } catch (e) {
      setErr(e.message);
    } finally {
      setCatLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  async function handleCreate(body) {
    await api.post('/admin/products', body, { headers: adminHeaders() });
    nav('/admin/painel/produtos');
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Novo produto</h1>
      </div>
      {err && <p className="err">{err}</p>}
      {categories.length > 0 && (
        <AdminProductForm
          categories={categories}
          initial={{ categoryId: categories[0].id, name: '', description: '', price: '', imageUrl: '', available: true }}
          submitLabel="Cadastrar"
          onSubmit={handleCreate}
          onCancel={() => nav('/admin/painel/produtos')}
        />
      )}
      {catLoading && <p className="muted">Carregando categorias…</p>}
      {!catLoading && categories.length === 0 && (
        <p className="muted">
          Não há categorias nesta loja.{' '}
          <Link to="/admin/painel/categorias" style={{ color: 'var(--accent)' }}>
            Cadastre categorias
          </Link>{' '}
          antes de criar produtos.
        </p>
      )}
    </div>
  );
}
