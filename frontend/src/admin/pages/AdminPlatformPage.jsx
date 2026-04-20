import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client.js';
import {
  adminHeaders,
  getAdminStoreId,
  getIsSuperAdmin,
  mergeAdminStoresSession,
  setAdminStoreId,
} from '../adminAuth.js';

export function AdminPlatformPage() {
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const [newStoreName, setNewStoreName] = useState('');
  const [newStoreSlug, setNewStoreSlug] = useState('');
  const [linkSelf, setLinkSelf] = useState(true);

  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newIsSuper, setNewIsSuper] = useState(false);
  const [newStoreIds, setNewStoreIds] = useState(() => new Set());

  const [draftStoresByAdmin, setDraftStoresByAdmin] = useState({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const [sList, aList] = await Promise.all([
        api.get('/admin/platform/stores', { headers: adminHeaders() }),
        api.get('/admin/platform/admins', { headers: adminHeaders() }),
      ]);
      setStores(Array.isArray(sList) ? sList : []);
      setAdmins(Array.isArray(aList) ? aList : []);
    } catch (e) {
      if (e.status === 403) {
        setErr('Apenas super administrador pode acessar esta página.');
      } else {
        setErr(e.message);
      }
    }
  }, []);

  useEffect(() => {
    if (!getIsSuperAdmin()) {
      navigate('/admin/painel/pedidos', { replace: true });
      return;
    }
    load();
  }, [load, navigate]);

  async function submitStore(e) {
    e.preventDefault();
    setErr(null);
    if (!newStoreName.trim()) {
      setErr('Informe o nome da loja.');
      return;
    }
    setBusy(true);
    try {
      const created = await api.post(
        '/admin/platform/stores',
        {
          name: newStoreName.trim(),
          slug: newStoreSlug.trim() || undefined,
          linkCurrentAdmin: linkSelf,
        },
        { headers: adminHeaders() }
      );
      setNewStoreName('');
      setNewStoreSlug('');
      if (linkSelf && created?.id) {
        mergeAdminStoresSession(created);
        if (!getAdminStoreId()) setAdminStoreId(created.id);
      }
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitAdmin(e) {
    e.preventDefault();
    setErr(null);
    if (!newEmail.trim()) {
      setErr('Informe o e-mail do novo usuário.');
      return;
    }
    if (newPassword.length < 6) {
      setErr('Senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setBusy(true);
    try {
      await api.post(
        '/admin/platform/admins',
        {
          email: newEmail.trim().toLowerCase(),
          password: newPassword,
          isSuperAdmin: newIsSuper,
          storeIds: [...newStoreIds],
        },
        { headers: adminHeaders() }
      );
      setNewEmail('');
      setNewPassword('');
      setNewIsSuper(false);
      setNewStoreIds(new Set());
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleNewStore(id) {
    setNewStoreIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDraft(adminId, storeId) {
    setDraftStoresByAdmin((d) => {
      const admin = admins.find((x) => x.id === adminId);
      const fromServer = (admin?.stores || []).map((s) => s.id);
      const cur =
        d[adminId] != null ? new Set(d[adminId]) : new Set(fromServer);
      if (cur.has(storeId)) cur.delete(storeId);
      else cur.add(storeId);
      return { ...d, [adminId]: cur };
    });
  }

  async function saveAdminStores(adminId) {
    const admin = admins.find((x) => x.id === adminId);
    const draft = draftStoresByAdmin[adminId];
    const ids =
      draft != null ? [...draft] : (admin?.stores || []).map((s) => s.id);
    setErr(null);
    setBusy(true);
    try {
      await api.patch(
        `/admin/platform/admins/${adminId}/stores`,
        { storeIds: ids },
        { headers: adminHeaders() }
      );
      setDraftStoresByAdmin((d) => {
        const { [adminId]: _, ...rest } = d;
        return rest;
      });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function selectedSetForAdmin(a) {
    if (draftStoresByAdmin[a.id] != null) return draftStoresByAdmin[a.id];
    return new Set((a.stores || []).map((s) => s.id));
  }

  return (
    <div style={{ padding: '1rem', maxWidth: 960 }}>
      <h1 className="page-title">Plataforma</h1>
      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Cadastre lojas e usuários do painel. Somente super administradores veem esta página.
      </p>
      {err && <p className="err">{err}</p>}

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Nova loja</h2>
        <form onSubmit={submitStore} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>Nome</label>
            <input
              value={newStoreName}
              onChange={(e) => setNewStoreName(e.target.value)}
              placeholder="Ex.: Loja Centro"
            />
          </div>
          <div className="field">
            <label>Slug (opcional)</label>
            <input
              value={newStoreSlug}
              onChange={(e) => setNewStoreSlug(e.target.value)}
              placeholder="gerado a partir do nome se vazio"
            />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={linkSelf} onChange={(e) => setLinkSelf(e.target.checked)} />
            Vincular esta loja ao meu usuário
          </label>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Criar loja
          </button>
        </form>
      </section>

      <section className="card" style={{ marginBottom: '1.25rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Novo usuário admin</h2>
        <form onSubmit={submitAdmin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>E-mail</label>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="checkbox" checked={newIsSuper} onChange={(e) => setNewIsSuper(e.target.checked)} />
            Super administrador
          </label>
          <div className="field">
            <span className="muted" style={{ fontSize: '0.85rem' }}>
              Lojas com acesso
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', marginTop: 8 }}>
              {stores.map((s) => (
                <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={newStoreIds.has(s.id)}
                    onChange={() => toggleNewStore(s.id)}
                  />
                  {s.name}
                </label>
              ))}
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Criar usuário
          </button>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Lojas</h2>
        <ul className="muted" style={{ margin: 0, paddingLeft: '1.25rem' }}>
          {stores.map((s) => (
            <li key={s.id}>
              {s.name} <span style={{ opacity: 0.8 }}>({s.slug})</span>
              {!s.active && <span> — inativa</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="card" style={{ marginTop: '1.25rem' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.1rem' }}>Usuários e lojas</h2>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid rgba(148,163,184,0.35)' }}>
                <th style={{ padding: '0.5rem 0' }}>E-mail</th>
                <th>Super</th>
                <th>Lojas</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <tr key={a.id} style={{ borderBottom: '1px solid rgba(148,163,184,0.2)' }}>
                  <td style={{ padding: '0.65rem 0', verticalAlign: 'top' }}>{a.email}</td>
                  <td style={{ verticalAlign: 'top' }}>{a.is_super_admin ? 'Sim' : '—'}</td>
                  <td style={{ verticalAlign: 'top' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {stores.map((s) => {
                        const sel = selectedSetForAdmin(a);
                        return (
                          <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <input
                              type="checkbox"
                              checked={sel.has(s.id)}
                              onChange={() => toggleDraft(a.id, s.id)}
                            />
                            {s.name}
                          </label>
                        );
                      })}
                    </div>
                  </td>
                  <td style={{ verticalAlign: 'top', paddingLeft: 8 }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy}
                      onClick={() => saveAdminStores(a.id)}
                    >
                      Salvar lojas
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
