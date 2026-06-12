'use client';

import dynamic from 'next/dynamic';
import { AppProviders } from './AppProviders.jsx';

const routeComponents = {
  menu: dynamic(() => import('../frontend/src/pages/MenuPage.jsx').then((m) => m.MenuPage), { ssr: false }),
  product: dynamic(() => import('../frontend/src/pages/ProductPage.jsx').then((m) => m.ProductPage), { ssr: false }),
  cart: dynamic(() => import('../frontend/src/pages/CartPage.jsx').then((m) => m.CartPage), { ssr: false }),
  checkout: dynamic(() => import('../frontend/src/pages/CheckoutPage.jsx').then((m) => m.CheckoutPage), { ssr: false }),
  orderSuccess: dynamic(() => import('../frontend/src/pages/OrderSuccessPage.jsx').then((m) => m.OrderSuccessPage), { ssr: false }),
  customerOrders: dynamic(() => import('../frontend/src/pages/CustomerOrdersPage.jsx').then((m) => m.CustomerOrdersPage), { ssr: false }),
  deliveryConfirmation: dynamic(
    () => import('../frontend/src/pages/DeliveryConfirmationPage.jsx').then((m) => m.DeliveryConfirmationPage),
    { ssr: false }
  ),
  adminLogin: dynamic(() => import('../frontend/src/pages/AdminLoginPage.jsx').then((m) => m.AdminLoginPage), { ssr: false }),
};

export function PublicRoute({ name }) {
  const Component = routeComponents[name];
  return (
    <AppProviders>
      <Component />
    </AppProviders>
  );
}
