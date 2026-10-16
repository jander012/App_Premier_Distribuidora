-- Horário semanal da loja + entregador padrão / telefone para WhatsApp

ALTER TABLE store_configs
  ADD COLUMN auto_schedule_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN store_timezone VARCHAR(64) NOT NULL DEFAULT 'America/Cuiaba',
  ADD COLUMN default_driver_id INT NULL;

ALTER TABLE delivery_drivers
  ADD COLUMN phone VARCHAR(32) NULL,
  ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE store_status_events
  ADD COLUMN source VARCHAR(32) NOT NULL DEFAULT 'manual';

CREATE TABLE IF NOT EXISTS store_weekly_hours (
  store_id INT NOT NULL,
  day_of_week TINYINT NOT NULL COMMENT '0=domingo .. 6=sábado',
  closed BOOLEAN NOT NULL DEFAULT false,
  open_time TIME NULL,
  close_time TIME NULL,
  PRIMARY KEY (store_id, day_of_week),
  CONSTRAINT fk_store_weekly_hours_store FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT chk_store_weekly_hours_dow CHECK (day_of_week BETWEEN 0 AND 6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_delivery_drivers_store_default ON delivery_drivers (store_id, is_default);
