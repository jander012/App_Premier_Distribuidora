ALTER TABLE store_configs
  ADD COLUMN hero_image_url TEXT NULL AFTER menu_base_url,
  ADD COLUMN hero_monthly_images JSON NULL AFTER hero_image_url;
