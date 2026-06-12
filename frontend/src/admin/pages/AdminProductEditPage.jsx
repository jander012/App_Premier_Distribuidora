import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';
import { AdminProductForm } from '../components/AdminProductForm.jsx';

export function AdminProductEditPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [categories, setCategories] = useState([]);
  const [product, setProduct] = useState(null);
  const [err, setErr] = useState(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [c, p] = await Promise.all([
        api.get('/admin/categories', { headers: adminHeaders() }),
        api.get(`/admin/products/${id}`, { headers: adminHeaders() }),
      ]);
      setCategories(c);
      setProduct(p);
    } catch (e) {
      setErr(e.message);
      setProduct(null);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpdate(body) {
    await api.put(`/admin/products/${id}`, body, { headers: adminHeaders() });
    nav(`/admin/painel/produtos/${id}`);
  }

  if (err && !product) {
    return (
      <div>
        <p className="err">{err}</p>
        <button type="button" className="btn btn-ghost" onClick={() => nav('/admin/painel/produtos')}>
          Voltar
        </button>
      </div>
    );
  }

  if (!product) {
    return <p className="muted">Carregando…</p>;
  }

  if (categories.length === 0) {
    return (
      <div>
        <p className="err">Nenhuma categoria nesta loja. Cadastre categorias antes de editar produtos.</p>
        <button type="button" className="btn btn-ghost" onClick={() => nav('/admin/painel/produtos')}>
          Voltar
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Alterar produto #{id}</h1>
      </div>
      <AdminProductForm
        categories={categories}
        initial={{
          categoryId: product.category_id,
          name: product.name,
          description: product.description || '',
          price: product.price,
          imageUrl: product.image_url || '',
          available: product.available,
        }}
        submitLabel="Salvar alterações"
        onSubmit={handleUpdate}
        onCancel={() => nav(`/admin/painel/produtos/${id}`)}
      />
    </div>
  );
}
