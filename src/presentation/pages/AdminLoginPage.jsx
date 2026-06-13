import { useState } from 'react';
import { useNavigate } from '../navigation.js';
import { api } from '../api/client.js';
import {
  ADMIN_TOKEN_KEY,
  setAdminStoreId,
  setAdminStoresList,
  setIsSuperAdmin,
} from '../admin/adminAuth.js';

export function AdminLoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@delivery.local');
  const [password, setPassword] = useState('admin123');
  const [err, setErr] = useState(null);
  const [pickStores, setPickStores] = useState(null);

  async function submit(e) {
    e.preventDefault();
    setErr(null);
    try {
      const payload = {
        email: String(email ?? '').trim().toLowerCase(),
        password: String(password ?? ''),
      };
      const res = await api.post('/admin/login', payload);
      if (!res?.token) {
        setErr('Resposta inválida do servidor (sem token).');
        return;
      }
      let stores;
      let isSuper;
      try {
        localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
        stores = Array.isArray(res.stores) ? res.stores : [];
        setAdminStoresList(stores);
        isSuper = Boolean(res.admin?.isSuperAdmin ?? res.admin?.is_super_admin);
        setIsSuperAdmin(isSuper);
      } catch (le) {
        setErr(
          le?.name === 'QuotaExceededError'
            ? 'Armazenamento cheio ou bloqueado. Libere espaço ou desative modo privado.'
            : 'Não foi possível salvar a sessão neste navegador.'
        );
        return;
      }

      if (stores.length === 0) {
        if (isSuper) {
          nav('/admin/painel/plataforma');
          return;
        }
        setErr('Nenhuma loja vinculada a este usuário.');
        return;
      }
      if (stores.length === 1) {
        setAdminStoreId(stores[0].id);
        nav('/admin/painel/pedidos');
        return;
      }
      setPickStores(stores);
    } catch (e) {
      const msg =
        e?.message === 'Failed to fetch'
          ? 'Não foi possível conectar à API. Confira se a aplicação Next está no ar.'
          : e.message || 'Erro ao entrar.';
      setErr(msg);
    }
  }

  function chooseStore(s) {
    setAdminStoreId(s.id);
    setPickStores(null);
    nav('/admin/painel/pedidos');
  }

  if (pickStores?.length) {
    return (
      <div style={{ maxWidth: 420, margin: '2rem auto' }}>
        <h1 className="page-title">Escolha a loja</h1>
        <p className="muted">Seu usuário tem acesso a mais de uma loja. Selecione para abrir o painel.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {pickStores.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => chooseStore(s)}
            >
              {s.name} <span className="muted" style={{ fontWeight: 400 }}>({s.slug})</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 400, margin: '2rem auto' }}>
      <h1 className="page-title">Admin</h1>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>E-mail</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
        </div>
        <div className="field">
          <label>Senha</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>
        {err && <p className="err">{err}</p>}
        <button type="submit" className="btn btn-primary">
          Entrar
        </button>
      </form>
    </div>
  );
}
