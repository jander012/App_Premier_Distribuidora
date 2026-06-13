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
| Rotas de tela | `src/app/**/page.jsx` |
| API HTTP | `src/app/api/[...path]/route.js` |
| Componentes e paginas client | `src/presentation/` |
| Dominio compartilhado | `src/server/domain/` |
| Regras de negocio | `src/server/application/services/` |
| SQL e persistencia | `src/server/infrastructure/repositories/` |
| Configuracao e banco | `src/server/infrastructure/config/` |
| Integracoes externas | `src/server/infrastructure/integrations/` |
| Controllers e middlewares HTTP | `src/server/interfaces/http/` |
| Migrations e seed | `src/server/infrastructure/database/migrations/`, `src/server/infrastructure/database/scripts/` |

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

O banco e MySQL via `mysql2`. As migrations ficam em `src/server/infrastructure/database/migrations` e sao aplicadas por:

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
