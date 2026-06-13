'use client';

import { Layout } from '../presentation/components/Layout.jsx';
import { CartProvider } from '../presentation/context/CartContext.jsx';
import { StoreProvider } from '../presentation/context/StoreContext.jsx';

export default function ClientProviders({ children }) {
  return (
    <StoreProvider>
      <CartProvider>
        <Layout>{children}</Layout>
      </CartProvider>
    </StoreProvider>
  );
}
