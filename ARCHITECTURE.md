# App Premier Distribuidora - Arquitetura

Aplicacao unica em Next.js App Router para cardapio digital, pedidos de delivery e painel administrativo. O frontend e a API rodam no mesmo processo Node, usando `/api/*` para chamadas HTTP e MySQL como banco.

## Visao Geral

```mermaid
flowchart TB
  Browser[Browser / Cliente] --> Next[Next.js App Router]
  Next --> Api[/app/api/[...path]/route.js/]
  Api --> Controllers[Controllers]
  Controllers --> Services[Services]
  Services --> Repositories[Repositories]
  Repositories --> DB[(MySQL)]
  Services --> Integrations[WhatsApp / PIX / Linx / PickinGo]
```

## Camadas

| Camada | Pasta / responsabilidade |
| --- | --- |
| Rotas de tela | `app/**/page.jsx` |
| API HTTP | `app/api/[...path]/route.js` |
| Componentes e paginas client | `frontend/src/` |
| Regras de negocio | `backend/src/services/` |
| SQL e persistencia | `backend/src/repositories/` |
| Configuracao e banco | `backend/src/config/` |
| Integracoes externas | `backend/src/integrations/` |
| Migrations e seed | `database/migrations/`, `backend/scripts/` |

## Rotas de Tela

- `/` - cardapio.
- `/produto/[id]` - detalhe de produto.
- `/carrinho` - carrinho.
- `/checkout` - finalizacao.
- `/pedido/[id]` - confirmacao.
- `/meus-pedidos` - historico do cliente.
- `/confirmar-entrega/[token]` - confirmacao de entrega.
- `/admin` - login administrativo.
- `/admin/painel/*` - painel operacional.

## API

As rotas antigas foram mantidas semanticamente, mas agora ficam sob `/api`.

Exemplos:

- `GET /api/health`
- `GET /api/settings/public`
- `GET /api/categories`
- `GET /api/products`
- `POST /api/cart`
- `POST /api/orders`
- `POST /api/admin/login`
- `GET /api/admin/orders`
- `GET /api/admin/products`

`app/api/[...path]/route.js` faz o roteamento e adapta a chamada para os controllers existentes. A regra de negocio continua em services e repositories, para evitar duplicacao.

## Dados

O banco e MySQL via `mysql2`. As migrations ficam em `database/migrations` e sao aplicadas por:

```bash
npm run migrate
```

O seed inicial e executado por:

```bash
npm run seed
```

## Deploy

O deploy precisa subir apenas a aplicacao Next:

```bash
npm install
npm run build
npm start
```

Variaveis de ambiente ficam em `.env`, seguindo `.env.example`.
