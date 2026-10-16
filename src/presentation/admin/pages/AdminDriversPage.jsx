import { useCallback, useEffect, useState } from 'react';
import { Link } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

const EMPTY_FORM = {
  name: '',
  cpf: '',
  phone: '',
  username: '',
  password: '',
  vehicleDescription: '',
  active: true,
  isDefault: false,
};

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function AdminDriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const rows = await api.get('/admin/drivers', { headers: adminHeaders() });
      setDrivers(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setErr(e.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit(driver) {
    setEditingId(driver.id);
    setForm({
      name: driver.name || '',
      cpf: driver.cpf || '',
      phone: driver.phone || '',
      username: driver.username || '',
      password: '',
      vehicleDescription: driver.vehicleDescription || '',
      active: driver.active !== false,
      isDefault: Boolean(driver.isDefault),
    });
    setMsg(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function saveDriver(e) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const payload = {
        name: form.name.trim(),
        cpf: form.cpf.trim(),
        phone: digitsOnly(form.phone),
        username: form.username.trim().toLowerCase(),
        vehicleDescription: form.vehicleDescription.trim(),
        active: form.active,
        isDefault: form.isDefault,
      };
      if (!payload.name || !payload.username) {
        throw new Error('Informe nome e usuário de acesso.');
      }
      if (editingId) {
        if (form.password.trim()) payload.password = form.password.trim();
        await api.put(`/admin/drivers/${editingId}`, payload, { headers: adminHeaders() });
        setMsg('Entregador atualizado.');
      } else {
        if (form.password.trim().length < 4) throw new Error('Senha com pelo menos 4 caracteres.');
        payload.password = form.password.trim();
        await api.post('/admin/drivers', payload, { headers: adminHeaders() });
        setMsg('Entregador cadastrado.');
      }
      resetForm();
      await load();
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  async function setAsDefault(driverId) {
    setBusy(true);
    setErr(null);
    try {
      const res = await api.put('/admin/drivers/default', { driverId }, { headers: adminHeaders() });
      setDrivers(Array.isArray(res.drivers) ? res.drivers : []);
      setMsg('Entregador padrão atualizado. Novos pedidos usam este cadastro.');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Entregadores</h1>
        <Link to="/admin/painel/pedidos" className="btn btn-ghost" style={{ width: 'auto' }}>
          Pedidos
        </Link>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        Cadastre os entregadores, escolha o padrão usado nos pedidos e informe o WhatsApp para enviar a localização.
      </p>
      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}

      <form className="card" onSubmit={saveDriver} style={{ marginBottom: '1.25rem' }}>
        <div className="section-label" style={{ marginTop: 0 }}>
          {editingId ? `Editar entregador #${editingId}` : 'Novo entregador'}
        </div>
        <div className="admin-filters__grid">
          <div className="field">
            <label>Nome *</label>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          </div>
          <div className="field">
            <label>WhatsApp (com DDD) *</label>
            <input
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              placeholder="65999990000"
              inputMode="tel"
            />
          </div>
          <div className="field">
            <label>CPF</label>
            <input value={form.cpf} onChange={(e) => setForm((f) => ({ ...f, cpf: e.target.value }))} />
          </div>
          <div className="field">
            <label>Usuário (app) *</label>
            <input
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              autoComplete="off"
              required
            />
          </div>
          <div className="field">
            <label>{editingId ? 'Nova senha (opcional)' : 'Senha *'}</label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
          </div>
          <div className="field">
            <label>Veículo</label>
            <input
              value={form.vehicleDescription}
              onChange={(e) => setForm((f) => ({ ...f, vehicleDescription: e.target.value }))}
              placeholder="Moto Honda / placa"
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', margin: '0.5rem 0 1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Ativo
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))}
            />
            Usar como padrão nos pedidos
          </label>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button type="submit" className="btn btn-primary" disabled={busy} style={{ width: 'auto' }}>
            {busy ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar'}
          </button>
          {editingId && (
            <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={resetForm}>
              Cancelar
            </button>
          )}
        </div>
      </form>

      <div className="admin-product-grid">
        {drivers.map((d) => (
          <article key={d.id} className="card admin-product-card">
            <div className="admin-product-card__body">
              <h3 className="admin-product-card__title">
                {d.name}
                {d.isDefault && (
                  <span className="pill" style={{ marginLeft: 8, fontSize: '0.75rem' }}>
                    Padrão
                  </span>
                )}
              </h3>
              <p className="muted" style={{ margin: '0.25rem 0' }}>
                WhatsApp: {d.phone || '—'} · Usuário: {d.username}
              </p>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {d.vehicleDescription || 'Sem veículo informado'} · {d.active ? 'Ativo' : 'Inativo'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                  onClick={() => startEdit(d)}
                >
                  Editar
                </button>
                {!d.isDefault && d.active && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                    disabled={busy}
                    onClick={() => setAsDefault(d.id)}
                  >
                    Definir padrão
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
      {drivers.length === 0 && !err && <p className="muted">Nenhum entregador cadastrado ainda.</p>}
    </div>
  );
}
