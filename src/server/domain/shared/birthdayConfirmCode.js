/**
 * Código de confirmação do cliente = ano de nascimento (4) + dia do mês (2).
 * Ex.: 15/03/1990 → "199015"
 */
export function birthdayConfirmCode(birthDate) {
  if (!birthDate) return null;
  const raw = String(birthDate).trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let year;
  let day;
  if (m) {
    year = m[1];
    day = m[3];
  } else {
    const d = new Date(birthDate);
    if (Number.isNaN(d.getTime())) return null;
    year = String(d.getFullYear());
    day = String(d.getDate()).padStart(2, '0');
  }
  return `${year}${day}`;
}

export function normalizeConfirmCodeInput(code) {
  return String(code || '').replace(/\D/g, '');
}

export function codesMatch(input, birthDate) {
  const expected = birthdayConfirmCode(birthDate);
  if (!expected) return false;
  return normalizeConfirmCodeInput(input) === expected;
}
