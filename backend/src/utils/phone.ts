/** Digits only — used for loose matching across formatted numbers. */
export function digitsOnly(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Normalize to E.164-ish `+` + digits when possible.
 * Leaves empty string unchanged.
 */
/** Pakistan local mobiles are 03XXXXXXXXX. Store them as +92 without the leading 0. */
function canonicalDigits(value: string | null | undefined) {
  let digits = digitsOnly(value);
  if (digits.length === 11 && digits.startsWith("0")) digits = `92${digits.slice(1)}`;
  return digits;
}

export function normalizePhone(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const digits = canonicalDigits(raw);
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("92")) return `+${digits}`;
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined) {
  const da = canonicalDigits(a);
  const db = canonicalDigits(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const a10 = da.length > 10 ? da.slice(-10) : da;
  const b10 = db.length > 10 ? db.slice(-10) : db;
  return a10 === b10 && a10.length >= 10;
}
