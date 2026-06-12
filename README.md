# App Premier Distribuidora

Aplicacao web para cardapio digital, pedidos de delivery e painel administrativo da Premier Distribuidora.

O projeto agora pode rodar como uma aplicacao unica em Next.js, reunindo o frontend React e a API em `/api/*`. A estrutura antiga de `frontend/` e `backend/` foi preservada para reaproveitar telas, services, repositories e scripts de banco. O fluxo principal cobre exibicao de produtos, carrinho, checkout com autenticacao por telefone, criacao de pedidos, acompanhamento pelo cliente e gestao operacional pelo painel administrativo.

## Sumario

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Requisitos](#requisitos)
- [Configuracao local](#configuracao-local)
- [Scripts uteis](#scripts-uteis)
- [URLs principais](#urls-principais)
- [Variaveis de ambiente](#variaveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [API](#api)
- [Frontend](#frontend)
- [Integracoes](#integracoes)
- [Smoke tests](#smoke-tests)
- [Notas de seguranca](#notas-de-seguranca)

## Funcionalidades

- Cardapio publico por categorias e produtos.
- Detalhe de produto com opcionais, observacao e quantidade.
- Carrinho persistido por token proprio.
- Checkout com OTP por telefone, dados do cliente, endereco e forma de pagamento.
- Historico de pedidos do cliente.
- Confirmacao de entrega por link com token.
- Painel administrativo com pedidos, produtos, categorias, configuracoes da loja, entrega, cupons, midias e administracao de plataforma.
- Multi-loja via `stores`, `store_configs` e vinculo entre administradores e lojas.
- Calculo de entrega por taxa fixa, zonas, poligonos e distancia.
- Integracoes plugaveis para WhatsApp, PIX, Linx e PickinGo, com provedores stub para desenvolvimento.
- Documentacao OpenAPI exposta pela API Next em `/api/docs.json`.

## Stack

### Aplicacao

- Next.js com App Router.
- React 18.
- Rotas de API Next em `/api/*`.
- MySQL via `mysql2`.
- JWT para sessoes de admin, cliente e carrinho.
- Leaflet e Leaflet Draw para mapas de entrega.
- CSS global em `frontend/src/styles/global.css`.

### Infra local

- MySQL 8.4 via Docker Compose.

## Estrutura do projeto

```text
.
|-- app/
|   |-- api/
|   |   `-- [...path]/
|   |-- admin/
|   |-- carrinho/
|   |-- checkout/
|   |-- produto/
|   `-- page.jsx
|-- backend/
|   |-- scripts/
|   |   |-- migrate.js
|   |   `-- seed.js
|   `-- src/
|       |-- config/
|       |-- controllers/
|       |-- docs/
|       |-- integrations/
|       |-- middlewares/
|       |-- repositories/
|       |-- services/
|       `-- utils/
|-- database/
|   `-- migrations/
|-- frontend/
|   `-- src/
|       |-- admin/
|       |-- api/
|       |-- components/
|       |-- context/
|       |-- navigation.js
|       |-- pages/
|       |-- styles/
|       `-- utils/
|-- scripts/
|   `-- smoke-api.mjs
|-- docker-compose.yml
|-- next.config.js
|-- package.json
|-- ARCHITECTURE.md
`-- README.md
```

## Requisitos

- Node.js 20 ou superior recomendado.
- npm.
- Docker e Docker Compose para subir o MySQL local.

## Configuracao local

Os comandos abaixo assumem que voce esta na raiz do repositorio.

1. Instale as dependencias da aplicacao unificada:

```bash
npm install
```

2. Suba o MySQL local:

```bash
docker compose up -d mysql
```

3. Crie `.env` na raiz a partir de `.env.example`:

```env
NODE_ENV=development

DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=delivery
DB_PASSWORD=delivery_secret
DB_DATABASE=delivery_db

JWT_SECRET=dev-only-change-me
JWT_EXPIRES_IN=8h
CLIENT_JWT_EXPIRES_IN=8h
CART_JWT_EXPIRES_IN=7d

PUBLIC_MENU_URL=http://localhost:3000
INTERNAL_API_KEY=dev-internal-api-key-change-me

WHATSAPP_PROVIDER=stub
PIX_PROVIDER=stub
LINX_PROVIDER=stub
PICKINGO_PROVIDER=stub

LINX_INTEGRATION_ENABLED=false
PICKINGO_INTEGRATION_ENABLED=false
OTP_DEBUG_RETURN=true
TRUST_PROXY=1
```

4. Rode as migrations e o seed:

```bash
npm run migrate
npm run seed
```

O seed cria o usuario administrador:

```text
E-mail: admin@delivery.local
Senha:  admin123
```

5. Rode a aplicacao:

```bash
npm run dev
```

A aplicacao ficara em `http://localhost:3000` e a API em `http://localhost:3000/api`.

## Scripts uteis

```bash
npm run dev      # Next em http://localhost:3000
npm run build    # build de producao
npm start        # serve o build de producao
npm run migrate  # aplica migrations usando backend/scripts/migrate.js
npm run seed     # cria dados iniciais usando backend/scripts/seed.js
```

## URLs principais

- Aplicacao unificada: `http://localhost:3000`
- API unificada: `http://localhost:3000/api`
- Health check: `http://localhost:3000/api/health`
- Health check do banco: `http://localhost:3000/api/health/db`
- OpenAPI JSON: `http://localhost:3000/api/docs.json`
- Painel admin: `http://localhost:3000/admin`

## Variaveis de ambiente

### Backend

| Variavel | Descricao |
| --- | --- |
| `NODE_ENV` | Ambiente atual. Use `production` em producao. |
| `DB_HOST` | Host do MySQL. |
| `DB_PORT` | Porta do MySQL. No Docker Compose local: `3307`. |
| `DB_USER` | Usuario do banco. |
| `DB_PASSWORD` | Senha do banco. |
| `DB_DATABASE` | Nome do banco. |
| `JWT_SECRET` | Segredo para JWTs. Em producao precisa ter pelo menos 32 caracteres. |
| `JWT_EXPIRES_IN` | Expiracao do token de admin. |
| `CLIENT_JWT_EXPIRES_IN` | Expiracao do token do cliente. |
| `CART_JWT_EXPIRES_IN` | Expiracao do token do carrinho. |
| `PUBLIC_MENU_URL` | URL publica do cardapio enviada em links. |
| `INTERNAL_API_KEY` | Chave para rotas internas de pagamentos e WhatsApp. |
| `OTP_DEBUG_RETURN` | Em dev, retorna o codigo OTP na resposta. |
| `TRUST_PROXY` | Numero de hops quando a aplicacao estiver atras de proxy/reverse proxy. |
| `MEDIA_UPLOAD_DIR` | Diretorio para imagens espelhadas. Padrao: `backend/uploads/media`. |
| `OSRM_BASE_URL` | Base do servico OSRM para rotas. |
| `THERMAL_PRINTER_INTERFACE` | Interface da impressora termica, ex.: `tcp://192.168.0.50:9100`. |
| `THERMAL_PRINTER_TYPE` | Tipo da impressora, ex.: `epson`. |
| `THERMAL_PRINTER_WIDTH` | Largura em caracteres da impressora termica. |

## Banco de dados

O Compose sobe um MySQL local com:

```text
Host: 127.0.0.1
Porta: 3307
Banco: delivery_db
Usuario: delivery
Senha: delivery_secret
Root password: root_secret
```

As migrations ficam em `database/migrations` e sao aplicadas em ordem alfabetica pelo script `backend/scripts/migrate.js`.

Tabelas principais:

- `stores`, `store_configs`, `admin_users`, `admin_user_stores`.
- `categories`, `products`, `product_options`, `media_assets`.
- `customers`, `customer_addresses`, `customer_stores`.
- `carts`, `cart_items`.
- `orders`, `order_items`, `order_status_history`, `payments`.
- Tabelas de integracao para WhatsApp, Linx, PickinGo, entrega e confirmacao.

## API

A API registra as rotas em `app/api/[...path]/route.js`. Todas as rotas abaixo ficam sob o prefixo `/api`; por exemplo, `GET /health` fica acessivel em `GET /api/health`.

Rotas publicas importantes:

- `GET /health`
- `GET /health/db`
- `GET /settings/public`
- `GET /stores`
- `GET /categories`
- `GET /products`
- `GET /products/:id`
- `POST /auth/client/request-code`
- `POST /auth/client/verify-code`
- `POST /cart`
- `GET /cart/me`
- `POST /orders`
- `GET /orders/me`
- `GET /delivery-confirmations/:token`
- `POST /delivery-confirmations/:token/confirm`

Rotas administrativas importantes:

- `POST /admin/login`
- `GET /admin/me`
- `GET /admin/orders`
- `PATCH /admin/orders/:id/status`
- `GET /admin/products`
- `POST /admin/products`
- `PUT /admin/products/:id`
- `DELETE /admin/products/:id`
- `GET /admin/categories`
- `GET /admin/settings`
- `PUT /admin/settings`
- `GET /admin/delivery`
- `PUT /admin/delivery`
- `GET /admin/coupons`
- `GET /admin/media`
- `GET /admin/platform/stores`
- `GET /admin/platform/admins`

Rotas internas:

- `POST /payments/pix`
- `POST /payments/cash`
- `POST /payments/card-on-delivery`
- `POST /whatsapp/send-menu-link`
- `POST /whatsapp/send-order-confirmation`
- `POST /whatsapp/send-status-update`

As rotas internas exigem o header `X-Internal-Key` com o valor de `INTERNAL_API_KEY`.

## Frontend

Rotas do app:

- `/` - cardapio.
- `/produto/:id` - detalhe de produto.
- `/carrinho` - carrinho.
- `/checkout` - finalizacao do pedido.
- `/pedido/:id` - confirmacao do pedido.
- `/meus-pedidos` - historico do cliente.
- `/confirmar-entrega/:token` - confirmacao de entrega.
- `/admin` - login administrativo.
- `/admin/painel/pedidos` - pedidos.
- `/admin/painel/produtos` - produtos.
- `/admin/painel/categorias` - categorias.
- `/admin/painel/loja` - configuracoes.
- `/admin/painel/entrega` - areas e regras de entrega.
- `/admin/painel/cupons` - cupons.
- `/admin/painel/midias` - midias.
- `/admin/painel/plataforma` - lojas e administradores da plataforma.

Em desenvolvimento e producao, o frontend chama a API Next pelo prefixo `/api`.

## Integracoes

As integracoes seguem o padrao de provedores trocaveis:

- WhatsApp: `WHATSAPP_PROVIDER=stub` ou `meta`.
- PIX: `PIX_PROVIDER=stub`.
- Linx: `LINX_PROVIDER=stub` e `LINX_INTEGRATION_ENABLED=true|false`.
- PickinGo: `PICKINGO_PROVIDER=stub` e `PICKINGO_INTEGRATION_ENABLED=true|false`.

Para desenvolvimento, mantenha os provedores como `stub`. Para producao, configure os provedores reais e suas credenciais antes de habilitar as integracoes.

## Smoke tests

Com a aplicacao Next no ar:

```bash
npm run smoke
```

Esse teste chama:

- `GET /api/health`
- `GET /api/stores`
- `POST /api/admin/login`
- `GET /api/admin/me`

## Notas de seguranca

- Nao versionar `.env`, credenciais ou chaves de integracao.
- Em producao, defina `JWT_SECRET` com pelo menos 32 caracteres.
- Em producao, defina `INTERNAL_API_KEY` com pelo menos 24 caracteres.
- Desative `OTP_DEBUG_RETURN` fora de desenvolvimento.
- Troque a senha do admin criado pelo seed antes de qualquer uso real.

## Documentacao adicional

Consulte `ARCHITECTURE.md` para detalhes de arquitetura, modelo de dados, fluxos e exemplos de payload.
