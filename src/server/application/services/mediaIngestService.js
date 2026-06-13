import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { env } from '../../infrastructure/config/env.js';
import { AppError } from '../../domain/shared/AppError.js';
import * as mediaRepo from '../../infrastructure/repositories/mediaRepository.js';

const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_MS = 28_000;

function extensionForMime(mime) {
  const m = String(mime || '').toLowerCase().split(';')[0].trim();
  if (m === 'image/jpeg' || m === 'image/jpg') return '.jpg';
  if (m === 'image/png') return '.png';
  if (m === 'image/webp') return '.webp';
  if (m === 'image/gif') return '.gif';
  if (m === 'image/svg+xml') return '.svg';
  if (m.startsWith('image/')) return '.img';
  return '.bin';
}

function isImageMagic(buf) {
  if (!buf || buf.length < 12) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50)
    return true;
  if (buf[0] === 0x3c && buf.length > 5) {
    const head = buf.subarray(0, 256).toString('utf8').toLowerCase();
    if (head.includes('<svg')) return true;
  }
  return false;
}

function validateImageBuffer(contentType, buf) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return true;
  return isImageMagic(buf);
}

async function fetchRemoteImageBuffer(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AppLojaMedia/1.0)',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });
    if (!res.ok) {
      throw new AppError(400, `Não foi possível baixar a imagem (HTTP ${res.status}).`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      throw new AppError(400, 'A URL não retornou dados.');
    }
    if (buf.length > MAX_BYTES) {
      throw new AppError(400, 'Imagem muito grande (máximo 8 MB).');
    }
    const rawCt = res.headers.get('content-type') || '';
    const contentType = rawCt.split(';')[0].trim() || 'application/octet-stream';
    if (!validateImageBuffer(contentType, buf)) {
      throw new AppError(400, 'O endereço não parece ser uma imagem válida.');
    }
    return { buffer: buf, contentType };
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new AppError(400, 'Tempo esgotado ao baixar a imagem.');
    }
    if (e instanceof AppError) throw e;
    throw new AppError(400, 'Falha ao baixar a imagem. Verifique a URL e sua conexão.');
  } finally {
    clearTimeout(timer);
  }
}

function uploadRoot() {
  return env.mediaUploadDir;
}

export async function removeStoredFileIfPresent(storageFilename) {
  if (!storageFilename) return;
  const base = path.basename(String(storageFilename));
  if (!base || base !== String(storageFilename).trim()) return;
  const full = path.join(uploadRoot(), base);
  const resolvedRoot = path.resolve(uploadRoot());
  if (!full.startsWith(resolvedRoot + path.sep) && full !== resolvedRoot) return;
  await fs.unlink(full).catch(() => {});
}

/**
 * Baixa uma imagem HTTP(s), grava em disco e registra no banco (dedup por hash do arquivo).
 * @param {string} sourceUrl
 * @param {{ storeId?: number|null, title?: string|null }} opts
 */
export async function ingestRemoteImage(sourceUrl, opts = {}) {
  const url = String(sourceUrl || '').trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new AppError(400, 'Use uma URL http ou https.');
  }

  const { buffer, contentType } = await fetchRemoteImageBuffer(url);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const existing = await mediaRepo.findByContentHash(hash);
  if (existing) {
    await mediaRepo.mergeMediaStoreAndTitle(hash, {
      storeId: opts.storeId ?? null,
      title: opts.title ?? null,
      sourceUrl: url,
    });
    const row = await mediaRepo.findByContentHash(hash);
    return row;
  }

  const id = crypto.randomUUID();
  const ext = extensionForMime(contentType);
  const filename = `${id}${ext}`;
  const root = uploadRoot();
  await fs.mkdir(root, { recursive: true });
  const fullPath = path.join(root, filename);
  await fs.writeFile(fullPath, buffer);

  const publicUrl = `/api/media/files/${id}`;
  try {
    return await mediaRepo.insertMirroredMedia({
      id,
      contentHash: hash,
      publicUrl,
      storeId: opts.storeId ?? null,
      title: opts.title ?? null,
      storagePath: filename,
      mimeType: contentType,
      sourceUrl: url,
    });
  } catch (e) {
    await fs.unlink(fullPath).catch(() => {});
    if (e && e.code === '23505') {
      await mediaRepo.mergeMediaStoreAndTitle(hash, {
        storeId: opts.storeId ?? null,
        title: opts.title ?? null,
        sourceUrl: url,
      });
      const row = await mediaRepo.findByContentHash(hash);
      if (row) return row;
    }
    throw e;
  }
}
