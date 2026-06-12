import { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from '../navigation.js';
import { api } from '../api/client.js';
import {
  adminAuthHeadersOnly,
  clearAdminClientSession,
  getAdminStoreId,
  getAdminStoresList,
  getAdminToken,
  getIsSuperAdmin,
  setAdminStoreId,
  setAdminStoresList,
  setIsSuperAdmin,
} from './adminAuth.js';

const SIDEBAR_KEY = 'admin_sidebar_collapsed';
const MOBILE_MQ = '(max-width: 768px)';

function useIsMobileMenuMode() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(MOBILE_MQ).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_MQ);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isMobile;
}

export function AdminLayout({ children }) {
  const nav = useNavigate();
  const location = useLocation();
  const isMobileNav = useIsMobileMenuMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === '1');
  const [needStore, setNeedStore] = useState(false);
  const [sessionV, setSessionV] = useState(0);
  const [booting, setBooting] = useState(true);
  const [bootErr, setBootErr] = useState(null);

  const stores = useMemo(() => getAdminStoresList(), [needStore, sessionV]);

  useEffect(() => {
    function onRefresh() {
      setSessionV((v) => v + 1);
    }
    window.addEventListener('admin-session-refresh', onRefresh);
    return () => window.removeEventListener('admin-session-refresh', onRefresh);
  }, []);

  useEffect(() => {
    let alive = true;
    async function bootstrap() {
      setBootErr(null);
      if (!getAdminToken()) {
        setBooting(false);
        nav('/admin', { replace: true });
        return;
      }
      let list = getAdminStoresList();
      let isSuper = getIsSuperAdmin();
      if (list.length === 0) {
        try {
          const me = await api.get('/admin/me', { headers: adminAuthHeadersOnly() });
          if (!alive) return;
          setAdminStoresList(me.stores || []);
          isSuper = Boolean(me.admin?.isSuperAdmin ?? me.admin?.is_super_admin);
          setIsSuperAdmin(isSuper);
          setSessionV((v) => v + 1);
          list = me.stores || [];
        } catch (e) {
          if (!alive) return;
          if (e?.status === 401) {
            clearAdminClientSession();
            setBooting(false);
            nav('/admin', { replace: true });
            return;
          }
          list = getAdminStoresList();
          isSuper = getIsSuperAdmin();
          if (list.length === 0 && !isSuper) {
            setBootErr(
              e?.message === 'Failed to fetch'
                ? 'Sem conexão com a API. Confira se a aplicação Next está no ar.'
                : e?.message || 'Não foi possível carregar a sessão.'
            );
            setBooting(false);
            return;
          }
        }
      }
      if (!alive) return;
      if (list.length === 0 && !isSuper) {
        clearAdminClientSession();
        setBooting(false);
        nav('/admin', { replace: true });
        return;
      }
      if (!getAdminStoreId()) {
        if (list.length === 1) {
          setAdminStoreId(list[0].id);
        } else if (list.length > 1) {
          setNeedStore(true);
        }
      }
      setBooting(false);
    }
    bootstrap();
    return () => {
      alive = false;
    };
  }, [nav]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!isMobileNav) setMobileMenuOpen(false);
  }, [isMobileNav]);

  useEffect(() => {
    if (!mobileMenuOpen || !isMobileNav) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen, isMobileNav]);

  function closeMobileNav() {
    setMobileMenuOpen(false);
  }

  function logout() {
    clearAdminClientSession();
    nav('/admin');
  }

  function onStoreChange(e) {
    const id = e.target.value;
    setAdminStoreId(id);
    window.location.reload();
  }

  if (booting) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }} className="muted">
        Carregando painel…
      </div>
    );
  }

  if (bootErr) {
    return (
      <div style={{ maxWidth: 480, margin: '2rem auto', padding: '1rem' }} className="card">
        <h1 className="page-title">Painel</h1>
        <p className="err">{bootErr}</p>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          Tentar de novo
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ marginLeft: 8 }}
          onClick={() => {
            clearAdminClientSession();
            nav('/admin');
          }}
        >
          Voltar ao login
        </button>
      </div>
    );
  }

  if (needStore && stores.length > 1 && !getAdminStoreId()) {
    return (
      <div style={{ maxWidth: 420, margin: '2rem auto', padding: '1rem' }}>
        <h1 className="page-title">Escolha a loja</h1>
        <p className="muted">Selecione a loja para continuar no painel.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                setAdminStoreId(s.id);
                setNeedStore(false);
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const shellClass = `admin-shell${collapsed ? ' admin-shell--sidebar-collapsed' : ''}`;

  const sidebarOpenClass =
    isMobileNav && mobileMenuOpen ? ' admin-sidebar--mobile-open' : '';

  return (
    <div className={shellClass}>
      {isMobileNav && mobileMenuOpen && (
        <div
          className="admin-sidebar-backdrop"
          aria-hidden
          onClick={closeMobileNav}
          onKeyDown={(e) => e.key === 'Enter' && closeMobileNav()}
        />
      )}
      <aside className={`admin-sidebar${sidebarOpenClass}`} style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="admin-sidebar-head">
          {(!collapsed || isMobileNav) && <div className="admin-sidebar-title">Painel</div>}
          <button
            type="button"
            className="btn btn-ghost admin-sidebar-toggle admin-sidebar-toggle--desktop"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? '»' : '«'}
          </button>
          {isMobileNav && (
            <button
              type="button"
              className="btn btn-ghost admin-sidebar-toggle admin-sidebar-toggle--mobile-close"
              title="Fechar menu"
              aria-label="Fechar menu"
              onClick={closeMobileNav}
            >
              ✕
            </button>
          )}
        </div>
        <nav className="admin-nav" style={{ flex: 1 }}>
          {getIsSuperAdmin() && (
            <NavLink to="/admin/painel/plataforma" title="Plataforma" onClick={closeMobileNav}>
              {!collapsed || isMobileNav ? 'Plataforma' : 'S'}
            </NavLink>
          )}
          <NavLink to="/admin/painel/pedidos" end title="Pedidos" onClick={closeMobileNav}>
            {!collapsed || isMobileNav ? 'Pedidos' : 'P'}
          </NavLink>
          <NavLink to="/admin/painel/produtos" title="Produtos" onClick={closeMobileNav}>
            {!collapsed || isMobileNav ? 'Produtos' : 'C'}
          </NavLink>
          <NavLink to="/admin/painel/categorias" title="Categorias" onClick={closeMobileNav}>
            {!collapsed || isMobileNav ? 'Categorias' : 'G'}
          </NavLink>
          <NavLink to="/admin/painel/loja" end title="Loja" onClick={closeMobileNav}>
            {!collapsed || isMobileNav ? 'Loja' : 'L'}
          </NavLink>
          <NavLink to="/admin/painel/entrega" title="Entrega" onClick={closeMobileNav}>
            {!collapsed || isMobileNav ? 'Entrega' : 'E'}
          </NavLink>
          <NavLink to="/admin/painel/cupons" title="Cupons" onClick={closeMobileNav}>
            {!collapsed || isMobileNav ? 'Cupons' : 'U'}
          </NavLink>
          <NavLink to="/admin/painel/midias" title="Imagens" onClick={closeMobileNav}>
            {!collapsed || isMobileNav ? 'Imagens' : 'I'}
          </NavLink>
        </nav>
        {stores.length > 1 && getAdminStoreId() && (!collapsed || isMobileNav) && (
          <div style={{ padding: '0 1rem 0.75rem' }}>
            <label className="muted" style={{ fontSize: '0.75rem', display: 'block', marginBottom: 4 }}>
              Loja ativa
            </label>
            <select
              className="admin-store-select"
              value={getAdminStoreId() || ''}
              onChange={onStoreChange}
              style={{
                width: '100%',
                padding: '0.4rem 0.5rem',
                borderRadius: 8,
                border: '1px solid rgba(148, 163, 184, 0.35)',
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: '0.85rem',
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {stores.length > 1 && getAdminStoreId() && collapsed && !isMobileNav && (
          <div style={{ padding: '0 0.5rem', textAlign: 'center' }}>
            <select
              aria-label="Loja ativa"
              value={getAdminStoreId() || ''}
              onChange={onStoreChange}
              style={{
                width: '100%',
                padding: '0.35rem',
                borderRadius: 8,
                fontSize: '0.7rem',
                background: 'var(--bg)',
                color: 'var(--text)',
              }}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.slug}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ padding: '1rem', marginTop: 'auto' }}>
          <button type="button" className="btn btn-ghost" style={{ width: '100%' }} onClick={logout}>
            {!collapsed || isMobileNav ? 'Sair' : '×'}
          </button>
        </div>
      </aside>
      <div className="admin-content">
        {isMobileNav && (
          <header className="admin-mobile-topbar">
            <button
              type="button"
              className="btn btn-ghost admin-hamburger"
              aria-label="Abrir menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((o) => !o)}
            >
              <span className="admin-hamburger__icon" aria-hidden>
                <span />
                <span />
                <span />
              </span>
            </button>
            <span className="admin-mobile-topbar__title">Painel</span>
          </header>
        )}
        {getIsSuperAdmin() && stores.length === 0 && (
          <div
            className="muted"
            style={{
              padding: '0.75rem 1rem',
              background: 'rgba(251, 191, 36, 0.12)',
              borderBottom: '1px solid rgba(148, 163, 184, 0.35)',
              fontSize: '0.9rem',
            }}
          >
            Cadastre uma loja em{' '}
            <NavLink to="/admin/painel/plataforma" style={{ fontWeight: 600 }}>
              Plataforma
            </NavLink>{' '}
            para usar pedidos, produtos e as demais telas.
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
