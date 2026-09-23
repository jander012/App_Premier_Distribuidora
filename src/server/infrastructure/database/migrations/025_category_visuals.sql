ALTER TABLE categories
  ADD COLUMN image_url TEXT NULL AFTER name,
  ADD COLUMN background_color VARCHAR(20) NULL AFTER image_url;
