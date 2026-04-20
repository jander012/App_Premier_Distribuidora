import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

const emptyForm = {
  code: '',
  discountType: 'percent',
  percentValue: '10',
  maxDiscountPerOrder: '',
  fixedAmount: '',
  maxUsesPerUser: '',
  maxTotalDiscountPerUser: '',
  validFrom: '',
  validUntil: '',
};

export function AdminCouponsPage() {
  const [list, setList] = useState([]);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const rows = await api.get('/admin/coupons', { headers: adminHeaders() });
      setList(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createCoupon(e) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const body = {
        code: form.code.trim(),
        discountType: form.discountType,
        percentValue:
          form.discountType === 'percent' ? Number(String(form.percentValue).replace(',', '.')) : null,
        maxDiscountPerOrder: form.maxDiscountPerOrder.trim()
          ? Number(String(form.maxDiscountPerOrder).replace(',', '.'))
          : null,
        fixedAmount:
          form.discountType === 'fixed' ? Number(String(form.fixedAmount).replace(',', '.')) : null,
        maxUsesPerUser: form.maxUsesPerUser.trim() ? Number(form.maxUsesPerUser) : null,
        maxTotalDiscountPerUser: form.maxTotalDiscountPerUser.trim()
          ? Number(String(form.maxTotalDiscountPerUser).replace(',', '.'))
          : null,
        validFrom: form.validFrom.trim() || null,
        validUntil: form.validUntil.trim() || null,
      };
      await api.post('/admin/coupons', body, { headers: adminHeaders() });
      setForm(emptyForm);
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(c) {
    setErr(null);
    try {
      await api.patch(
        `/admin/coupons/${c.id}`,
        { active: !c.active },
        { headers: adminHeaders() }
      );
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  async function removeCoupon(id) {
    if (!window.confirm('Remover este cupom?')) return;
    setErr(null);
    try {
      await api.delete(`/admin/coupons/${id}`, { headers: adminHeaders() });
      await load();
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Cupons</h1>
        <Link to="/admin/painel/loja" className="btn btn-ghost" style={{ width: 'auto' }}>
          Voltar
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
        Limite por usuário: quantas vezes pode usar. <strong>Valor limite por usuário</strong>: teto total de desconto
        acumulado (R$) que cada cliente pode obter com este cupom. Percentual pode ter teto por pedido.
      </p>
      {err && <p className="err">{err}</p>}

      <form className="card" onSubmit={createCoupon} style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Novo cupom</h2>
        <div className="field">
          <label>Código (cliente digita no checkout)</label>
          <input
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder="PROMO10"
            required
          />
        </div>
        <div className="field">
          <label>Tipo</label>
          <select
            value={form.discountType}
            onChange={(e) => setForm((f) => ({ ...f, discountType: e.target.value }))}
          >
            <option value="percent">Percentual com limite opcional por pedido</option>
            <option value="fixed">Valor fixo (R$)</option>
          </select>
        </div>
        {form.discountType === 'percent' ? (
          <>
            <div className="field">
              <label>Percentual (%)</label>
              <input
                inputMode="decimal"
                value={form.percentValue}
                onChange={(e) => setForm((f) => ({ ...f, percentValue: e.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Teto de desconto por pedido (R$, opcional)</label>
              <input
                inputMode="decimal"
                value={form.maxDiscountPerOrder}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscountPerOrder: e.target.value }))}
                placeholder="Ex.: 20"
              />
            </div>
          </>
        ) : (
          <div className="field">
            <label>Valor fixo (R$)</label>
            <input
              inputMode="decimal"
              value={form.fixedAmount}
              onChange={(e) => setForm((f) => ({ ...f, fixedAmount: e.target.value }))}
              required
            />
          </div>
        )}
        <div className="field">
          <label>Máx. usos por usuário (vazio = ilimitado)</label>
          <input
            inputMode="numeric"
            value={form.maxUsesPerUser}
            onChange={(e) => setForm((f) => ({ ...f, maxUsesPerUser: e.target.value }))}
          />
        </div>
        <div className="field">
          <label>Valor limite total de desconto por usuário (R$, vazio = ilimitado)</label>
          <input
            inputMode="decimal"
            value={form.maxTotalDiscountPerUser}
            onChange={(e) => setForm((f) => ({ ...f, maxTotalDiscountPerUser: e.target.value }))}
            placeholder="Soma de todos os descontos com este cupom"
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
          {busy ? 'Salvando…' : 'Criar cupom'}
        </button>
      </form>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.05rem' }}>Cupons da loja</h2>
        {list.length === 0 ? (
          <p className="muted">Nenhum cupom.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Ativo</th>
                  <th>Tipo</th>
                  <th>Detalhe</th>
                  <th>Limites</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.code}</strong>
                    </td>
                    <td>{c.active ? 'sim' : 'não'}</td>
                    <td>{c.discountType}</td>
                    <td>
                      {c.discountType === 'percent'
                        ? `${c.percentValue}% (máx. pedido: ${c.maxDiscountPerOrder ?? '—'})`
                        : `R$ ${Number(c.fixedAmount).toFixed(2)}`}
                    </td>
                    <td className="muted" style={{ fontSize: '0.82rem' }}>
                      usos/usuário: {c.maxUsesPerUser ?? '∞'} · limite R$/usuário:{' '}
                      {c.maxTotalDiscountPerUser != null ? `R$ ${Number(c.maxTotalDiscountPerUser).toFixed(2)}` : '∞'}
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => toggleActive(c)}>
                        {c.active ? 'Desativar' : 'Ativar'}
                      </button>{' '}
                      <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => removeCoupon(c.id)}>
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
    </div>
  );
}
