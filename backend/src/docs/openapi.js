export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'Premier Distribuidora API',
    version: '1.0.0',
    description:
      'Documentacao da API do backend. Use /health para validar o servidor e /health/db para validar a conexao com o banco.',
  },
  servers: [
    {
      url: '/',
      description: 'Servidor atual',
    },
  ],
  tags: [
    { name: 'Health' },
    { name: 'Publico' },
    { name: 'Autenticacao' },
    { name: 'Clientes' },
    { name: 'Carrinho' },
    { name: 'Pedidos' },
    { name: 'Pagamentos' },
    { name: 'WhatsApp' },
    { name: 'Admin' },
    { name: 'Plataforma' },
    { name: 'Midia' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT de cliente ou administrador.',
      },
      cartToken: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Cart-Token',
        description: 'Token retornado na criacao do carrinho.',
      },
      storeId: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Store-Id',
        description: 'Loja ativa para rotas administrativas.',
      },
      internalApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-Internal-Key',
        description: 'Chave interna usada por integracoes de pagamento e WhatsApp.',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          message: { type: 'string', example: 'Erro ao processar a requisicao.' },
        },
      },
      Ok: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
        },
      },
      Store: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'Premier Distribuidora' },
        },
      },
      LoginRequest: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email', example: 'admin@premier.local' },
          password: { type: 'string', example: 'senha-secreta' },
        },
      },
      ClientCodeRequest: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: { type: 'string', example: '65999999999' },
        },
      },
      ClientVerifyRequest: {
        type: 'object',
        required: ['phone', 'code'],
        properties: {
          phone: { type: 'string', example: '65999999999' },
          code: { type: 'string', example: '123456' },
        },
      },
      CartItemRequest: {
        type: 'object',
        required: ['productId', 'quantity'],
        properties: {
          productId: { type: 'integer', example: 10 },
          quantity: { type: 'integer', minimum: 1, example: 2 },
          notes: { type: 'string', example: 'Sem cebola' },
        },
      },
      OrderStatusRequest: {
        type: 'object',
        required: ['status'],
        properties: {
          status: {
            type: 'string',
            example: 'preparing',
          },
        },
      },
      GenericObject: {
        type: 'object',
        additionalProperties: true,
      },
    },
    responses: {
      Unauthorized: {
        description: 'Nao autenticado.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      Forbidden: {
        description: 'Sem permissao para executar esta acao.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
      NotFound: {
        description: 'Registro nao encontrado.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/Error' },
          },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Verifica se a API esta online',
        responses: {
          200: {
            description: 'API online.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Ok' },
              },
            },
          },
        },
      },
    },
    '/health/db': {
      get: {
        tags: ['Health'],
        summary: 'Verifica se a API consegue acessar o banco',
        responses: {
          200: {
            description: 'Banco acessivel.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/GenericObject' },
              },
            },
          },
          500: {
            description: 'Falha de conexao com o banco.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Error' },
              },
            },
          },
        },
      },
    },
    '/settings/public': {
      get: {
        tags: ['Publico'],
        summary: 'Lista configuracoes publicas da loja',
        responses: { 200: { description: 'Configuracoes publicas.' } },
      },
    },
    '/stores': {
      get: {
        tags: ['Publico'],
        summary: 'Lista lojas disponiveis',
        responses: {
          200: {
            description: 'Lista de lojas.',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/Store' },
                },
              },
            },
          },
        },
      },
    },
    '/auth/client/request-code': {
      post: {
        tags: ['Autenticacao'],
        summary: 'Solicita codigo OTP para cliente',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ClientCodeRequest' },
            },
          },
        },
        responses: { 200: { description: 'Codigo solicitado.' } },
      },
    },
    '/auth/client/verify-code': {
      post: {
        tags: ['Autenticacao'],
        summary: 'Valida codigo OTP e retorna token do cliente',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ClientVerifyRequest' },
            },
          },
        },
        responses: { 200: { description: 'Cliente autenticado.' } },
      },
    },
    '/categories': {
      get: {
        tags: ['Publico'],
        summary: 'Lista categorias do menu',
        responses: { 200: { description: 'Categorias.' } },
      },
    },
    '/products': {
      get: {
        tags: ['Publico'],
        summary: 'Lista produtos do menu',
        parameters: [
          { name: 'categoryId', in: 'query', required: false, schema: { type: 'integer' } },
          { name: 'storeId', in: 'query', required: false, schema: { type: 'integer' } },
        ],
        responses: { 200: { description: 'Produtos.' } },
      },
    },
    '/products/{id}': {
      get: {
        tags: ['Publico'],
        summary: 'Busca um produto',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Produto.' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/customers/me': {
      get: {
        tags: ['Clientes'],
        summary: 'Dados do cliente autenticado',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Cliente.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
      post: {
        tags: ['Clientes'],
        summary: 'Cria cadastro do cliente autenticado',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Cliente criado.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
      put: {
        tags: ['Clientes'],
        summary: 'Atualiza cadastro do cliente autenticado',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Cliente atualizado.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/customers/me/stores': {
      get: {
        tags: ['Clientes'],
        summary: 'Lista lojas relacionadas ao cliente',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Lojas do cliente.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/customers/me/addresses': {
      post: {
        tags: ['Clientes'],
        summary: 'Cria endereco do cliente',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Endereco criado.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/addresses/{id}': {
      put: {
        tags: ['Clientes'],
        summary: 'Atualiza endereco do cliente',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Endereco atualizado.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/customers/me/validate-coupon': {
      post: {
        tags: ['Clientes'],
        summary: 'Valida cupom para o cliente',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Resultado da validacao.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/cart': {
      post: {
        tags: ['Carrinho'],
        summary: 'Cria carrinho e retorna token',
        responses: { 200: { description: 'Carrinho criado.' } },
      },
    },
    '/cart/me': {
      get: {
        tags: ['Carrinho'],
        summary: 'Busca carrinho atual',
        security: [{ cartToken: [] }],
        responses: { 200: { description: 'Carrinho.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/cart/items': {
      post: {
        tags: ['Carrinho'],
        summary: 'Adiciona item ao carrinho',
        security: [{ cartToken: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CartItemRequest' } } },
        },
        responses: { 200: { description: 'Item adicionado.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/cart/items/{id}': {
      put: {
        tags: ['Carrinho'],
        summary: 'Atualiza item do carrinho',
        security: [{ cartToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/CartItemRequest' } } } },
        responses: { 200: { description: 'Item atualizado.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
      delete: {
        tags: ['Carrinho'],
        summary: 'Remove item do carrinho',
        security: [{ cartToken: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Item removido.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/orders': {
      post: {
        tags: ['Pedidos'],
        summary: 'Cria pedido',
        security: [{ bearerAuth: [], cartToken: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Pedido criado.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/orders/me': {
      get: {
        tags: ['Pedidos'],
        summary: 'Lista pedidos do cliente',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Pedidos.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/orders/{id}': {
      get: {
        tags: ['Pedidos'],
        summary: 'Busca pedido do cliente',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: {
          200: { description: 'Pedido.' },
          401: { $ref: '#/components/responses/Unauthorized' },
          404: { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/orders/{id}/status': {
      patch: {
        tags: ['Pedidos'],
        summary: 'Atualiza status do pedido como admin',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderStatusRequest' } } } },
        responses: { 200: { description: 'Status atualizado.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/delivery-confirmations/{token}': {
      get: {
        tags: ['Pedidos'],
        summary: 'Busca confirmacao de entrega por token',
        parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Confirmacao de entrega.' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/delivery-confirmations/{token}/confirm': {
      post: {
        tags: ['Pedidos'],
        summary: 'Confirma entrega por token',
        parameters: [{ name: 'token', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Entrega confirmada.' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/payments/pix': {
      post: {
        tags: ['Pagamentos'],
        summary: 'Cria pagamento Pix interno',
        security: [{ internalApiKey: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Pix criado.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/payments/cash': {
      post: {
        tags: ['Pagamentos'],
        summary: 'Registra pagamento em dinheiro interno',
        security: [{ internalApiKey: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Pagamento registrado.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/payments/card-on-delivery': {
      post: {
        tags: ['Pagamentos'],
        summary: 'Registra pagamento por cartao na entrega',
        security: [{ internalApiKey: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Pagamento registrado.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/whatsapp/send-menu-link': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Envia link do menu pelo WhatsApp',
        security: [{ internalApiKey: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Mensagem enviada.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/whatsapp/send-order-confirmation': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Envia confirmacao de pedido pelo WhatsApp',
        security: [{ internalApiKey: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Mensagem enviada.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/whatsapp/send-status-update': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Envia atualizacao de status pelo WhatsApp',
        security: [{ internalApiKey: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Mensagem enviada.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/admin/login': {
      post: {
        tags: ['Admin'],
        summary: 'Login administrativo',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginRequest' } } },
        },
        responses: { 200: { description: 'Admin autenticado.' } },
      },
    },
    '/admin/me': {
      get: {
        tags: ['Admin'],
        summary: 'Dados do admin autenticado',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Admin.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/admin/orders': {
      get: {
        tags: ['Admin'],
        summary: 'Lista pedidos administrativos',
        security: [{ bearerAuth: [], storeId: [] }],
        responses: { 200: { description: 'Pedidos.' }, 401: { $ref: '#/components/responses/Unauthorized' } },
      },
    },
    '/admin/orders/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Busca pedido no painel admin',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Pedido.' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/admin/orders/{id}/status': {
      patch: {
        tags: ['Admin'],
        summary: 'Atualiza status do pedido no painel admin',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/OrderStatusRequest' } } } },
        responses: { 200: { description: 'Status atualizado.' } },
      },
    },
    '/admin/orders/{id}/print-thermal': {
      post: {
        tags: ['Admin'],
        summary: 'Imprime pedido em impressora termica',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Impressao solicitada.' } },
      },
    },
    '/admin/customers': {
      get: {
        tags: ['Admin'],
        summary: 'Lista clientes',
        security: [{ bearerAuth: [], storeId: [] }],
        responses: { 200: { description: 'Clientes.' } },
      },
    },
    '/admin/categories': {
      get: {
        tags: ['Admin'],
        summary: 'Lista categorias no painel admin',
        security: [{ bearerAuth: [], storeId: [] }],
        responses: { 200: { description: 'Categorias.' } },
      },
      post: {
        tags: ['Admin'],
        summary: 'Cria categoria',
        security: [{ bearerAuth: [], storeId: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Categoria criada.' } },
      },
    },
    '/admin/categories/{id}': {
      put: {
        tags: ['Admin'],
        summary: 'Atualiza categoria',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Categoria atualizada.' } },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Remove categoria',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Categoria removida.' } },
      },
    },
    '/admin/products': {
      get: {
        tags: ['Admin'],
        summary: 'Lista produtos no painel admin',
        security: [{ bearerAuth: [], storeId: [] }],
        responses: { 200: { description: 'Produtos.' } },
      },
      post: {
        tags: ['Admin'],
        summary: 'Cria produto',
        security: [{ bearerAuth: [], storeId: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Produto criado.' } },
      },
    },
    '/admin/products/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Busca produto no painel admin',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Produto.' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
      put: {
        tags: ['Admin'],
        summary: 'Atualiza produto',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Produto atualizado.' } },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Remove produto',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Produto removido.' } },
      },
    },
    '/admin/products/{id}/availability': {
      patch: {
        tags: ['Admin'],
        summary: 'Atualiza disponibilidade do produto',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Disponibilidade atualizada.' } },
      },
    },
    '/admin/settings': {
      get: {
        tags: ['Admin'],
        summary: 'Busca configuracoes da loja',
        security: [{ bearerAuth: [], storeId: [] }],
        responses: { 200: { description: 'Configuracoes.' } },
      },
      put: {
        tags: ['Admin'],
        summary: 'Atualiza configuracoes da loja',
        security: [{ bearerAuth: [], storeId: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Configuracoes atualizadas.' } },
      },
    },
    '/admin/delivery': {
      get: {
        tags: ['Admin'],
        summary: 'Busca configuracoes de entrega',
        security: [{ bearerAuth: [], storeId: [] }],
        responses: { 200: { description: 'Configuracoes de entrega.' } },
      },
      put: {
        tags: ['Admin'],
        summary: 'Atualiza configuracoes de entrega',
        security: [{ bearerAuth: [], storeId: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Entrega atualizada.' } },
      },
    },
    '/admin/coupons': {
      get: {
        tags: ['Admin'],
        summary: 'Lista cupons',
        security: [{ bearerAuth: [], storeId: [] }],
        responses: { 200: { description: 'Cupons.' } },
      },
      post: {
        tags: ['Admin'],
        summary: 'Cria cupom',
        security: [{ bearerAuth: [], storeId: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Cupom criado.' } },
      },
    },
    '/admin/coupons/{id}': {
      patch: {
        tags: ['Admin'],
        summary: 'Atualiza cupom',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Cupom atualizado.' } },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Remove cupom',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Cupom removido.' } },
      },
    },
    '/admin/media': {
      get: {
        tags: ['Midia'],
        summary: 'Lista midias',
        security: [{ bearerAuth: [], storeId: [] }],
        responses: { 200: { description: 'Midias.' } },
      },
      post: {
        tags: ['Midia'],
        summary: 'Cria midia',
        security: [{ bearerAuth: [], storeId: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Midia criada.' } },
      },
    },
    '/admin/media/{id}': {
      delete: {
        tags: ['Midia'],
        summary: 'Remove midia',
        security: [{ bearerAuth: [], storeId: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Midia removida.' } },
      },
    },
    '/media/files/{id}': {
      get: {
        tags: ['Midia'],
        summary: 'Serve arquivo de midia espelhado',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        responses: { 200: { description: 'Arquivo de midia.' }, 404: { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/admin/platform/stores': {
      get: {
        tags: ['Plataforma'],
        summary: 'Lista lojas da plataforma',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Lojas.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
      post: {
        tags: ['Plataforma'],
        summary: 'Cria loja da plataforma',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Loja criada.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/admin/platform/admins': {
      get: {
        tags: ['Plataforma'],
        summary: 'Lista administradores da plataforma',
        security: [{ bearerAuth: [] }],
        responses: { 200: { description: 'Administradores.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
      post: {
        tags: ['Plataforma'],
        summary: 'Cria administrador da plataforma',
        security: [{ bearerAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Administrador criado.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/admin/platform/admins/{id}/stores': {
      patch: {
        tags: ['Plataforma'],
        summary: 'Atualiza lojas de um administrador',
        security: [{ bearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/GenericObject' } } } },
        responses: { 200: { description: 'Vinculos atualizados.' }, 403: { $ref: '#/components/responses/Forbidden' } },
      },
    },
  },
};
