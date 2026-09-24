ALTER TABLE media_assets
  ADD COLUMN file_data LONGBLOB NULL AFTER storage_path;
