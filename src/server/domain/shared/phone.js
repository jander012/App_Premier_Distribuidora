/** Normaliza telefone BR para dígitos com DDD (sem +55 opcional na chave). */
export function normalizePhone(input) {
  if (!input || typeof input !== 'string') return null;
  let d = input.replace(/\D/g, '');
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return d;
}

export function displayPhone(digits) {
  if (!digits) return '';
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  return digits;
}
