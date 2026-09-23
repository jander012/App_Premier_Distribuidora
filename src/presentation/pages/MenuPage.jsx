import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from '../navigation.js';
import { api, getClientToken } from '../api/client.js';
import { CategoryStrip } from '../components/CategoryStrip.jsx';
import { MenuProductCard } from '../components/MenuProductCard.jsx';
import { MenuProductRail } from '../components/MenuProductRail.jsx';
import { useCart } from '../context/CartContext.jsx';
import { useStore, withStoreQuery } from '../context/StoreContext.jsx';
import { readAgeGateDecision, restrictedQueryParam, writeAgeGateDecision } from '../utils/ageGate.js';
const ALL_CATEGORIES = 'all';
const PAGE_SIZE = 24;
const DESTAQUE_FALLBACK_COUNT = 4;

function appendAgeParam(path, isAdult) {
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}${restrictedQueryParam(isAdult)}`;
}

function buildProductsPath(storeSlug, filterCategoryId, page, q, isAdult) {
  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  const trimmedQ = q?.trim();
  if (trimmedQ) {
    params.set('q', trimmedQ);
  } else if (filterCategoryId !== ALL_CATEGORIES) {
    params.set('categoryId', String(filterCategoryId));
  }
  return appendAgeParam(withStoreQuery(`/products?${params.toString()}`, storeSlug), isAdult);
}

export function MenuPage() {
  const [params] = useSearchParams();
  const { deliveryPublic, setPhone } = useCart();
  const { storeSlug } = useStore();
  const [ageDecision, setAgeDecision] = useState(() => readAgeGateDecision(storeSlug));
  const [categories, setCategories] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [filterCategoryId, setFilterCategoryId] = useState(null);
  const [searchQ, setSearchQ] = useState('');
  const [searchQDebounced, setSearchQDebounced] = useState('');
  const [bestSellers, setBestSellers] = useState([]);
  const [promotions, setPromotions] = useState([]);
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
    setAgeDecision(readAgeGateDecision(storeSlug));
  }, [storeSlug]);

  useEffect(() => {
    const p = params.get('phone');
    if (p) setPhone(p);
  }, [params, setPhone]);

  useEffect(() => {
    const t = setTimeout(() => setSearchQDebounced(searchQ.trim()), 350);
    return () => clearTimeout(t);
  }, [searchQ]);

  useEffect(() => {
    if (ageDecision === null) return;
    let on = true;
    setLoadingCategories(true);
    setErr(null);
    (async () => {
      try {
        const c = await api.get(appendAgeParam(withStoreQuery('/categories', storeSlug), ageDecision));
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
  }, [storeSlug, ageDecision]);

  const loadHighlights = useCallback(async () => {
    if (ageDecision === null) return;
    setLoadingHighlights(true);
    try {
      const loggedIn = !!getClientToken();
      setClientLoggedIn(loggedIn);
      const bestPromise = api.get(appendAgeParam(withStoreQuery('/products/best-sellers?limit=12', storeSlug), ageDecision));
      const promoPromise = api.get(appendAgeParam(withStoreQuery('/products/promotions?limit=12', storeSlug), ageDecision));
      const againPromise = loggedIn
        ? api.clientGet(appendAgeParam(withStoreQuery('/products/buy-again?limit=12', storeSlug), ageDecision))
        : Promise.resolve([]);
      const [best, promo, again] = await Promise.all([bestPromise, promoPromise, againPromise]);
      setBestSellers(Array.isArray(best) ? best : []);
      setPromotions(Array.isArray(promo) ? promo : []);
      setBuyAgain(loggedIn && Array.isArray(again) ? again : []);
    } catch {
      setBestSellers([]);
      setPromotions([]);
      setBuyAgain([]);
    } finally {
      setLoadingHighlights(false);
    }
  }, [storeSlug, ageDecision]);

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
      const data = await api.get(buildProductsPath(storeSlug, filterCategoryId, pageNum, searchQDebounced, ageDecision));
      return {
        items: Array.isArray(data?.items) ? data.items : [],
        total: Number(data?.total) || 0,
        hasMore: Boolean(data?.hasMore),
        page: Number(data?.page) || pageNum,
      };
    },
    [storeSlug, filterCategoryId, searchQDebounced, ageDecision]
  );

  useEffect(() => {
    if (ageDecision === null || filterCategoryId == null) return;
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
  }, [filterCategoryId, searchQDebounced, fetchPage, ageDecision]);

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
    if (searchQDebounced) return `Busca: “${searchQDebounced}”`;
    if (filterCategoryId === ALL_CATEGORIES) return 'Todos os produtos';
    return categories.find((c) => c.id === filterCategoryId)?.name ?? 'Produtos';
  }, [categories, filterCategoryId, searchQDebounced]);

  const hasPromotions = promotions.length > 0;
  const destaqueRail = useMemo(() => {
    if (hasPromotions) {
      return {
        title: 'Destaques e promoções',
        subtitle: 'Ofertas selecionadas para você',
        products: promotions,
        mode: 'promotion',
      };
    }
    const topSellers = bestSellers.slice(0, DESTAQUE_FALLBACK_COUNT);
    if (topSellers.length === 0) return null;
    return {
      title: 'Destaques',
      subtitle: 'Os 4 mais vendidos da loja',
      products: topSellers,
      mode: 'featured',
    };
  }, [hasPromotions, promotions, bestSellers]);

  const countLabel =
    total > 0
      ? products.length < total
        ? `${products.length} de ${total} itens`
        : `${total} itens`
      : '0 itens';

  const loading = loadingCategories;
  const storeOpen = deliveryPublic?.storeOpen !== false;

  if (ageDecision === null) {
    return (
      <AgeGatePrompt
        onAnswer={(isAdult) => {
          writeAgeGateDecision(storeSlug, isAdult);
          setAgeDecision(isAdult);
        }}
      />
    );
  }

  return (
    <div className="menu-page">
      <section className="menu-hero">
        <div>
          <span className="menu-hero__eyebrow">Delivery Premier</span>
          <h1 className="page-title">Cardápio</h1>
          <p className="muted">Escolha seus produtos favoritos e finalize o pedido em poucos passos.</p>
        </div>
        <div className={`menu-hero__meta ${storeOpen ? '' : 'menu-hero__meta--closed'}`}>
          <strong>{storeOpen ? 'Aberto' : 'Fechado'}</strong>
          <span>{storeOpen ? 'Entrega rápida' : 'Pedidos pausados'}</span>
        </div>
      </section>
      <div className="menu-search">
        <label className="menu-search__label" htmlFor="menu-product-search">
          Buscar produtos
        </label>
        <input
          id="menu-product-search"
          type="search"
          className="menu-search__input"
          placeholder="Nome ou descrição…"
          value={searchQ}
          onChange={(e) => setSearchQ(e.target.value)}
          autoComplete="off"
        />
        {searchQ && (
          <button type="button" className="menu-search__clear btn btn-ghost" onClick={() => setSearchQ('')}>
            Limpar
          </button>
        )}
      </div>
      {categories.length > 0 && !searchQDebounced && (
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
              {destaqueRail && (
                <MenuProductRail
                  title={destaqueRail.title}
                  subtitle={destaqueRail.subtitle}
                  products={destaqueRail.products}
                  mode={destaqueRail.mode}
                />
              )}
              {hasPromotions && (
                <MenuProductRail title="Mais vendidos" products={bestSellers} mode="featured" />
              )}
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
              <p className="muted">
                {searchQDebounced ? 'Nenhum produto encontrado para esta busca.' : 'Nenhum produto nesta categoria.'}
              </p>
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

function AgeGatePrompt({ onAnswer }) {
  return (
    <section className="age-gate card" aria-labelledby="age-gate-title">
      <span className="age-gate__eyebrow">Antes de acessar o cardápio</span>
      <h1 id="age-gate-title">Você tem 18 anos ou mais?</h1>
      <p className="muted">
        Algumas categorias podem conter bebidas alcoólicas ou tabaco. Sua resposta define quais produtos serão exibidos
        nesta loja.
      </p>
      <div className="age-gate__actions">
        <button type="button" className="btn btn-primary" onClick={() => onAnswer(true)}>
          Sim, tenho 18 anos ou mais
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => onAnswer(false)}>
          Não
        </button>
      </div>
    </section>
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
