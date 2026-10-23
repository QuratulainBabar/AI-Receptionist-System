/** Digits only — used for loose matching across formatted numbers. */
export function digitsOnly(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

const SPOKEN_DIGIT_WORDS: Record<string, string> = {
  zero: "0",
  oh: "0",
  o: "0",
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  plus: "+",
  double: "", // handled specially below
  triple: "",
};

/**
 * Convert spoken phone phrases ("nine two three…", "plus nine two…") into digit text
 * before normalizePhone. Leaves already-numeric values unchanged.
 */
export function spokenPhoneToDigits(value: string | null | undefined) {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (/\d/.test(raw) && !/[a-zA-Z]/.test(raw)) return raw;

  const tokens = raw
    .toLowerCase()
    .replace(/[^a-z0-9+\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let out = "";
  let repeatNext = 1;
  for (const token of tokens) {
    if (token === "double") {
      repeatNext = 2;
      continue;
    }
    if (token === "triple") {
      repeatNext = 3;
      continue;
    }
    if (/^\d+$/.test(token)) {
      out += token.repeat(repeatNext);
      repeatNext = 1;
      continue;
    }
    const mapped = SPOKEN_DIGIT_WORDS[token];
    if (mapped == null) {
      repeatNext = 1;
      continue;
    }
    if (mapped === "+") {
      if (!out.startsWith("+")) out = `+${out}`;
      repeatNext = 1;
      continue;
    }
    out += mapped.repeat(repeatNext);
    repeatNext = 1;
  }
  return out;
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
  const raw = spokenPhoneToDigits(value) || (value ?? "").trim();
  if (!raw) return "";
  const digits = canonicalDigits(raw);
  if (!digits) return "";
  if (digits.length === 12 && digits.startsWith("92")) return `+${digits}`;
  if (raw.startsWith("+") || String(value ?? "").toLowerCase().includes("plus")) return `+${digits}`;
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
