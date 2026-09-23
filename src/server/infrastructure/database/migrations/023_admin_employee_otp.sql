ALTER TABLE admin_users
  ADD COLUMN name VARCHAR(255) NULL AFTER id;

CREATE TABLE IF NOT EXISTS admin_login_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id INT NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_admin_login_codes_admin_created (admin_user_id, created_at),
  INDEX idx_admin_login_codes_expires (expires_at),
  CONSTRAINT fk_admin_login_codes_admin FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
