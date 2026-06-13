import './globals.css';

export const metadata = {
  title: 'Premier Distribuidora',
  description: 'Cardapio digital e painel administrativo da Premier Distribuidora',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
