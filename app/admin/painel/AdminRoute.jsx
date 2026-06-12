'use client';

import dynamic from 'next/dynamic';

const routeComponents = {
  orders: dynamic(() => import('../../../frontend/src/admin/pages/AdminOrdersPage.jsx').then((m) => m.AdminOrdersPage), { ssr: false }),
  platform: dynamic(() => import('../../../frontend/src/admin/pages/AdminPlatformPage.jsx').then((m) => m.AdminPlatformPage), { ssr: false }),
  categories: dynamic(() => import('../../../frontend/src/admin/pages/AdminCategoriesPage.jsx').then((m) => m.AdminCategoriesPage), { ssr: false }),
  settings: dynamic(() => import('../../../frontend/src/admin/pages/AdminSettingsPage.jsx').then((m) => m.AdminSettingsPage), { ssr: false }),
  delivery: dynamic(() => import('../../../frontend/src/admin/pages/AdminDeliveryPage.jsx').then((m) => m.AdminDeliveryPage), { ssr: false }),
  coupons: dynamic(() => import('../../../frontend/src/admin/pages/AdminCouponsPage.jsx').then((m) => m.AdminCouponsPage), { ssr: false }),
  media: dynamic(() => import('../../../frontend/src/admin/pages/AdminMediaPage.jsx').then((m) => m.AdminMediaPage), { ssr: false }),
  products: dynamic(
    () => import('../../../frontend/src/admin/pages/AdminProductsListPage.jsx').then((m) => m.AdminProductsListPage),
    { ssr: false }
  ),
  productNew: dynamic(
    () => import('../../../frontend/src/admin/pages/AdminProductNewPage.jsx').then((m) => m.AdminProductNewPage),
    { ssr: false }
  ),
  productView: dynamic(
    () => import('../../../frontend/src/admin/pages/AdminProductViewPage.jsx').then((m) => m.AdminProductViewPage),
    { ssr: false }
  ),
  productEdit: dynamic(
    () => import('../../../frontend/src/admin/pages/AdminProductEditPage.jsx').then((m) => m.AdminProductEditPage),
    { ssr: false }
  ),
};

export function AdminRoute({ name }) {
  const Component = routeComponents[name];
  return <Component />;
}
