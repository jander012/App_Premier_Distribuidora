CREATE TABLE IF NOT EXISTS store_status_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  store_id INT NOT NULL,
  status VARCHAR(16) NOT NULL,
  reason TEXT,
  created_by_admin_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_store_status_events_store_created (store_id, created_at),
  INDEX idx_store_status_events_store_status_created (store_id, status, created_at),
  CONSTRAINT fk_store_status_events_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT fk_store_status_events_admin FOREIGN KEY (created_by_admin_id) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
