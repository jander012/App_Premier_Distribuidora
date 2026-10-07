import { useCallback, useEffect, useState } from 'react';
import { Link } from '../navigation.js';
import { api, getClientToken, setClientToken } from '../api/client.js';
import { useCart } from '../context/CartContext.jsx';
import { useStore, withStoreQuery } from '../context/StoreContext.jsx';
import { formatDateTime, formatMoney, isOrderActive, statusLabel } from '../utils/orderStatus.js';

const ACTIVE_REFRESH_MS = 30_000;

const EMPTY_FORM = {
  fullName: '',
  email: '',
  cpf: '',
  street: '',
  number: '',
  neighborhood: '',
  zipCode: '',
  complement: '',
  reference: '',
};

function formatPhone(digits) {
  const d = String(digits || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

function maskCpf(cpf) {
  const d = String(cpf || '').replace(/\D/g, '');
  if (d.length !== 11) return cpf || '';
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

function profileToForm(profile) {
  const c = profile?.customer || {};
  const a = profile?.address || {};
  return {
    fullName: c.fullName || '',
    email: c.email || '',
    cpf: c.cpf || '',
    street: a.street || '',
    number: a.number || '',
    neighborhood: a.neighborhood || '',
    zipCode: a.zipCode || '',
    complement: a.complement || '',
    reference: a.reference || '',
  };
}

function OrderCard({ order }) {
  const active = isOrderActive(order.status);
  return (
    <Link to={`/pedido/${order.id}`} className={`card customer-order-card${active ? ' customer-order-card--active' : ''}`}>
      <div className="row-between">
        <div>
          <strong>Pedido #{order.id}</strong>
          <p className="muted" style={{ margin: '0.25rem 0 0' }}>
            {formatDateTime(order.createdAt)}
            {order.storeName ? ` · ${order.storeName}` : ''}
          </p>
        </div>
        <span className={`pill order-status-pill order-status-pill--${order.status}`}>{statusLabel(order.status)}</span>
      </div>
      {order.itemNames && (
        <p className="customer-order-card__items">
          {order.itemCount ? `${order.itemCount} ${order.itemCount === 1 ? 'item' : 'itens'}: ` : ''}
          {order.itemNames}
        </p>
      )}
      <div className="row-between" style={{ marginTop: '0.5rem' }}>
        <span className="muted">Total</span>
        <strong>{formatMoney(order.total)}</strong>
      </div>
      <span className="customer-order-card__cta">{active ? 'Acompanhar pedido' : 'Ver detalhes'} ›</span>
    </Link>
  );
}

export function CustomerOrdersPage() {
  const { storeSlug } = useStore();
  const { phone, setPhone } = useCart();
  const [orders, setOrders] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpHint, setOtpHint] = useState('');
  const [sessionReady, setSessionReady] = useState(() => !!getClientToken());
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saveMsg, setSaveMsg] = useState(null);

  const handleAuthError = useCallback((e) => {
    if (e?.status === 401) {
      setClientToken(null);
      setSessionReady(false);
      setOrders([]);
      setProfile(null);
      setErr('Sua sessão expirou. Confirme o celular novamente para ver seus pedidos.');
      return true;
    }
    return false;
  }, []);

  const loadOrders = useCallback(
    async ({ silent = false } = {}) => {
      if (!getClientToken()) return;
      if (!silent) setLoading(true);
      try {
        const data = await api.clientGet(withStoreQuery('/orders/me', storeSlug));
        setOrders(Array.isArray(data) ? data : []);
        if (!silent) setErr(null);
      } catch (e) {
        if (!handleAuthError(e) && !silent) setErr(e.message);
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [storeSlug, handleAuthError]
  );

  const loadProfile = useCallback(async () => {
    if (!getClientToken()) return;
    try {
      const data = await api.clientGet('/customers/me');
      setProfile(data);
      if (data?.phone && !phone) setPhone(data.phone);
    } catch (e) {
      handleAuthError(e);
    }
  }, [handleAuthError, phone, setPhone]);

  useEffect(() => {
    if (!sessionReady) return;
    void loadOrders();
    void loadProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionReady, storeSlug]);

  const hasActive = orders.some((o) => isOrderActive(o.status));

  useEffect(() => {
    if (!sessionReady || !hasActive) return undefined;
    const id = setInterval(() => void loadOrders({ silent: true }), ACTIVE_REFRESH_MS);
    const onFocus = () => void loadOrders({ silent: true });
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [sessionReady, hasActive, loadOrders]);

  async function requestOtp() {
    setErr(null);
    setOtpHint('');
    if (!phone || phone.length < 10) {
      setErr('Informe um celular válido com DDD');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/auth/client/request-code', { phone });
      setOtpSent(true);
      if (res.debugCode) setOtpHint(`Código de teste: ${res.debugCode}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setErr(null);
    setBusy(true);
    try {
      const res = await api.post('/auth/client/verify-code', { phone, code: otpCode });
      setClientToken(res.clientToken);
      setOtpSent(false);
      setOtpCode('');
      setOtpHint('');
      setSessionReady(true);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    setClientToken(null);
    setSessionReady(false);
    setOrders([]);
    setProfile(null);
    setEditing(false);
    setErr(null);
  }

  function startEdit() {
    setForm(profileToForm(profile));
    setSaveMsg(null);
    setEditing(true);
  }

  function field(name) {
    return {
      value: form[name],
      onChange: (e) => setForm((f) => ({ ...f, [name]: e.target.value })),
    };
  }

  async function saveProfile(e) {
    e.preventDefault();
    setSaveMsg(null);
    const required = ['fullName', 'email', 'cpf', 'street', 'number', 'neighborhood', 'zipCode'];
    if (required.some((k) => !String(form[k] || '').trim())) {
      setSaveMsg({ type: 'err', text: 'Preencha nome, e-mail, CPF e o endereço completo (rua, número, bairro e CEP).' });
      return;
    }
    setBusy(true);
    try {
      const address = {
        street: form.street.trim(),
        number: form.number.trim(),
        neighborhood: form.neighborhood.trim(),
        zipCode: form.zipCode.trim(),
        complement: form.complement.trim(),
        reference: form.reference.trim(),
      };
      if (!profile?.customer) {
        await api.clientPost('/customers/me', {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          cpf: form.cpf.trim(),
          ...address,
        });
      } else {
        await api.clientPut('/customers/me', {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          cpf: form.cpf.trim(),
        });
        const prev = profile.address;
        const locationChanged =
          !prev ||
          prev.street !== address.street ||
          prev.number !== address.number ||
          prev.neighborhood !== address.neighborhood ||
          prev.zipCode !== address.zipCode;
        if (locationChanged) {
          // Endereço novo: não reaproveita o ponto do mapa do endereço antigo.
          await api.clientPost('/customers/me/addresses', address);
        } else {
          await api.clientPut(`/addresses/${prev.id}`, address);
        }
      }
      await loadProfile();
      setEditing(false);
      setSaveMsg({ type: 'ok', text: 'Dados salvos. Eles serão usados automaticamente no próximo pedido.' });
    } catch (e2) {
      if (!handleAuthError(e2)) setSaveMsg({ type: 'err', text: e2.message });
    } finally {
      setBusy(false);
    }
  }

  const activeOrders = orders.filter((o) => isOrderActive(o.status));
  const pastOrders = orders.filter((o) => !isOrderActive(o.status));
  const customer = profile?.customer;
  const address = profile?.address;

  return (
    <div className="customer-orders-page">
      <div className="row-between customer-account-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          Minha conta
        </h1>
        {sessionReady && (
          <button type="button" className="btn btn-ghost" onClick={logout}>
            Sair
          </button>
        )}
      </div>

      {!sessionReady && (
        <section className="card" style={{ marginBottom: '1rem' }}>
          <div className="section-label" style={{ marginTop: 0 }}>
            Acessar com celular
          </div>
          <p className="muted" style={{ marginTop: 0 }}>
            Entre com o celular usado nos pedidos para ver seus dados e acompanhar o status de cada pedido. Você fica
            conectado neste aparelho.
          </p>
          <div className="field">
            <label>Celular (WhatsApp)</label>
            <input
              inputMode="numeric"
              placeholder="11999990000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          {!otpSent ? (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={requestOtp}>
              Receber código
            </button>
          ) : (
            <>
              {otpHint && <p className="muted" style={{ fontSize: '0.85rem' }}>{otpHint}</p>}
              <div className="field">
                <label>Código de 6 dígitos</label>
                <input inputMode="numeric" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} />
              </div>
              <div className="customer-account-actions">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={verifyOtp}>
                  Confirmar
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={requestOtp}>
                  Reenviar código
                </button>
              </div>
            </>
          )}
        </section>
      )}

      {err && <p className="err">{err}</p>}

      {sessionReady && (
        <section className="card customer-profile-card">
          <div className="row-between">
            <div className="section-label" style={{ margin: 0 }}>
              Meus dados
            </div>
            {!editing && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={startEdit}>
                {customer ? 'Editar' : 'Completar cadastro'}
              </button>
            )}
          </div>

          {saveMsg && <p className={saveMsg.type === 'err' ? 'err' : 'ok-msg'}>{saveMsg.text}</p>}

          {!editing && customer && (
            <dl className="customer-profile-list">
              <div>
                <dt>Nome</dt>
                <dd>{customer.fullName}</dd>
              </div>
              <div>
                <dt>Celular</dt>
                <dd>{formatPhone(profile.phone)}</dd>
              </div>
              <div>
                <dt>E-mail</dt>
                <dd>{customer.email}</dd>
              </div>
              <div>
                <dt>CPF</dt>
                <dd>{maskCpf(customer.cpf)}</dd>
              </div>
              {address && (
                <div className="customer-profile-list__full">
                  <dt>Endereço de entrega</dt>
                  <dd>
                    {address.street}, {address.number}
                    {address.complement ? ` - ${address.complement}` : ''} · {address.neighborhood}
                    {address.zipCode ? ` · CEP ${address.zipCode}` : ''}
                    {address.reference ? <span className="muted"> ({address.reference})</span> : null}
                  </dd>
                </div>
              )}
            </dl>
          )}

          {!editing && !customer && profile && (
            <p className="muted" style={{ marginBottom: 0 }}>
              Ainda não temos seu cadastro. Ele é salvo no seu primeiro pedido, ou você pode completar agora.
            </p>
          )}

          {editing && (
            <form className="customer-profile-form" onSubmit={saveProfile}>
              <div className="field">
                <label>Nome completo</label>
                <input autoComplete="name" {...field('fullName')} />
              </div>
              <div className="customer-profile-form__row">
                <div className="field">
                  <label>E-mail</label>
                  <input type="email" autoComplete="email" {...field('email')} />
                </div>
                <div className="field">
                  <label>CPF</label>
                  <input inputMode="numeric" {...field('cpf')} />
                </div>
              </div>
              <div className="customer-profile-form__row">
                <div className="field" style={{ flex: 3 }}>
                  <label>Rua</label>
                  <input autoComplete="address-line1" {...field('street')} />
                </div>
                <div className="field" style={{ flex: 1 }}>
                  <label>Número</label>
                  <input {...field('number')} />
                </div>
              </div>
              <div className="customer-profile-form__row">
                <div className="field">
                  <label>Bairro</label>
                  <input {...field('neighborhood')} />
                </div>
                <div className="field">
                  <label>CEP</label>
                  <input inputMode="numeric" autoComplete="postal-code" {...field('zipCode')} />
                </div>
              </div>
              <div className="field">
                <label>Complemento</label>
                <input {...field('complement')} />
              </div>
              <div className="field">
                <label>Ponto de referência</label>
                <input {...field('reference')} />
              </div>
              <div className="customer-account-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                  {busy ? 'Salvando…' : 'Salvar dados'}
                </button>
                <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setEditing(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {sessionReady && loading && orders.length === 0 && <p className="muted">Carregando pedidos...</p>}

      {sessionReady && !loading && orders.length === 0 && (
        <section className="card">
          <strong>Nenhum pedido encontrado</strong>
          <p className="muted" style={{ marginBottom: '0.75rem' }}>
            Quando você finalizar pedidos com este celular, eles aparecerão aqui para você acompanhar.
          </p>
          <Link to="/" className="btn btn-primary">
            Ver cardápio
          </Link>
        </section>
      )}

      {sessionReady && activeOrders.length > 0 && (
        <>
          <div className="section-label">
            Em andamento <span className="section-label__count">{activeOrders.length}</span>
          </div>
          <div className="customer-orders-list">
            {activeOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}

      {sessionReady && pastOrders.length > 0 && (
        <>
          <div className="section-label">
            Pedidos anteriores <span className="section-label__count">{pastOrders.length}</span>
          </div>
          <div className="customer-orders-list">
            {pastOrders.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
