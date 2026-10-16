-- Vários logins SSO (e-mails) podem apontar para o mesmo entregador da loja.
CREATE TABLE IF NOT EXISTS delivery_driver_sso_logins (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  driver_id BIGINT UNSIGNED NOT NULL,
  store_id INT NOT NULL,
  email VARCHAR(255) NOT NULL,
  sso_sub VARCHAR(64) NULL,
  label VARCHAR(120) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_driver_sso_email (email),
  KEY idx_driver_sso_driver (driver_id),
  KEY idx_driver_sso_store (store_id),
  CONSTRAINT fk_driver_sso_driver FOREIGN KEY (driver_id) REFERENCES delivery_drivers(id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_sso_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
