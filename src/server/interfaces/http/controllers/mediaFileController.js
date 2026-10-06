import path from 'path';
import { promises as fs } from 'fs';
import { env } from '../../../infrastructure/config/env.js';
import * as mediaRepo from '../../../infrastructure/repositories/mediaRepository.js';
import { detectImageMime } from '../../../application/services/mediaIngestService.js';

/**
 * Media is served from the app origin; legacy rows may hold SVG/HTML with an attacker-chosen type,
 * so the response type is derived from the bytes and the document is sandboxed.
 */
function sendSafeMedia(res, buf) {
  const mime = detectImageMime(buf);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Cache-Control', 'public, max-age=86400');
  if (mime) {
    res.setHeader('Content-Type', mime);
  } else {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment');
  }
  return res.send(buf);
}

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
    if (row.file_data) {
      return sendSafeMedia(res, Buffer.from(row.file_data));
    }
    // Fallback: quando nao ha arquivo local recuperavel (disco efemero em
    // producao, por exemplo), redireciona para a URL de origem/externa.
    const redirectToSource = () => {
      const src = row.source_url && String(row.source_url).trim();
      const pub = row.public_url && String(row.public_url).trim();
      if (/^https?:\/\//i.test(src)) {
        res.redirect(302, src);
        return true;
      }
      if (/^https?:\/\//i.test(pub) && !/\/api\/media\/files\//i.test(pub)) {
        res.redirect(302, pub);
        return true;
      }
      return false;
    };
    const storagePath = row.storage_path && String(row.storage_path).trim();
    if (!storagePath) {
      if (redirectToSource()) return;
      return res.status(404).send('Imagem sem arquivo local; cadastre de novo sem "só link" ou use URL https externa.');
    }
    const base = path.basename(String(storagePath));
    if (!base || base !== String(row.storage_path).trim()) {
      if (redirectToSource()) return;
      return res.status(404).send('Arquivo não encontrado');
    }
    const root = env.mediaUploadDir;
    const full = path.join(root, base);
    const resolvedRoot = path.resolve(root);
    if (!full.startsWith(resolvedRoot + path.sep) && full !== resolvedRoot) {
      if (redirectToSource()) return;
      return res.status(404).send('Arquivo não encontrado');
    }
    let buf;
    try {
      buf = await fs.readFile(full);
    } catch (readErr) {
      if (readErr && readErr.code === 'ENOENT') {
        if (redirectToSource()) return;
        return res.status(404).send('Arquivo não encontrado');
      }
      throw readErr;
    }
    return sendSafeMedia(res, buf);
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return res.status(404).send('Arquivo não encontrado');
    }
    next(e);
  }
}
