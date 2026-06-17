import './globals.css';

export const metadata = {
  title: 'Premier Distribuidora',
  description: 'Cardapio digital e painel administrativo da Premier Distribuidora',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
