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

  return (
    <div className={`app-shell${isAdmin ? ' app-shell--admin' : ''}`}>
      {!hideNav && (
        <header className="topbar">
          <div className="topbar-left">
            <Link to="/" className="brand">
              Delivery
            </Link>
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
            <Link to="/carrinho" className="cart-link">
              Carrinho
              {count > 0 && <span className="badge">{count}</span>}
            </Link>
          </nav>
        </header>
      )}
      <main className="main">{children}</main>
    </div>
  );
}
