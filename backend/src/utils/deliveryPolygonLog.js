const TAG = '[delivery-polygon]';

export function logPolygonInfo(message, meta = {}) {
  // eslint-disable-next-line no-console
  console.log(TAG, message, Object.keys(meta).length ? meta : '');
}

export function logPolygonWarn(message, meta = {}) {
  // eslint-disable-next-line no-console
  console.warn(TAG, message, Object.keys(meta).length ? meta : '');
}

export function logPolygonError(message, err, meta = {}) {
  // eslint-disable-next-line no-console
  console.error(TAG, message, err?.message || err, meta);
}
