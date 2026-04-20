-- Super administrador (cadastro de lojas e de outros admins) e flag no JWT

ALTER TABLE admin_users
  ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

UPDATE admin_users SET is_super_admin = true WHERE email = 'admin@delivery.local';
