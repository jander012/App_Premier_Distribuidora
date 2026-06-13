'use client';

import dynamic from 'next/dynamic';

const ClientProviders = dynamic(() => import('./ClientProviders.jsx'), { ssr: false });

export function AppProviders({ children }) {
  return <ClientProviders>{children}</ClientProviders>;
}
