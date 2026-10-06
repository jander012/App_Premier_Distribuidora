import crypto from 'crypto';
import { AppError } from '../../domain/shared/AppError.js';

/** @type {Map<string, { code: string, exp: number, attempts: number }>} */
const store = new Map();
/** @type {Map<string, number[]>} timestamps of recent code requests per phone */
const requests = new Map();

const TTL_MS = 10 * 60 * 1000;
const MAX_VERIFY_ATTEMPTS = 5;
const MIN_REQUEST_INTERVAL_MS = 30 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const REQUEST_WINDOW_MS = 60 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.exp < now) store.delete(k);
  }
  for (const [k, list] of requests.entries()) {
    const recent = list.filter((t) => now - t < REQUEST_WINDOW_MS);
    if (recent.length) requests.set(k, recent);
    else requests.delete(k);
  }
}

/**
 * Each code allows MAX_VERIFY_ATTEMPTS guesses and re-issuing is throttled per phone,
 * so the 6-digit space cannot be brute-forced by requesting fresh codes.
 */
export function createAndStoreOtp(phone) {
  prune();
  const now = Date.now();
  const recent = requests.get(phone) || [];
  const last = recent[recent.length - 1];
  if (last != null && now - last < MIN_REQUEST_INTERVAL_MS) {
    const wait = Math.ceil((MIN_REQUEST_INTERVAL_MS - (now - last)) / 1000);
    throw new AppError(429, `Aguarde ${wait}s para solicitar um novo código.`);
  }
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    throw new AppError(429, 'Muitas solicitações de código. Tente novamente mais tarde.');
  }
  requests.set(phone, [...recent, now]);
  const code = String(crypto.randomInt(100000, 1000000));
  store.set(phone, { code, exp: now + TTL_MS, attempts: 0 });
  return code;
}

export function verifyOtp(phone, inputCode) {
  prune();
  const entry = store.get(phone);
  if (!entry || Date.now() > entry.exp) {
    store.delete(phone);
    return false;
  }
  entry.attempts += 1;
  const input = Buffer.from(String(inputCode ?? '').trim());
  const expected = Buffer.from(entry.code);
  const ok = input.length === expected.length && crypto.timingSafeEqual(input, expected);
  if (ok || entry.attempts >= MAX_VERIFY_ATTEMPTS) store.delete(phone);
  return ok;
}
