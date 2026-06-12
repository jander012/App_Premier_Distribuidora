'use client';

import { Layout } from '../frontend/src/components/Layout.jsx';
import { CartProvider } from '../frontend/src/context/CartContext.jsx';
import { StoreProvider } from '../frontend/src/context/StoreContext.jsx';

export default function ClientProviders({ children }) {
  return (
    <StoreProvider>
      <CartProvider>
        <Layout>{children}</Layout>
      </CartProvider>
    </StoreProvider>
  );
}
