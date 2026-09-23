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
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [pickStores, setPickStores] = useState(null);

  async function requestCode(e) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    const normalizedEmail = String(email ?? '').trim().toLowerCase();
    if (!normalizedEmail) {
      setErr('Informe seu e-mail cadastrado.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/admin/request-code', { email: normalizedEmail });
      setEmail(normalizedEmail);
      setCodeRequested(true);
      setInfo(res?.message || 'Se o e-mail estiver cadastrado, enviaremos um código de acesso.');
      if (res?.code) setInfo(`Código de desenvolvimento: ${res.code}`);
    } catch (e) {
      setErr(e.message || 'Erro ao enviar código.');
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    try {
      const payload = {
        email: String(email ?? '').trim().toLowerCase(),
        code: String(code ?? '').trim(),
      };
      if (!payload.code) {
        setErr('Informe o código enviado ao e-mail.');
        return;
      }
      setBusy(true);
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
    } finally {
      setBusy(false);
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
      <form className="card" onSubmit={codeRequested ? submitCode : requestCode}>
        <div className="field">
          <label>E-mail</label>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (codeRequested) {
                setCodeRequested(false);
                setCode('');
                setInfo(null);
              }
            }}
            autoComplete="username"
            disabled={busy}
          />
        </div>
        {codeRequested && (
          <div className="field">
            <label>Código de acesso</label>
            <input
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              disabled={busy}
            />
          </div>
        )}
        {err && <p className="err">{err}</p>}
        {info && <p className="muted">{info}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {codeRequested ? 'Entrar' : 'Enviar código'}
        </button>
        {codeRequested && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 8 }}
            disabled={busy}
            onClick={requestCode}
          >
            Reenviar código
          </button>
        )}
      </form>
    </div>
  );
}
