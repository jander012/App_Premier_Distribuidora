const AGE_GATE_PREFIX = 'delivery_age_gate:';

export function ageGateStorageKey(storeSlug) {
  return `${AGE_GATE_PREFIX}${storeSlug || 'principal'}`;
}

export function readAgeGateDecision(storeSlug) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(ageGateStorageKey(storeSlug));
    if (raw === 'adult') return true;
    if (raw === 'minor') return false;
  } catch {
    /* ignore */
  }
  return null;
}

export function writeAgeGateDecision(storeSlug, isAdult) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(ageGateStorageKey(storeSlug), isAdult ? 'adult' : 'minor');
    window.dispatchEvent(new CustomEvent('delivery-age-gate', { detail: { storeSlug, isAdult } }));
  } catch {
    /* ignore */
  }
}

export function restrictedQueryParam(isAdult) {
  return isAdult === true ? 'includeAgeRestricted=1' : 'includeAgeRestricted=0';
}

export function ageConfirmedPayload(isAdult) {
  return isAdult === true ? { ageConfirmed: true } : {};
}
