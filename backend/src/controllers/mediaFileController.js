import path from 'path';
import { promises as fs } from 'fs';
import { env } from '../config/env.js';
import * as mediaRepo from '../repositories/mediaRepository.js';

export async function serveMediaFile(req, res, next) {
  try {
    const id = String(req.params.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return res.status(400).send('ID inválido');
    }
    const row = await mediaRepo.findForMediaFileServe(id);
    if (!row) {
      return res.status(404).send('Arquivo não encontrado');
    }
    const storagePath = row.storage_path && String(row.storage_path).trim();
    if (!storagePath) {
      const src = row.source_url && String(row.source_url).trim();
      const pub = row.public_url && String(row.public_url).trim();
      if (/^https?:\/\//i.test(src)) {
        return res.redirect(302, src);
      }
      if (/^https?:\/\//i.test(pub) && !/\/api\/media\/files\//i.test(pub)) {
        return res.redirect(302, pub);
      }
      return res.status(404).send('Imagem sem arquivo local; cadastre de novo sem "só link" ou use URL https externa.');
    }
    const base = path.basename(String(storagePath));
    if (!base || base !== String(row.storage_path).trim()) {
      return res.status(404).send('Arquivo não encontrado');
    }
    const root = env.mediaUploadDir;
    const full = path.join(root, base);
    const resolvedRoot = path.resolve(root);
    if (!full.startsWith(resolvedRoot + path.sep) && full !== resolvedRoot) {
      return res.status(404).send('Arquivo não encontrado');
    }
    const buf = await fs.readFile(full);
    const mime = row.mime_type && String(row.mime_type).trim() ? String(row.mime_type).trim() : 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return res.status(404).send('Arquivo não encontrado');
    }
    next(e);
  }
}
