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
- Documentacao OpenAPI exposta pelo backend.

## Stack

### Backend

- Node.js com ES Modules.
- Express.
- MySQL via `mysql2`.
- JWT para sessoes de admin, cliente e carrinho.
- Helmet, CORS e rate limiting.
- Swagger UI para documentacao da API.

### Frontend

- React 18.
- Vite.
- React Router.
- Leaflet e Leaflet Draw para mapas de entrega.
- CSS global em `frontend/src/styles/global.css`.

### Infra local

- MySQL 8.4 via Docker Compose.

### Aplicacao unificada

- Next.js servindo o app em uma unica porta.
- Frontend atual carregado como aplicacao client-side.
- API exposta por rotas Next em `/api/*`, reaproveitando controllers, middlewares, services e repositories do backend.

## Estrutura do projeto

```text
.
|-- backend/
|   |-- scripts/
|   |   |-- migrate.js
|   |   `-- seed.js
|   `-- src/
|       |-- app.js
|       |-- server.js
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
|   |-- index.html
|   |-- vite.config.js
|   `-- src/
|       |-- admin/
|       |-- api/
|       |-- components/
|       |-- context/
|       |-- pages/
|       |-- styles/
|       `-- utils/
|-- scripts/
|   |-- smoke-api.mjs
|   |-- smoke-vite-proxy.mjs
|   `-- read-backend-base-url.mjs
|-- docker-compose.yml
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

Se ainda for rodar os projetos antigos separadamente, instale tambem as dependencias internas:

```bash
npm --prefix backend install
npm --prefix frontend install
```

2. Suba o MySQL local:

```bash
docker compose up -d mysql
```

3. No modo unificado, crie `.env` na raiz a partir de `.env.example`. No modo antigo separado, crie `backend/.env`:

```env
PORT=4020
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

PUBLIC_MENU_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
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

> Atencao: no estado atual do codigo, `backend/src/config/env.js` esta com dados de banco hardcoded em `parseDatabaseConfig()`. Antes de rodar localmente ou em producao, ajuste esse arquivo para usar `DB_HOST`, `DB_USER`, `DB_PASSWORD` e `DB_DATABASE` do `.env`, evitando conexao acidental com outro ambiente.

4. Rode as migrations e o seed:

```bash
npm --prefix backend run migrate
npm --prefix backend run seed
```

O seed cria o usuario administrador:

```text
E-mail: admin@delivery.local
Senha:  admin123
```

5. Para rodar tudo junto com Next:

```bash
npm run dev
```

A aplicacao ficara em `http://localhost:3000` e a API em `http://localhost:3000/api`.

6. Se precisar rodar o modo antigo separado, inicie o backend em um terminal:

```bash
npm --prefix backend run dev
```

7. E o frontend Vite em outro terminal:

```bash
npm --prefix frontend run dev
```

## Scripts uteis

### Backend

```bash
npm run dev          # API com node --watch
npm start            # API sem watch
npm run migrate      # aplica database/migrations/*.sql
npm run seed         # cria dados iniciais e admin local
npm run smoke        # testa health, stores, login e /admin/me
npm run smoke:proxy  # testa proxy /api do Vite para o backend
npm run smoke:4020   # smoke test apontando explicitamente para a porta 4020
```

### Aplicacao unificada Next

```bash
npm run dev      # Next em http://localhost:3000
npm run build    # build de producao
npm start        # serve o build de producao
npm run migrate  # aplica migrations usando backend/scripts/migrate.js
npm run seed     # cria dados iniciais usando backend/scripts/seed.js
```

### Frontend

```bash
npm run dev      # Vite em http://localhost:5173
npm run build    # build de producao
npm run preview  # preview em http://localhost:4173
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
| `PORT` | Porta da API. Padrao: `4020`. |
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
| `CORS_ORIGINS` | Origens permitidas separadas por virgula. |
| `INTERNAL_API_KEY` | Chave para rotas internas de pagamentos e WhatsApp. |
| `OTP_DEBUG_RETURN` | Em dev, retorna o codigo OTP na resposta. |
| `TRUST_PROXY` | Configuracao de proxy do Express. Em dev costuma ser `1`. |
| `MEDIA_UPLOAD_DIR` | Diretorio para imagens espelhadas. Padrao: `backend/uploads/media`. |
| `OSRM_BASE_URL` | Base do servico OSRM para rotas. |
| `THERMAL_PRINTER_INTERFACE` | Interface da impressora termica, ex.: `tcp://192.168.0.50:9100`. |
| `THERMAL_PRINTER_TYPE` | Tipo da impressora, ex.: `epson`. |
| `THERMAL_PRINTER_WIDTH` | Largura em caracteres da impressora termica. |

### Frontend

| Variavel | Descricao |
| --- | --- |
| `VITE_API_URL` | URL direta da API. Em dev, se ausente, usa `/api` via proxy do Vite. |
| `VITE_API_PROXY_TARGET` | Destino do proxy `/api`. Padrao: porta lida de `backend/.env` ou `http://127.0.0.1:4020`. |
| `VITE_BASE_URL` | Base path do app no build. Padrao: `/`. |

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

O backend registra as rotas em `backend/src/app.js`. A documentacao completa fica em `/docs`.

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

Em desenvolvimento, o Vite encaminha chamadas de `/api/*` para o backend e remove o prefixo `/api`.

## Integracoes

As integracoes seguem o padrao de provedores trocaveis:

- WhatsApp: `WHATSAPP_PROVIDER=stub` ou `meta`.
- PIX: `PIX_PROVIDER=stub`.
- Linx: `LINX_PROVIDER=stub` e `LINX_INTEGRATION_ENABLED=true|false`.
- PickinGo: `PICKINGO_PROVIDER=stub` e `PICKINGO_INTEGRATION_ENABLED=true|false`.

Para desenvolvimento, mantenha os provedores como `stub`. Para producao, configure os provedores reais e suas credenciais antes de habilitar as integracoes.

## Smoke tests

Com backend no ar:

```bash
cd backend
npm run smoke
```

Esse teste chama:

- `GET /health`
- `GET /stores`
- `POST /admin/login`
- `GET /admin/me`

Com backend e frontend no ar:

```bash
cd backend
npm run smoke:proxy
```

Esse teste compara `GET http://127.0.0.1:5173/api/stores` com `GET http://127.0.0.1:4020/stores`.

## Notas de seguranca

- Nao versionar `.env`, credenciais ou chaves de integracao.
- Em producao, defina `JWT_SECRET` com pelo menos 32 caracteres.
- Em producao, defina `INTERNAL_API_KEY` com pelo menos 24 caracteres.
- Desative `OTP_DEBUG_RETURN` fora de desenvolvimento.
- Restrinja `CORS_ORIGINS` aos dominios reais.
- Revise `backend/src/config/env.js` para remover credenciais hardcoded e ler configuracao exclusivamente do ambiente.
- Troque a senha do admin criado pelo seed antes de qualquer uso real.

## Documentacao adicional

Consulte `ARCHITECTURE.md` para detalhes de arquitetura, modelo de dados, fluxos e exemplos de payload.
