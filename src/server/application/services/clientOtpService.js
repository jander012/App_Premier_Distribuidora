import crypto from 'crypto';

/** @type {Map<string, { code: string, exp: number }>} */
const store = new Map();

const TTL_MS = 10 * 60 * 1000;

function prune() {
  const now = Date.now();
  for (const [k, v] of store.entries()) {
    if (v.exp < now) store.delete(k);
  }
}

export function createAndStoreOtp(phone) {
  prune();
  const code = String(crypto.randomInt(100000, 1000000));
  store.set(phone, { code, exp: Date.now() + TTL_MS });
  return code;
}

export function verifyOtp(phone, inputCode) {
  prune();
  const entry = store.get(phone);
  if (!entry || Date.now() > entry.exp) {
    store.delete(phone);
    return false;
  }
  if (String(inputCode).trim() !== entry.code) return false;
  store.delete(phone);
  return true;
}
