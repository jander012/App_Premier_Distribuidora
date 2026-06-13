'use client';

import dynamic from 'next/dynamic';

const routeComponents = {
  orders: dynamic(() => import('../../../presentation/admin/pages/AdminOrdersPage.jsx').then((m) => m.AdminOrdersPage), { ssr: false }),
  platform: dynamic(() => import('../../../presentation/admin/pages/AdminPlatformPage.jsx').then((m) => m.AdminPlatformPage), { ssr: false }),
  categories: dynamic(() => import('../../../presentation/admin/pages/AdminCategoriesPage.jsx').then((m) => m.AdminCategoriesPage), { ssr: false }),
  settings: dynamic(() => import('../../../presentation/admin/pages/AdminSettingsPage.jsx').then((m) => m.AdminSettingsPage), { ssr: false }),
  delivery: dynamic(() => import('../../../presentation/admin/pages/AdminDeliveryPage.jsx').then((m) => m.AdminDeliveryPage), { ssr: false }),
  coupons: dynamic(() => import('../../../presentation/admin/pages/AdminCouponsPage.jsx').then((m) => m.AdminCouponsPage), { ssr: false }),
  media: dynamic(() => import('../../../presentation/admin/pages/AdminMediaPage.jsx').then((m) => m.AdminMediaPage), { ssr: false }),
  products: dynamic(
    () => import('../../../presentation/admin/pages/AdminProductsListPage.jsx').then((m) => m.AdminProductsListPage),
    { ssr: false }
  ),
  productNew: dynamic(
    () => import('../../../presentation/admin/pages/AdminProductNewPage.jsx').then((m) => m.AdminProductNewPage),
    { ssr: false }
  ),
  productView: dynamic(
    () => import('../../../presentation/admin/pages/AdminProductViewPage.jsx').then((m) => m.AdminProductViewPage),
    { ssr: false }
  ),
  productEdit: dynamic(
    () => import('../../../presentation/admin/pages/AdminProductEditPage.jsx').then((m) => m.AdminProductEditPage),
    { ssr: false }
  ),
};

export function AdminRoute({ name }) {
  const Component = routeComponents[name];
  return <Component />;
}
