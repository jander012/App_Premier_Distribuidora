import { useState } from 'react';
import { Link } from '../../navigation.js';
import { AdminMediaPicker } from './AdminMediaPicker.jsx';

/**
 * @param {{ id: number, name: string, sort_order?: number, active?: boolean }[]} categories
 * @param {{ categoryId: number, name: string, description: string, price: string|number, imageUrl: string, available: boolean }} initial
 * @param {(body: object) => Promise<void>} onSubmit
 * @param {string} submitLabel
 * @param {() => void} onCancel
 */
export function AdminProductForm({ categories, initial, onSubmit, submitLabel, onCancel }) {
  const [categoryId, setCategoryId] = useState(String(initial.categoryId ?? ''));
  const [name, setName] = useState(initial.name ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [price, setPrice] = useState(
    initial.price != null && initial.price !== '' ? String(initial.price).replace('.', ',') : ''
  );
  const [imageUrl, setImageUrl] = useState(initial.imageUrl ?? '');
  const [available, setAvailable] = useState(initial.available !== false);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(null);
    const p = Number(String(price).replace(',', '.'));
    if (!categoryId || !name.trim() || !Number.isFinite(p) || p < 0) {
      setErr('Preencha categoria, nome e preço válidos.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({
        categoryId: Number(categoryId),
        name: name.trim(),
        description: description.trim(),
        price: p,
        imageUrl: imageUrl.trim() || undefined,
        available,
      });
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card" onSubmit={handleSubmit}>
      {err && <p className="err">{err}</p>}
      <div className="field">
        <label>Categoria *</label>
        <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          <option value="">Selecione…</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.active === false ? ' (inativa no cardápio)' : ''}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Nome *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </div>
      <div className="field">
        <label>Descrição</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="field">
        <label>Preço (R$) *</label>
        <input
          inputMode="decimal"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          required
        />
      </div>
      <div className="field">
        <label>URL da imagem</label>
        <input
          type="text"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          placeholder="https://… ou /api/media/files/… (biblioteca)"
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => setPickerOpen(true)}>
            Biblioteca…
          </button>
          <Link to="/admin/painel/midias" className="btn btn-ghost" style={{ width: 'auto', textAlign: 'center' }}>
            Gerenciar imagens
          </Link>
        </div>
      </div>
      <AdminMediaPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={(url) => setImageUrl(url)}
      />
      <label className="row-between" style={{ cursor: 'pointer', marginBottom: '1rem' }}>
        <span>Disponível para venda</span>
        <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
      </label>
      <div className="row-between" style={{ gap: '0.5rem' }}>
        <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={busy}>
          {busy ? 'Salvando…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
