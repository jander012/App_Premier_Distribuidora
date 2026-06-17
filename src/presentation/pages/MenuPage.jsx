import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from '../navigation.js';
import { api, getClientToken } from '../api/client.js';
import { CategoryStrip } from '../components/CategoryStrip.jsx';
import { MenuProductCard } from '../components/MenuProductCard.jsx';
import { MenuProductRail } from '../components/MenuProductRail.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useStore, withStoreQuery } from '../context/StoreContext.jsx';
const ALL_CATEGORIES = 'all';
const PAGE_SIZE = 24;

function buildProductsPath(storeSlug, filterCategoryId, page) {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  if (filterCategoryId !== ALL_CATEGORIES) {
    params.set('categoryId', String(filterCategoryId));
  }
  return withStoreQuery(`/products?${params.toString()}`, storeSlug);
}

export function MenuPage() {
  const [params] = useSearchParams();
  const { setPhone } = useCart();
  const { storeSlug } = useStore();
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState(null);
  const [bestSellers, setBestSellers] = useState([]);
  const [buyAgain, setBuyAgain] = useState([]);
  const [clientLoggedIn, setClientLoggedIn] = useState(() => !!getClientToken());
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [loadingHighlights, setLoadingHighlights] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [err, setErr] = useState(null);
  const loadMoreRef = useRef(null);
  const loadingMoreRef = useRef(false);

  useEffect(() => {
    const p = params.get('phone');
    if (p) setPhone(p);
  }, [params, setPhone]);

  useEffect(() => {
    let on = true;
    setLoadingCategories(true);
    setErr(null);
    (async () => {
      try {
        const c = await api.get(withStoreQuery('/categories', storeSlug));
        if (!on) return;
        const list = Array.isArray(c) ? c : [];
        setCategories(list);
        setFilterCategoryId((prev) => {
          if (prev === ALL_CATEGORIES) return prev;
          if (prev != null && list.some((cat) => cat.id === prev)) return prev;
          return list[0]?.id ?? ALL_CATEGORIES;
        });
      } catch (e) {
        if (on) setErr(e.message);
      } finally {
        if (on) setLoadingCategories(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [storeSlug]);

  const loadHighlights = useCallback(async () => {
    setLoadingHighlights(true);
    try {
      const loggedIn = !!getClientToken();
      setClientLoggedIn(loggedIn);
      const bestPromise = api.get(withStoreQuery('/products/best-sellers?limit=12', storeSlug));
      const againPromise = loggedIn
        ? api.clientGet(withStoreQuery('/products/buy-again?limit=12', storeSlug))
        : Promise.resolve([]);
      const [best, again] = await Promise.all([bestPromise, againPromise]);
      setBestSellers(Array.isArray(best) ? best : []);
      setBuyAgain(loggedIn && Array.isArray(again) ? again : []);
    } catch {
      setBestSellers([]);
      setBuyAgain([]);
    } finally {
      setLoadingHighlights(false);
    }
  }, [storeSlug]);

  useEffect(() => {
    void loadHighlights();
    const onAuth = () => {
      void loadHighlights();
    };
    window.addEventListener('delivery-client-auth', onAuth);
    return () => window.removeEventListener('delivery-client-auth', onAuth);
  }, [loadHighlights]);

  const fetchPage = useCallback(
    async (pageNum) => {
      const data = await api.get(buildProductsPath(storeSlug, filterCategoryId, pageNum));
      return {
        items: Array.isArray(data?.items) ? data.items : [],
        total: Number(data?.total) || 0,
        hasMore: Boolean(data?.hasMore),
        page: Number(data?.page) || pageNum,
      };
    },
    [storeSlug, filterCategoryId]
  );

  useEffect(() => {
    if (filterCategoryId == null) return;
    let on = true;
    setLoadingProducts(true);
    setErr(null);
    setProducts([]);
    setPage(1);
    setHasMore(false);
    setTotal(0);
    (async () => {
      try {
        const data = await fetchPage(1);
        if (!on) return;
        setProducts(data.items);
        setTotal(data.total);
        setHasMore(data.hasMore);
        setPage(data.page);
      } catch (e) {
        if (on) {
          setErr(e.message);
          setProducts([]);
        }
      } finally {
        if (on) setLoadingProducts(false);
      }
    })();
    return () => {
      on = false;
    };
  }, [filterCategoryId, fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || !hasMore || loadingProducts) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await fetchPage(nextPage);
      setProducts((prev) => [...prev, ...data.items]);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(data.page);
    } catch (e) {
      setErr(e.message);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, [fetchPage, hasMore, loadingProducts, page]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore || loadingProducts) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root: null, rootMargin: '240px 0px', threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingProducts, loadMore, products.length]);

  const activeCategoryName = useMemo(() => {
    if (filterCategoryId === ALL_CATEGORIES) return 'Todos os produtos';
    return categories.find((c) => c.id === filterCategoryId)?.name ?? 'Produtos';
  }, [categories, filterCategoryId]);

  const countLabel =
    total > 0
      ? products.length < total
        ? `${products.length} de ${total} itens`
        : `${total} itens`
      : '0 itens';

  const loading = loadingCategories;

  return (
    <div className="menu-page">
      <section className="menu-hero">
        <div>
          <span className="menu-hero__eyebrow">Delivery Premier</span>
          <h1 className="page-title">Cardápio</h1>
          <p className="muted">Escolha seus produtos favoritos e finalize o pedido em poucos passos.</p>
        </div>
        <div className="menu-hero__meta">
          <strong>Aberto</strong>
          <span>Entrega rápida</span>
        </div>
      </section>
      {categories.length > 0 && (
        <CategoryStrip
          categories={categories}
          value={filterCategoryId}
          onChange={setFilterCategoryId}
          allValue={ALL_CATEGORIES}
        />
      )}
      {err && <p className="err">{err}</p>}
      {loading && <MenuSkeleton />}
      {!loading && (
        <>
          {loadingHighlights ? (
            <MenuRailSkeleton />
          ) : (
            <>
              <MenuProductRail title="Mais vendidos" products={bestSellers} mode="featured" />
              {clientLoggedIn ? (
                <MenuProductRail
                  title="Comprar novamente"
                  subtitle="Itens dos seus pedidos anteriores nesta loja"
                  products={buyAgain}
                  mode="buy-again"
                />
              ) : null}
            </>
          )}
          <section className="menu-section" aria-live="polite">
            <div className="section-label">
              {activeCategoryName}
              <span className="section-label__count">{countLabel}</span>
            </div>
            {loadingProducts ? (
              <ProductGridSkeleton />
            ) : products.length === 0 ? (
              <p className="muted">Nenhum produto nesta categoria.</p>
            ) : (
              <>
                <div className="product-grid">
                  {products.map((p) => (
                    <MenuProductCard key={p.id} product={p} />
                  ))}
                </div>
                {hasMore && (
                  <div ref={loadMoreRef} className="menu-infinite-scroll" aria-hidden={!loadingMore}>
                    {loadingMore ? (
                      <p className="menu-infinite-scroll__label" role="status" aria-live="polite">
                        Carregando mais produtos…
                      </p>
                    ) : (
                      <p className="menu-infinite-scroll__label muted">Role para carregar mais</p>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function MenuRailSkeleton() {
  return (
    <section className="menu-rail menu-rail--skeleton" aria-hidden="true">
      <div className="skeleton-block skeleton-title menu-rail__title" />
      <div className="menu-rail__scroll">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card menu-rail-card menu-rail-card--skeleton">
            <div className="product-placeholder skeleton-block" />
            <div className="skeleton-block skeleton-line skeleton-line--name" />
            <div className="skeleton-block skeleton-price" />
          </div>
        ))}
      </div>
    </section>
  );
}

function ProductGridSkeleton() {
  return (
    <div className="product-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((item) => (
        <div key={item} className="card product-row product-row--skeleton">
          <div className="product-placeholder skeleton-block" />
          <div className="product-row__body">
            <div className="skeleton-block skeleton-line skeleton-line--name" />
            <div className="skeleton-block skeleton-line skeleton-line--short" />
            <div className="skeleton-block skeleton-price" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MenuSkeleton() {
  return (
    <div className="menu-skeleton" aria-label="Carregando cardápio" aria-busy="true">
      <div className="category-strip category-strip--skeleton" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="category-pill skeleton-block" />
        ))}
      </div>
      <section className="menu-section" aria-hidden="true">
        <div className="section-label skeleton-block skeleton-title" />
        <div className="product-grid">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="card product-row product-row--skeleton">
              <div className="product-placeholder skeleton-block" />
              <div className="product-row__body">
                <div className="skeleton-block skeleton-line skeleton-line--name" />
                <div className="skeleton-block skeleton-line skeleton-line--short" />
                <div className="skeleton-block skeleton-price" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
