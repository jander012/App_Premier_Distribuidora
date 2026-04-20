-- Arquivos de mídia espelhados no servidor (path em disco + URL servida pela API)

ALTER TABLE media_assets
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS mime_type VARCHAR(128),
  ADD COLUMN IF NOT EXISTS source_url TEXT;

COMMENT ON COLUMN media_assets.storage_path IS 'Nome do arquivo dentro do diretório de uploads (ex.: uuid.jpg)';
COMMENT ON COLUMN media_assets.source_url IS 'URL remota original quando a imagem foi baixada pelo servidor';
