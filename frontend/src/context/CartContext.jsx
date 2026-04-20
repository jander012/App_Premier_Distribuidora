import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, getCartToken, setCartAuth, clearCartAuth, CART_ID_KEY } from '../api/client.js';
import { useStore, withStoreQuery } from './StoreContext.jsx';

const PHONE_KEY = 'delivery_phone';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { storeSlug } = useStore();
  const [cartId, setCartId] = useState(() => localStorage.getItem(CART_ID_KEY));
  const [phone, setPhoneState] = useState(() => sessionStorage.getItem(PHONE_KEY) || '');
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [deliveryKm, setDeliveryKmState] = useState('');
  /** Ponto de entrega para cálculo de rota (km) no carrinho — definido no checkout com mapa. */
  const [deliveryDest, setDeliveryDestState] = useState(null);
  const [deliveryPublic, setDeliveryPublic] = useState(null);
  const prevSlugRef = useRef(null);
  /** Evita vários POST /cart em paralelo (StrictMode / cliques rápidos). */
  const cartCreateLockRef = useRef(null);

  useEffect(() => {
    const saved = localStorage.getItem(`delivery_km_${storeSlug}`) || '';
    setDeliveryKmState(saved);
  }, [storeSlug]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`delivery_dest_${storeSlug}`);
      if (!raw) {
        setDeliveryDestState(null);
        return;
      }
      const j = JSON.parse(raw);
      const la = Number(j?.lat);
      const ln = Number(j?.lng);
      if (Number.isFinite(la) && Number.isFinite(ln)) setDeliveryDestState({ lat: la, lng: ln });
      else setDeliveryDestState(null);
    } catch {
      setDeliveryDestState(null);
    }
  }, [storeSlug]);

  useEffect(() => {
    let on = true;
    api
      .get(withStoreQuery('/settings/public', storeSlug))
      .then((d) => {
        if (on) setDeliveryPublic(d);
      })
      .catch(() => {
        if (on) setDeliveryPublic(null);
      });
    return () => {
      on = false;
    };
  }, [storeSlug]);

  const setDeliveryKm = useCallback(
    (v) => {
      const s = String(v ?? '');
      setDeliveryKmState(s);
      localStorage.setItem(`delivery_km_${storeSlug}`, s);
    },
    [storeSlug]
  );

  const setDeliveryDest = useCallback(
    (loc) => {
      if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
        setDeliveryDestState({ lat: loc.lat, lng: loc.lng });
        try {
          sessionStorage.setItem(`delivery_dest_${storeSlug}`, JSON.stringify({ lat: loc.lat, lng: loc.lng }));
        } catch {
          /* ignore */
        }
      } else {
        setDeliveryDestState(null);
        try {
          sessionStorage.removeItem(`delivery_dest_${storeSlug}`);
        } catch {
          /* ignore */
        }
      }
    },
    [storeSlug]
  );

  const setPhone = useCallback((p) => {
    const digits = String(p || '').replace(/\D/g, '');
    setPhoneState(digits);
    if (digits) sessionStorage.setItem(PHONE_KEY, digits);
    else sessionStorage.removeItem(PHONE_KEY);
  }, []);

  const ensureCartToken = useCallback(async () => {
    const createNewCart = async () => {
      if (!cartCreateLockRef.current) {
        cartCreateLockRef.current = api
          .post('/cart', {})
          .then((cart) => {
            if (cart?.accessToken != null && cart?.id != null) {
              const id = String(cart.id).trim();
              const tok = String(cart.accessToken).trim();
              setCartAuth(id, tok);
              setCartId(id);
              return tok;
            }
            return null;
          })
          .finally(() => {
            cartCreateLockRef.current = null;
          });
      }
      const tok = await cartCreateLockRef.current;
      if (!tok) throw new Error('Não foi possível criar o carrinho');
      return tok;
    };

    const existing = getCartToken();
    if (existing) {
      try {
        await api.cartGet('/cart/me', { cartToken: existing });
        return existing;
      } catch (e) {
        if (e.status === 401) {
          clearCartAuth();
          setCartId(null);
        } else {
          throw e;
        }
      }
    }
    return createNewCart();
  }, []);

  const refreshSummary = useCallback(async () => {
    const token = getCartToken();
    if (!token) {
      setSummary(null);
      return;
    }
    setLoading(true);
    setError(null);
    const kmRaw = deliveryKm.trim().replace(',', '.');
    const kmNum = kmRaw === '' ? NaN : Number(kmRaw);
    const params = new URLSearchParams();
    if (kmRaw !== '' && !Number.isNaN(kmNum) && kmNum >= 0) {
      params.set('distanceKm', String(kmNum));
    }
    if (deliveryDest && Number.isFinite(deliveryDest.lat) && Number.isFinite(deliveryDest.lng)) {
      params.set('destLat', String(deliveryDest.lat));
      params.set('destLng', String(deliveryDest.lng));
    }
    const qs = params.toString();
    const path = qs ? `/cart/me?${qs}` : '/cart/me';

    const loadOnce = () => api.cartGet(path, { cartToken: token });

    try {
      const data = await loadOnce();
      setSummary(data);
      if (data?.cartId) setCartId(String(data.cartId));
    } catch (e) {
      if (e.status === 401) {
        clearCartAuth();
        setCartId(null);
        setSummary(null);
        await ensureCartToken();
        const t2 = getCartToken();
        if (t2) {
          try {
            const data = await api.cartGet(path, { cartToken: t2 });
            setSummary(data);
            if (data?.cartId) setCartId(String(data.cartId));
          } catch (e2) {
            setError(e2.message);
            setSummary(null);
          }
        }
      } else {
        setError(e.message);
        setSummary(null);
      }
    } finally {
      setLoading(false);
    }
  }, [deliveryKm, deliveryDest, ensureCartToken]);

  const refreshSummaryRef = useRef(refreshSummary);
  refreshSummaryRef.current = refreshSummary;

  useEffect(() => {
    const token = getCartToken();
    if (!token) return undefined;
    const t = setTimeout(() => {
      refreshSummaryRef.current();
    }, 400);
    return () => clearTimeout(t);
  }, [deliveryKm, deliveryDest]);

  useEffect(() => {
    let cancelled = false;

    const prev = prevSlugRef.current;
    if (prev != null && prev !== storeSlug) {
      clearCartAuth();
      setCartId(null);
      setSummary(null);
      setDeliveryDestState(null);
    }
    prevSlugRef.current = storeSlug;

    (async () => {
      const id = localStorage.getItem(CART_ID_KEY);
      const token = getCartToken();
      if (id && !token) {
        clearCartAuth();
        setCartId(null);
      }
      await ensureCartToken();
      if (cancelled) return;
      await refreshSummaryRef.current();
      if (cancelled) return;
      if (!getCartToken()) {
        setError((prev) => prev || 'Não foi possível iniciar o carrinho.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [storeSlug, ensureCartToken]);

  const addItem = useCallback(
    async ({ productId, quantity, note, optionIds }) => {
      let token = await ensureCartToken();
      const body = {
        productId,
        quantity,
        note: note || undefined,
        optionIds: optionIds || [],
      };
      try {
        await api.cartPost('/cart/items', body, { cartToken: token });
      } catch (e) {
        if (e.status === 401) {
          clearCartAuth();
          setCartId(null);
          token = await ensureCartToken();
          await api.cartPost('/cart/items', body, { cartToken: token });
        } else {
          throw e;
        }
      }
      await refreshSummary();
    },
    [ensureCartToken, refreshSummary]
  );

  const updateItem = useCallback(
    async (itemId, body) => {
      await api.cartPut(`/cart/items/${itemId}`, body);
      await refreshSummary();
    },
    [refreshSummary]
  );

  const removeItem = useCallback(
    async (itemId) => {
      await api.cartDelete(`/cart/items/${itemId}`);
      await refreshSummary();
    },
    [refreshSummary]
  );

  const value = useMemo(
    () => ({
      cartId,
      phone,
      setPhone,
      summary,
      loading,
      error,
      refreshSummary,
      addItem,
      updateItem,
      removeItem,
      deliveryKm,
      setDeliveryKm,
      deliveryDest,
      setDeliveryDest,
      deliveryPublic,
    }),
    [
      cartId,
      phone,
      setPhone,
      summary,
      loading,
      error,
      refreshSummary,
      addItem,
      updateItem,
      removeItem,
      deliveryKm,
      setDeliveryKm,
      deliveryDest,
      setDeliveryDest,
      deliveryPublic,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart fora do provider');
  return ctx;
}
