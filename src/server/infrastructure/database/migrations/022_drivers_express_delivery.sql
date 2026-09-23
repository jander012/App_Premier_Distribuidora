ALTER TABLE store_configs
  ADD COLUMN express_delivery_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN express_delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN express_delivery_max_km DECIMAL(10,2) NOT NULL DEFAULT 5.00,
  ADD COLUMN express_delivery_eta_minutes INT NOT NULL DEFAULT 15;

ALTER TABLE orders
  ADD COLUMN express_delivery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN express_delivery_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN driver_id INT NULL;

CREATE TABLE IF NOT EXISTS delivery_drivers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  cpf VARCHAR(14) NOT NULL,
  vehicle_description VARCHAR(255),
  vehicle_photo_url TEXT,
  username VARCHAR(80) NOT NULL,
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_delivery_drivers_store_username (store_id, username),
  INDEX idx_delivery_drivers_store_active (store_id, active),
  CONSTRAINT fk_delivery_drivers_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS delivery_runs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  order_id INT NOT NULL,
  driver_id INT,
  status VARCHAR(32) NOT NULL DEFAULT 'available',
  accepted_at TIMESTAMP NULL,
  picked_up_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_delivery_runs_order (order_id),
  INDEX idx_delivery_runs_store_status (store_id, status),
  INDEX idx_delivery_runs_driver_status (driver_id, status),
  CONSTRAINT fk_delivery_runs_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_runs_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_delivery_runs_driver FOREIGN KEY (driver_id) REFERENCES delivery_drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_chat_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  sender_type VARCHAR(16) NOT NULL,
  sender_id INT,
  body TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_order_chat_messages_order (order_id, created_at),
  CONSTRAINT fk_order_chat_messages_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  store_id INT NOT NULL,
  driver_id INT,
  target_type VARCHAR(16) NOT NULL,
  rating INT NOT NULL,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_reviews_order_target (order_id, target_type),
  INDEX idx_order_reviews_store_target (store_id, target_type),
  INDEX idx_order_reviews_driver (driver_id),
  CONSTRAINT fk_order_reviews_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_reviews_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_reviews_driver FOREIGN KEY (driver_id) REFERENCES delivery_drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
