import { useCallback, useEffect, useState } from 'react';
import { Link } from '../../navigation.js';
import { api } from '../../api/client.js';
import { adminHeaders } from '../adminAuth.js';

export function AdminDriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [cadastroUrl, setCadastroUrl] = useState(null);
  const [remoteConfigured, setRemoteConfigured] = useState(false);
  const [syncInfo, setSyncInfo] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [ssoOpenId, setSsoOpenId] = useState(null);
  const [ssoLogins, setSsoLogins] = useState([]);
  const [ssoEmail, setSsoEmail] = useState('');
  const [ssoBusy, setSsoBusy] = useState(false);

  const applyPayload = useCallback((payload) => {
    const list = Array.isArray(payload) ? payload : payload?.drivers;
    setDrivers(Array.isArray(list) ? list : []);
    setRemoteConfigured(Boolean(payload?.remoteConfigured));
    setCadastroUrl(payload?.cadastroUrl || null);
    setSyncInfo(payload?.sync || null);
  }, []);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const payload = await api.get('/admin/drivers', { headers: adminHeaders() });
      applyPayload(payload);
      if (payload?.sync?.syncError) {
        setErr(`Não foi possível atualizar do Premier agora: ${payload.sync.syncError}`);
      }
    } catch (e) {
      setErr(e.message);
    }
  }, [applyPayload]);

  useEffect(() => {
    load();
  }, [load]);

  async function refreshFromPremier() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const payload = await api.post('/admin/drivers/sync', {}, { headers: adminHeaders() });
      applyPayload(payload);
      setMsg(
        `Lista atualizada do cadastro Premier (${payload?.sync?.remoteCount ?? drivers.length} entregador(es)).`
      );
    } catch (e) {
      setErr(e.message);
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
      setMsg('Entregador padrão atualizado (destaque no painel). Pedidos só são atribuídos após leitura do QR/código no app com o login do entregador.');
    } catch (ex) {
      setErr(ex.message);
    } finally {
      setBusy(false);
    }
  }

  async function openSsoLogins(driverId) {
    setErr(null);
    setSsoBusy(true);
    try {
      if (ssoOpenId === driverId) {
        setSsoOpenId(null);
        setSsoLogins([]);
        return;
      }
      const res = await api.get(`/admin/drivers/${driverId}/sso-logins`, { headers: adminHeaders() });
      setSsoOpenId(driverId);
      setSsoLogins(Array.isArray(res.logins) ? res.logins : []);
      setSsoEmail('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSsoBusy(false);
    }
  }

  async function addSsoLogin(driverId) {
    const email = ssoEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      setErr('Informe um e-mail SSO válido');
      return;
    }
    setSsoBusy(true);
    setErr(null);
    try {
      const res = await api.post(
        `/admin/drivers/${driverId}/sso-logins`,
        { email },
        { headers: adminHeaders() }
      );
      setSsoLogins(Array.isArray(res.logins) ? res.logins : []);
      setSsoEmail('');
      setMsg(`Login SSO ${email} vinculado a este entregador.`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSsoBusy(false);
    }
  }

  async function removeSsoLogin(driverId, loginId) {
    setSsoBusy(true);
    setErr(null);
    try {
      const res = await api.delete(`/admin/drivers/${driverId}/sso-logins/${loginId}`, {
        headers: adminHeaders(),
      });
      setSsoLogins(Array.isArray(res.logins) ? res.logins : []);
      setMsg('Login SSO removido.');
    } catch (e) {
      setErr(e.message);
    } finally {
      setSsoBusy(false);
    }
  }

  return (
    <div>
      <div className="admin-toolbar">
        <h1>Entregadores</h1>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <Link to="/admin/painel/pedidos" className="btn btn-ghost" style={{ width: 'auto' }}>
            Pedidos
          </Link>
          {remoteConfigured && (
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: 'auto' }}
              disabled={busy}
              onClick={refreshFromPremier}
            >
              {busy ? 'Atualizando…' : 'Atualizar do Premier'}
            </button>
          )}
        </div>
      </div>

      <section className="card" style={{ marginBottom: '1rem' }}>
        <div className="section-label" style={{ marginTop: 0 }}>
          Cadastro
        </div>
        {remoteConfigured ? (
          <>
            <p style={{ marginTop: 0 }}>
              Os entregadores vêm do mesmo cadastro do sistema Premier (
              <strong>enviar_dados_entregador</strong>
              ). Vincule os logins SSO (pode ser mais de um e-mail por pessoa). O pedido só fica com um entregador
              depois que ele lê o QR/código no app logado — o “padrão” não atribui sozinho.
            </p>
            {cadastroUrl && (
              <p style={{ margin: '0 0 0.75rem' }}>
                <a href={cadastroUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ width: 'auto', display: 'inline-flex' }}>
                  Abrir cadastro de entregadores
                </a>
              </p>
            )}
            {syncInfo?.remoteCount != null && (
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                Última sincronização: {syncInfo.remoteCount} no Premier
                {syncInfo.syncError ? ` · aviso: ${syncInfo.syncError}` : ''}
              </p>
            )}
          </>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Configure <code>ENTREGADORES_API_BASE_URL</code> (ex.: https://chat.premierdistribuidora.com.br) e{' '}
            <code>ENTREGADORES_API_KEY</code> (PLUGIN_API_KEY) no servidor para buscar o cadastro Premier.
          </p>
        )}
      </section>

      {err && <p className="err">{err}</p>}
      {msg && <p className="ok-msg">{msg}</p>}

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
                WhatsApp: {d.phone || '—'}
                {d.externalEmail ? ` · ${d.externalEmail}` : d.username ? ` · ${d.username}` : ''}
              </p>
              <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>
                {d.externalSource === 'premier' ? 'Cadastro Premier' : 'Local'} · {d.active ? 'Ativo' : 'Inativo'}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.75rem' }}>
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
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                  disabled={ssoBusy}
                  onClick={() => openSsoLogins(d.id)}
                >
                  {ssoOpenId === d.id ? 'Fechar logins SSO' : 'Logins SSO'}
                </button>
              </div>
              {ssoOpenId === d.id && (
                <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                  <p className="muted" style={{ margin: '0 0 0.5rem', fontSize: '0.85rem' }}>
                    Vários e-mails SSO podem entrar no app como esta pessoa.
                  </p>
                  <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.1rem' }}>
                    {ssoLogins.map((l) => (
                      <li key={l.id} style={{ marginBottom: 4 }}>
                        <code>{l.email}</code>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          style={{ width: 'auto', padding: '0.15rem 0.45rem', fontSize: '0.75rem', marginLeft: 8 }}
                          disabled={ssoBusy}
                          onClick={() => removeSsoLogin(d.id, l.id)}
                        >
                          Remover
                        </button>
                      </li>
                    ))}
                    {ssoLogins.length === 0 && <li className="muted">Nenhum login SSO vinculado.</li>}
                  </ul>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <input
                      type="email"
                      placeholder="email@sso..."
                      value={ssoEmail}
                      onChange={(e) => setSsoEmail(e.target.value)}
                      style={{ flex: 1, minWidth: 160 }}
                    />
                    <button
                      type="button"
                      className="btn btn-primary"
                      style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.85rem' }}
                      disabled={ssoBusy}
                      onClick={() => addSsoLogin(d.id)}
                    >
                      Vincular
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
      {drivers.length === 0 && !err && (
        <p className="muted">
          Nenhum entregador encontrado.
          {remoteConfigured ? ' Cadastre no Premier e clique em Atualizar.' : ''}
        </p>
      )}
    </div>
  );
}
