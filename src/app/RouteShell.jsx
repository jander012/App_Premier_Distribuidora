'use client';

import dynamic from 'next/dynamic';
import { AppProviders } from './AppProviders.jsx';

const routeComponents = {
  menu: dynamic(() => import('../presentation/pages/MenuPage.jsx').then((m) => m.MenuPage), { ssr: false }),
  product: dynamic(() => import('../presentation/pages/ProductPage.jsx').then((m) => m.ProductPage), { ssr: false }),
  cart: dynamic(() => import('../presentation/pages/CartPage.jsx').then((m) => m.CartPage), { ssr: false }),
  checkout: dynamic(() => import('../presentation/pages/CheckoutPage.jsx').then((m) => m.CheckoutPage), { ssr: false }),
  orderSuccess: dynamic(() => import('../presentation/pages/OrderSuccessPage.jsx').then((m) => m.OrderSuccessPage), { ssr: false }),
  customerOrders: dynamic(() => import('../presentation/pages/CustomerOrdersPage.jsx').then((m) => m.CustomerOrdersPage), { ssr: false }),
  deliveryConfirmation: dynamic(
    () => import('../presentation/pages/DeliveryConfirmationPage.jsx').then((m) => m.DeliveryConfirmationPage),
    { ssr: false }
  ),
  adminLogin: dynamic(() => import('../presentation/pages/AdminLoginPage.jsx').then((m) => m.AdminLoginPage), { ssr: false }),
};

export function PublicRoute({ name }) {
  const Component = routeComponents[name];
  return (
    <AppProviders>
      <Component />
    </AppProviders>
  );
}
