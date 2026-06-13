import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getClientToken } from '../api/client.js';

const STORAGE_KEY = 'delivery_store_slug';

const StoreContext = createContext(null);

export function withStoreQuery(path, storeSlug) {
  const slug = storeSlug || 'principal';
  const join = path.includes('?') ? '&' : '?';
  return `${path}${join}storeSlug=${encodeURIComponent(slug)}`;
}

export function StoreProvider({ children }) {
  const [storeSlug, setStoreSlugState] = useState(() => localStorage.getItem(STORAGE_KEY) || 'principal');
  const [storesCatalog, setStoresCatalog] = useState([]);
  const [linkedStores, setLinkedStores] = useState(null);

  const setStoreSlug = useCallback((slug) => {
    const s = String(slug || 'principal').trim() || 'principal';
    setStoreSlugState(s);
    localStorage.setItem(STORAGE_KEY, s);
  }, []);

  useEffect(() => {
    let on = true;
    api
      .get('/stores')
      .then((rows) => {
        if (on) setStoresCatalog(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (on) setStoresCatalog([]);
      });
    return () => {
      on = false;
    };
  }, []);

  useEffect(() => {
    let on = true;
    function loadLinked() {
      if (!getClientToken()) {
        setLinkedStores(null);
        return;
      }
      api
        .clientGet('/customers/me/stores')
        .then((rows) => {
          if (on) setLinkedStores(Array.isArray(rows) ? rows : []);
        })
        .catch(() => {
          if (on) setLinkedStores(null);
        });
    }
    loadLinked();
    function onAuth() {
      loadLinked();
    }
    window.addEventListener('delivery-client-auth', onAuth);
    return () => {
      on = false;
      window.removeEventListener('delivery-client-auth', onAuth);
    };
  }, []);

  useEffect(() => {
    if (!linkedStores?.length) return;
    if (linkedStores.length === 1) {
      const only = linkedStores[0].slug;
      if (only && only !== storeSlug) setStoreSlug(only);
      return;
    }
    const ok = linkedStores.some((s) => s.slug === storeSlug);
    if (!ok && linkedStores[0]) {
      setStoreSlug(linkedStores[0].slug);
    }
  }, [linkedStores, storeSlug, setStoreSlug]);

  const value = useMemo(
    () => ({
      storeSlug,
      setStoreSlug,
      storesCatalog,
      linkedStores,
    }),
    [storeSlug, setStoreSlug, storesCatalog, linkedStores]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore fora do provider');
  return ctx;
}
