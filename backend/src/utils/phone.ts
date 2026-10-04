/** Digits only — used for loose matching across formatted numbers. */
export function digitsOnly(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/**
 * Normalize to E.164-ish `+` + digits when possible.
 * Leaves empty string unchanged.
 */
export function normalizePhone(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const digits = digitsOnly(raw);
  if (!digits) return "";
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function phonesMatch(a: string | null | undefined, b: string | null | undefined) {
  const da = digitsOnly(a);
  const db = digitsOnly(b);
  if (!da || !db) return false;
  if (da === db) return true;
  const a10 = da.length > 10 ? da.slice(-10) : da;
  const b10 = db.length > 10 ? db.slice(-10) : db;
  return a10 === b10 && a10.length >= 10;
}
