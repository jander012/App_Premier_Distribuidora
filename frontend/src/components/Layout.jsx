import { Link, useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext.jsx';
import { useStore } from '../context/StoreContext.jsx';

export function Layout({ children }) {
  const { summary } = useCart();
  const { storeSlug, setStoreSlug, storesCatalog, linkedStores } = useStore();
  const loc = useLocation();
  const hideNav = loc.pathname.startsWith('/admin');
  const isAdmin = hideNav;
  const count = summary?.items?.reduce((a, i) => a + i.quantity, 0) || 0;

  const storeOptions =
    linkedStores && linkedStores.length > 1
      ? linkedStores
      : storesCatalog.length > 1
        ? storesCatalog
        : [];
  const currentStore =
    storesCatalog.find((s) => s.slug === storeSlug) ||
    linkedStores?.find((s) => s.slug === storeSlug) ||
    storeOptions[0];
  const brandName = currentStore?.name || 'Premier Distribuidora';

  return (
    <div className={`app-shell${isAdmin ? ' app-shell--admin' : ''}`}>
      {!hideNav && (
        <header className="topbar">
          <div className="topbar-left">
            <Link to="/" className="brand">
              <span className="brand-mark">P</span>
              <span>{brandName}</span>
            </Link>
            <div className="delivery-chip">
              <span>Entrega</span>
              <strong>Agora</strong>
            </div>
            {storeOptions.length > 0 && (
              <div className="topbar-store">
                <label htmlFor="store-select">Loja</label>
                <select
                  id="store-select"
                  value={storeSlug}
                  onChange={(e) => setStoreSlug(e.target.value)}
                  aria-label="Loja do cardápio"
                >
                  {storeOptions.map((s) => (
                    <option key={s.id} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <nav className="nav-actions">
            <Link to="/meus-pedidos" className="orders-link">
              Meus pedidos
            </Link>
            <Link to="/carrinho" className="cart-link">
              <svg className="cart-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6.2 8h11.6l-.8 11H7L6.2 8Z"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
                <path
                  d="M9 8a3 3 0 0 1 6 0"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
              <span>Carrinho</span>
              {count > 0 && <span className="badge">{count}</span>}
            </Link>
          </nav>
        </header>
      )}
      <main className="main">{children}</main>
    </div>
  );
}
