const PREFIX = 'list_session:';

export function readListSession(key) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function writeListSession(key, state) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(
      `${PREFIX}${key}`,
      JSON.stringify({
        ...state,
        savedAt: Date.now(),
      })
    );
  } catch {
    /* private mode / quota */
  }
}

/**
 * Restaura posição de rolagem depois que a lista renderizou.
 * Tenta algumas vezes porque o conteúdo assíncrono ainda pode crescer.
 */
export function restoreListScroll(scrollY, { attempts = 8, delayMs = 50 } = {}) {
  if (typeof window === 'undefined') return;
  const y = Number(scrollY);
  if (!Number.isFinite(y) || y <= 0) return;

  let left = attempts;
  const tick = () => {
    window.scrollTo(0, y);
    left -= 1;
    if (left > 0 && Math.abs(window.scrollY - y) > 4) {
      window.setTimeout(tick, delayMs);
    }
  };
  requestAnimationFrame(tick);
}
