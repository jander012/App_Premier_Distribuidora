import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout.jsx';
import { MenuPage } from './pages/MenuPage.jsx';
import { ProductPage } from './pages/ProductPage.jsx';
import { CartPage } from './pages/CartPage.jsx';
import { CheckoutPage } from './pages/CheckoutPage.jsx';
import { OrderSuccessPage } from './pages/OrderSuccessPage.jsx';
import { DeliveryConfirmationPage } from './pages/DeliveryConfirmationPage.jsx';
import { AdminLoginPage } from './pages/AdminLoginPage.jsx';
import { AdminLayout } from './admin/AdminLayout.jsx';
import { AdminOrdersPage } from './admin/pages/AdminOrdersPage.jsx';
import { AdminProductsListPage } from './admin/pages/AdminProductsListPage.jsx';
import { AdminProductNewPage } from './admin/pages/AdminProductNewPage.jsx';
import { AdminProductViewPage } from './admin/pages/AdminProductViewPage.jsx';
import { AdminProductEditPage } from './admin/pages/AdminProductEditPage.jsx';
import { AdminSettingsPage } from './admin/pages/AdminSettingsPage.jsx';
import { AdminDeliveryPage } from './admin/pages/AdminDeliveryPage.jsx';
import { AdminCouponsPage } from './admin/pages/AdminCouponsPage.jsx';
import { AdminMediaPage } from './admin/pages/AdminMediaPage.jsx';
import { AdminCategoriesPage } from './admin/pages/AdminCategoriesPage.jsx';
import { AdminPlatformPage } from './admin/pages/AdminPlatformPage.jsx';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<MenuPage />} />
        <Route path="/produto/:id" element={<ProductPage />} />
        <Route path="/carrinho" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/pedido/:id" element={<OrderSuccessPage />} />
        <Route path="/confirmar-entrega/:token" element={<DeliveryConfirmationPage />} />
        <Route path="/admin" element={<AdminLoginPage />} />
        <Route path="/admin/painel" element={<AdminLayout />}>
          <Route index element={<Navigate to="pedidos" replace />} />
          <Route path="pedidos" element={<AdminOrdersPage />} />
          <Route path="plataforma" element={<AdminPlatformPage />} />
          <Route path="categorias" element={<AdminCategoriesPage />} />
          <Route path="loja" element={<AdminSettingsPage />} />
          <Route path="entrega" element={<AdminDeliveryPage />} />
          <Route path="cupons" element={<AdminCouponsPage />} />
          <Route path="midias" element={<AdminMediaPage />} />
          <Route path="produtos/novo" element={<AdminProductNewPage />} />
          <Route path="produtos/:id/editar" element={<AdminProductEditPage />} />
          <Route path="produtos/:id" element={<AdminProductViewPage />} />
          <Route path="produtos" element={<AdminProductsListPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
