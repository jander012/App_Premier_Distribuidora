import crypto from 'crypto';
import dns from 'dns/promises';
import net from 'net';
import path from 'path';
import { promises as fs } from 'fs';
import { env } from '../../infrastructure/config/env.js';
import { AppError } from '../../domain/shared/AppError.js';
import * as mediaRepo from '../../infrastructure/repositories/mediaRepository.js';

const MAX_BYTES = 8 * 1024 * 1024;
const FETCH_MS = 28_000;

const MAX_REDIRECTS = 3;

/**
 * Raster image type from magic bytes. SVG and anything else are rejected: media is served
 * from the app origin, so a scriptable type would run with access to the app's storage.
 */
export function detectImageMime(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.toString('ascii', 4, 8) === 'ftyp' && /^avi[fs]$/.test(buf.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}

export function validateUploadedImage(_contentType, buf) {
  if (!Buffer.isBuffer(buf) || buf.length === 0) {
    throw new AppError(400, 'Arquivo de imagem vazio.');
  }
  if (buf.length > MAX_BYTES) {
    throw new AppError(400, 'Imagem muito grande (máximo 8 MB).');
  }
  const mime = detectImageMime(buf);
  if (!mime) {
    throw new AppError(400, 'Formato não suportado: envie JPG, PNG, GIF, WEBP ou AVIF.');
  }
  return mime;
}

function isPrivateIPv4(ip) {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateAddress(ip) {
  if (net.isIPv4(ip)) return isPrivateIPv4(ip);
  const v6 = ip.toLowerCase();
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return (
    v6 === '::' ||
    v6 === '::1' ||
    v6.startsWith('fc') ||
    v6.startsWith('fd') ||
    /^fe[89ab]/.test(v6) ||
    v6.startsWith('ff') ||
    v6.startsWith('64:ff9b:') ||
    v6.startsWith('2002:')
  );
}

/** Blocks SSRF to loopback, private, link-local (cloud metadata) and other internal ranges. */
async function assertPublicHttpUrl(rawUrl) {
  let u;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new AppError(400, 'URL inválida.');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new AppError(400, 'Use uma URL http ou https.');
  }
  if (u.username || u.password) throw new AppError(400, 'URL com credenciais não é permitida.');
  if (u.port && u.port !== '80' && u.port !== '443') {
    throw new AppError(400, 'Porta não permitida para download de imagem.');
  }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  let addrs;
  try {
    addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true, verbatim: true });
  } catch {
    throw new AppError(400, 'Não foi possível resolver o endereço da imagem.');
  }
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) {
    throw new AppError(400, 'Endereço da imagem não permitido (rede interna).');
  }
  return u;
}

async function fetchRemoteImageBuffer(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    let current = url;
    let res;
    for (let hop = 0; ; hop += 1) {
      await assertPublicHttpUrl(current);
      res = await fetch(current, {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AppLojaMedia/1.0)',
          Accept: 'image/avif,image/webp,image/apng,image/*;q=0.8',
        },
      });
      if (res.status < 300 || res.status >= 400) break;
      const location = res.headers.get('location');
      if (!location || hop >= MAX_REDIRECTS) {
        throw new AppError(400, 'A URL da imagem redirecionou demais.');
      }
      current = new URL(location, current).toString();
    }
    if (!res.ok) {
      throw new AppError(400, `Não foi possível baixar a imagem (HTTP ${res.status}).`);
    }
    const declared = Number(res.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > MAX_BYTES) {
      throw new AppError(400, 'Imagem muito grande (máximo 8 MB).');
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) {
      throw new AppError(400, 'A URL não retornou dados.');
    }
    if (buf.length > MAX_BYTES) {
      throw new AppError(400, 'Imagem muito grande (máximo 8 MB).');
    }
    const contentType = detectImageMime(buf);
    if (!contentType) {
      throw new AppError(400, 'O endereço não é uma imagem suportada (JPG, PNG, GIF, WEBP ou AVIF).');
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
  const publicUrl = `/api/media/files/${id}`;
  // Guarda o binario no banco (file_data), e nao em disco, para sobreviver a
  // deploys/ambientes com filesystem efemero (producao). Mantem source_url.
  try {
    return await mediaRepo.insertUploadedMedia({
      id,
      contentHash: hash,
      publicUrl,
      storeId: opts.storeId ?? null,
      title: opts.title ?? null,
      fileData: buffer,
      mimeType: contentType,
      sourceUrl: url,
    });
  } catch (e) {
    if (e && (e.code === '23505' || e.code === 'ER_DUP_ENTRY')) {
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

/**
 * Registra upload local guardando o binário no banco.
 * @param {{ buffer: Buffer, filename?: string, mimeType?: string }} file
 * @param {{ storeId?: number|null, title?: string|null }} opts
 */
export async function ingestUploadedImage(file, opts = {}) {
  const buffer = file?.buffer;
  const contentType = validateUploadedImage(file?.mimeType, buffer);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  const existing = await mediaRepo.findByContentHash(hash);
  if (existing) {
    await mediaRepo.mergeMediaStoreAndTitle(hash, {
      storeId: opts.storeId ?? null,
      title: opts.title ?? null,
      sourceUrl: file?.filename || null,
    });
    const row = await mediaRepo.findByContentHash(hash);
    if (row) return row;
  }

  const id = crypto.randomUUID();
  const publicUrl = `/api/media/files/${id}`;
  return mediaRepo.insertUploadedMedia({
    id,
    contentHash: hash,
    publicUrl,
    storeId: opts.storeId ?? null,
    title: opts.title ?? null,
    fileData: buffer,
    mimeType: contentType,
    sourceUrl: file?.filename || null,
  });
}
