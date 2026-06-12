'use client';

import dynamic from 'next/dynamic';

const ClientApp = dynamic(() => import('./ClientApp.jsx'), { ssr: false });

export default function ClientOnlyApp() {
  return <ClientApp />;
}
