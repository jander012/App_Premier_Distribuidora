CREATE TABLE IF NOT EXISTS order_integrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  provider VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  external_ref VARCHAR(255),
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  request_payload JSON,
  response_payload JSON,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_integrations_order_provider (order_id, provider),
  INDEX idx_order_integrations_status (status),
  CONSTRAINT fk_order_integrations_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS integration_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT,
  provider VARCHAR(64) NOT NULL,
  direction VARCHAR(16) NOT NULL,
  action VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  payload JSON,
  error TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_integration_logs_order (order_id),
  INDEX idx_integration_logs_provider_created (provider, created_at),
  CONSTRAINT fk_integration_logs_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_external_refs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  product_id INT NOT NULL,
  provider VARCHAR(64) NOT NULL,
  external_ref VARCHAR(255) NOT NULL,
  stock_quantity DECIMAL(12,3),
  last_synced_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_product_external_refs_provider_ref (provider, external_ref),
  UNIQUE KEY uq_product_external_refs_product_provider (product_id, provider),
  INDEX idx_product_external_refs_store_provider (store_id, provider),
  CONSTRAINT fk_product_external_refs_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_product_external_refs_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
