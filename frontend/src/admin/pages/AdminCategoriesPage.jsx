import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

export function AdminCategoriesPage() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('0');
  const [active, setActive] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const list = await api.get('/admin/categories', { headers: adminHeaders() });
      setRows(Array.isArray(list) ? list : []);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(c) {
    setEditingId(c.id);
    setName(c.name || '');
    setSortOrder(String(c.sort_order ?? 0));
    setActive(c.active !== false);
  }

  function clearForm() {
    setEditingId(null);
    setName('');
    setSortOrder('0');
    setActive(true);
  }

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    const so = Number(sortOrder);
    if (!name.trim()) {
      setErr('Informe o nome da categoria.');
      return;
    }
    setBusy(true);
    try {
      if (editingId != null) {
        await api.put(
          `/admin/categories/${editingId}`,
          { name: name.trim(), sortOrder: Number.isFinite(so) ? so : 0, active },
          { headers: adminHeaders() }
        );
      } else {
        await api.post(
          '/admin/categories',
          { name: name.trim(), sortOrder: Number.isFinite(so) ? so : 0, active },
          { headers: adminHeaders() }
        );
      }
      clearForm();
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(c) {
    const n = c.product_count ?? c.productCount ?? 0;
    if (!confirm(`Excluir a categoria "${c.name}"?${n > 0 ? ` Há ${n} produto(s) vinculados — a exclusão será bloqueada.` : ''}`)) {
      return;
    }
    setErr(null);
    try {
      await api.delete(`/admin/categories/${c.id}`, { headers: adminHeaders() });
      if (editingId === c.id) clearForm();
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Categorias</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/admin/painel/produtos/novo" className="btn btn-primary" style={{ width: 'auto', textAlign: 'center' }}>
            Novo produto
          </Link>
          <Link to="/admin/painel/produtos" className="btn btn-ghost" style={{ width: 'auto', textAlign: 'center' }}>
            Lista de produtos
          </Link>
        </div>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
        As categorias aparecem no cardápio público na ordem definida. Cada produto deve pertencer a uma categoria da
        mesma loja.
      </p>
      {err && <p className="err">{err}</p>}

      <form className="card" onSubmit={submit} style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>{editingId != null ? `Editar #${editingId}` : 'Nova categoria'}</h2>
        <div className="field">
          <label>Nome *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex.: Pizzas" />
        </div>
        <div className="field">
          <label>Ordem no cardápio</label>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            min={0}
            step={1}
          />
        </div>
        <label className="row-between" style={{ cursor: 'pointer', marginBottom: '1rem' }}>
          <span>Ativa no cardápio</span>
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            {busy ? 'Salvando…' : editingId != null ? 'Salvar alterações' : 'Cadastrar'}
          </button>
          {editingId != null && (
            <button type="button" className="btn btn-ghost" onClick={clearForm}>
              Cancelar edição
            </button>
          )}
        </div>
      </form>

      <div style={{ overflowX: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Nome</th>
              <th>Ordem</th>
              <th>Ativa</th>
              <th>Produtos</th>
              <th style={{ minWidth: 160 }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}>
                <td>{c.id}</td>
                <td>{c.name}</td>
                <td>{c.sort_order}</td>
                <td>{c.active ? 'Sim' : 'Não'}</td>
                <td>{c.product_count ?? 0}</td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '0.3rem 0.55rem', fontSize: '0.82rem' }} onClick={() => startEdit(c)}>
                      Editar
                    </button>
                    <button type="button" className="btn btn-ghost" style={{ width: 'auto', padding: '0.3rem 0.55rem', fontSize: '0.82rem' }} onClick={() => remove(c)}>
                      Excluir
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && !err && <p className="muted">Nenhuma categoria. Cadastre a primeira acima.</p>}
    </div>
  );
}
