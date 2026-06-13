'use client';

import dynamic from 'next/dynamic';
import { AppProviders } from '../../AppProviders.jsx';

const AdminLayout = dynamic(() => import('../../../presentation/admin/AdminLayout.jsx').then((m) => m.AdminLayout), {
  ssr: false,
});

export default function AdminPanelShell({ children }) {
  return (
    <AppProviders>
      <AdminLayout>{children}</AdminLayout>
    </AppProviders>
  );
}
