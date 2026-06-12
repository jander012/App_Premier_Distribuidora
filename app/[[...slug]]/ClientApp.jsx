'use client';

import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import App from '../../frontend/src/App.jsx';
import { StoreProvider } from '../../frontend/src/context/StoreContext.jsx';
import { CartProvider } from '../../frontend/src/context/CartContext.jsx';

export default function ClientApp() {
  return (
    <React.StrictMode>
      <BrowserRouter>
        <StoreProvider>
          <CartProvider>
            <App />
          </CartProvider>
        </StoreProvider>
      </BrowserRouter>
    </React.StrictMode>
  );
}
