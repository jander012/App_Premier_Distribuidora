import { useCallback, useEffect, useState } from 'react';
import { Link } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

const emptyForm = {
  productId: '',
  productLabel: '',
  sortOrder: '0',
  validFrom: '',
  validUntil: '',
};

function formatDateTime(v) {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function toDatetimeLocalValue(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AdminPromotionsPage() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [productQ, setProductQ] = useState('');
  const [productQDebounced, setProductQDebounced] = useState('');
  const [productHits, setProductHits] = useState([]);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    const t = setTimeout(() => setProductQDebounced(productQ.trim()), 350);
    return () => clearTimeout(t);
  }, [productQ]);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const rows = await api.get('/admin/promotions', { headers: adminHeaders() });
      setList(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!productQDebounced) {
      setProductHits([]);
      return;
    }
    let on = true;
    (async () => {
      try {
        const params = new URLSearchParams({ page: '1', limit: '8', q: productQDebounced });
        const res = await api.get(`/admin/products?${params.toString()}`, { headers: adminHeaders() });
        if (!on) return;
        setProductHits(Array.isArray(res?.items) ? res.items : []);
      } catch {
        if (on) setProductHits([]);
      }
    })();
    return () => {
      on = false;
    };
  }, [productQDebounced]);

  function pickProduct(p) {
    setForm((f) => ({
      ...f,
      productId: String(p.id),
      productLabel: p.name,
    }));
    setProductQ('');
    setProductHits([]);
  }

  async function createPromotion(e) {
    e.preventDefault();
    if (!form.productId) {
      setErr('Selecione um produto na busca');
      return;
    }
    setErr(null);
    setBusy(true);
    try {
      await api.post(
        '/admin/promotions',
        {
          productId: Number(form.productId),
          sortOrder: Number(form.sortOrder) || 0,
          validFrom: form.validFrom.trim() || null,
          validUntil: form.validUntil.trim() || null,
        },
        { headers: adminHeaders() }
      );
      setForm(emptyForm);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row) {
    setErr(null);
    try {
      await api.patch(`/admin/promotions/${row.id}`, { active: !row.active }, { headers: adminHeaders() });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removePromotion(id) {
    if (!window.confirm('Remover este destaque/promoção?')) return;
    setErr(null);
    try {
      await api.delete(`/admin/promotions/${id}`, { headers: adminHeaders() });
      if (editing?.id === id) setEditing(null);
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  function startEdit(row) {
    setEditing({
      id: row.id,
      sortOrder: String(row.sortOrder ?? 0),
      validFrom: toDatetimeLocalValue(row.validFrom),
      validUntil: toDatetimeLocalValue(row.validUntil),
    });
  }

  async function saveEdit(e) {
    e.preventDefault();
    if (!editing) return;
    setErr(null);
    setBusy(true);
    try {
      await api.patch(
        `/admin/promotions/${editing.id}`,
        {
          sortOrder: Number(editing.sortOrder) || 0,
          validFrom: editing.validFrom.trim() || null,
          validUntil: editing.validUntil.trim() || null,
        },
        { headers: adminHeaders() }
      );
      setEditing(null);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Destaques e promoções</h1>
        <Link to="/admin/painel/produtos" className="btn btn-ghost" style={{ width: 'auto' }}>
          Produtos
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
        Produtos exibidos no carrossel &quot;Destaques e promoções&quot; do cardápio. Defina a vigência para
        promoções temporárias; deixe em branco para destaque contínuo.
      </p>
      {err && <p className="err">{err}</p>}

      <form className="card" onSubmit={createPromotion} style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Novo destaque / promoção</h2>
        <div className="field">
          <label>Buscar produto</label>
          <input
            type="search"
            value={productQ}
            onChange={(e) => setProductQ(e.target.value)}
            placeholder="Nome do produto…"
            className="admin-search-input"
          />
          {productHits.length > 0 && (
            <ul className="admin-promo-picker">
              {productHits.map((p) => (
                <li key={p.id}>
                  <button type="button" className="admin-promo-picker__btn" onClick={() => pickProduct(p)}>
                    <span>{p.name}</span>
                    <span className="muted">R$ {Number(p.price).toFixed(2)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {form.productId && (
          <p className="muted" style={{ marginTop: 0 }}>
            Selecionado: <strong>{form.productLabel}</strong>{' '}
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: 'auto', padding: '0.15rem 0.5rem', fontSize: '0.82rem' }}
              onClick={() => setForm((f) => ({ ...f, productId: '', productLabel: '' }))}
            >
              Trocar
            </button>
          </p>
        )}
        <div className="field">
          <label>Ordem no carrossel (menor = primeiro)</label>
          <input
            inputMode="numeric"
            value={form.sortOrder}
            onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Válido de (opcional)</label>
          <input
            type="datetime-local"
            value={form.validFrom}
            onChange={(e) => setForm((f) => ({ ...f, validFrom: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Válido até (opcional)</label>
          <input
            type="datetime-local"
            value={form.validUntil}
            onChange={(e) => setForm((f) => ({ ...f, validUntil: e.target.value }))}
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? 'Salvando…' : 'Adicionar ao cardápio'}
        </button>
      </form>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Promoções cadastradas</h2>
        {list.length === 0 ? (
          <p className="muted">Nenhum destaque cadastrado.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>Ordem</th>
                  <th>Vigência</th>
                  <th>Ativo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.productName}</strong>
                      <div className="muted" style={{ fontSize: '0.82rem' }}>
                        R$ {Number(row.productPrice).toFixed(2)}
                        {!row.productAvailable ? ' · indisponível' : ''}
                      </div>
                    </td>
                    <td>{row.sortOrder}</td>
                    <td className="muted" style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}>
                      {formatDateTime(row.validFrom)} → {formatDateTime(row.validUntil)}
                    </td>
                    <td>{row.active ? 'sim' : 'não'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: 'auto' }}
                        onClick={() => startEdit(row)}
                      >
                        Editar
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: 'auto' }}
                        onClick={() => toggleActive(row)}
                      >
                        {row.active ? 'Desativar' : 'Ativar'}
                      </button>{' '}
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ width: 'auto' }}
                        onClick={() => removePromotion(row.id)}
                      >
                        Excluir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && (
        <form className="card" onSubmit={saveEdit} style={{ marginTop: '1rem' }}>
          <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Editar vigência e ordem</h2>
          <div className="field">
            <label>Ordem</label>
            <input
              inputMode="numeric"
              value={editing.sortOrder}
              onChange={(e) => setEditing((x) => ({ ...x, sortOrder: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Válido de</label>
            <input
              type="datetime-local"
              value={editing.validFrom}
              onChange={(e) => setEditing((x) => ({ ...x, validFrom: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>Válido até</label>
            <input
              type="datetime-local"
              value={editing.validUntil}
              onChange={(e) => setEditing((x) => ({ ...x, validUntil: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" className="btn btn-primary" style={{ width: 'auto' }} disabled={busy}>
              Salvar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: 'auto' }}
              onClick={() => setEditing(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
