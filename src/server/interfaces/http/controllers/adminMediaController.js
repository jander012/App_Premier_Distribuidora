import * as mediaRepo from '../../../infrastructure/repositories/mediaRepository.js';
import { ingestRemoteImage, removeStoredFileIfPresent } from '../../../application/services/mediaIngestService.js';

export async function listMedia(req, res, next) {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 24;
    const q = req.query.q || undefined;
    const data = await mediaRepo.listByStore(req.storeId, { page, limit, q });
    res.json(data);
  } catch (e) {
    next(e);
  }
}

export async function createMedia(req, res, next) {
  try {
    const publicUrl = req.body.publicUrl || req.body.public_url;
    if (!publicUrl || !String(publicUrl).trim()) {
      return res.status(400).json({ error: 'Informe publicUrl' });
    }
    const title = req.body.title || null;
    const onlyRegisterUrl =
      req.body.onlyRegisterUrl === true ||
      req.body.only_register_url === true ||
      req.body.skipDownload === true;

    const raw = String(publicUrl).trim();
    let row;
    if (onlyRegisterUrl || !/^https?:\/\//i.test(raw)) {
      row = await mediaRepo.upsertMediaByPublicUrl(raw, { storeId: req.storeId, title });
    } else {
      row = await ingestRemoteImage(raw, { storeId: req.storeId, title });
    }
    if (!row) return res.status(400).json({ error: 'URL inválida' });
    res.status(201).json({
      id: row.id,
      publicUrl: row.public_url,
      title: row.title,
      contentHash: row.content_hash,
      createdAt: row.created_at,
      sourceUrl: row.source_url || null,
      storedLocally: Boolean(row.storage_path),
    });
  } catch (e) {
    next(e);
  }
}

export async function deleteMedia(req, res, next) {
  try {
    const id = decodeURIComponent(String(req.params.id || '').trim());
    if (!id) {
      return res.status(400).json({ error: 'ID da mídia inválido' });
    }
    const result = await mediaRepo.deleteByIdForStore(id, req.storeId);
    if (!result.ok && result.reason === 'in_use') {
      return res.status(409).json({ error: 'Imagem em uso por um produto. Remova a imagem do produto antes de excluir.' });
    }
    if (!result.ok && result.reason === 'wrong_store') {
      return res.status(403).json({ error: 'Esta mídia pertence a outra loja.' });
    }
    if (!result.ok && result.reason === 'invalid') {
      return res.status(400).json({ error: 'ID da mídia inválido' });
    }
    if (!result.ok) {
      return res.status(404).json({ error: 'Mídia não encontrada' });
    }
    if (result.storagePath) {
      await removeStoredFileIfPresent(result.storagePath);
    }
    res.status(204).end();
  } catch (e) {
    next(e);
  }
}
