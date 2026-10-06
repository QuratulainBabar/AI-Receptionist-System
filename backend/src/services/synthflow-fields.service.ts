type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

export function looksLikeRecordId(value: string | null | undefined) {
  const s = (value || "").trim();
  return /^c[a-z0-9]{20,}$/i.test(s);
}

const MONTHS: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

/** Parse spoken times like "Tuesday, October 6th at 10:30 AM" or "Tue, Oct 6, 10:30 AM". */
export function parseSpokenAppointmentTime(text: string, now = new Date()): Date | null {
  if (!text.trim()) return null;
  const src = text.replace(/(\d+)\s*:\s*(\d+)/g, "$1:$2").replace(/(\d+)(st|nd|rd|th)/gi, "$1");
  const match = src.match(
    /(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{4}))?[^0-9]{0,24}(\d{1,2}):(\d{2})\s*(am|pm)/i,
  );
  if (!match) return null;

  const month = MONTHS[match[1].toLowerCase()];
  if (month == null) return null;
  const day = Number(match[2]);
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const meridiem = match[6].toLowerCase();
  if (meridiem === "pm" && hour < 12) hour += 12;
  if (meridiem === "am" && hour === 12) hour = 0;

  const year = match[3] ? Number(match[3]) : now.getFullYear();
  const parsed = new Date(year, month, day, hour, minute, 0, 0);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.getTime() < now.getTime() - 12 * 60 * 60 * 1000 && !match[3]) {
    parsed.setFullYear(year + 1);
  }
  return parsed;
}

export function emptyish(value: string | null | undefined) {
  if (value == null) return true;
  const s = value.trim().toLowerCase();
  return !s || s === "none" || s === "null" || s === "n/a" || s === "na" || s === "unknown";
}

function pickFirst(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const direct = fields[key];
    if (!emptyish(direct)) return direct.trim();
    const lower = fields[key.toLowerCase()];
    if (!emptyish(lower)) return lower.trim();
  }
  return "";
}

/** Pull plain-text values from Synthflow post-call payload (extractors, collected_variables, analysis). */
export function extractSynthflowFields(payload: unknown): Record<string, string> {
  const fields: Record<string, string> = {};
  const root = asRecord(payload);

  const collected = root.collected_variables;
  if (collected && typeof collected === "object") {
    for (const [key, val] of Object.entries(asRecord(collected))) {
      if (val && typeof val === "object" && "value" in (val as object)) {
        const v = asString((val as JsonRecord).value).trim();
        if (v) fields[key.toLowerCase()] = v;
      } else {
        const v = asString(val).trim();
        if (v) fields[key.toLowerCase()] = v;
      }
    }
  }

  const executed = asRecord(root.executed_actions);
  for (const action of Object.values(executed)) {
    const row = asRecord(action);
    const hardId = asString(asRecord(row.parameters_hard_coded).identifier).toLowerCase();
    const name = asString(row.name).toLowerCase();
    const ret = row.return_value;
    let value: string | null = null;
    if (ret != null && typeof ret === "object") {
      const vals = Object.values(asRecord(ret))
        .map((x) => asString(x).trim())
        .filter((x) => x && !emptyish(x));
      value = vals[0] ?? null;
    } else {
      const v = asString(ret).trim();
      value = emptyish(v) ? null : v;
    }
    if (!value) continue;
    const key =
      hardId ||
      name.replace(/^extract_info[_\s-]*/i, "").replace(/\s+/g, "_") ||
      name;
    if (key) fields[key.toLowerCase()] = value;
  }

  const analysis = asRecord(root.analysis);
  for (const [key, val] of Object.entries(analysis)) {
    const v = asString(val).trim();
    if (v && !emptyish(v)) fields[key.toLowerCase()] = v;
  }

  // Custom actions post a flat JSON body (phone, doctor_name, slot_id, ...).
  for (const [key, val] of Object.entries(root)) {
    if (val != null && typeof val === "object") continue;
    const v = asString(val).trim();
    if (!v || emptyish(v)) continue;
    const normalized = key.toLowerCase();
    if (!fields[normalized]) fields[normalized] = v;
  }

  const aliases: Record<string, string[]> = {
    patient_name: ["patient_name", "name", "full_name", "customer_name"],
    phone: ["phone", "phone_number", "customer_phone", "caller_phone"],
    email: ["email", "patient_email"],
    doctor_id: ["doctor_id", "doctorid"],
    doctor_name: ["doctor_name", "doctor"],
    slot_id: ["slot_id", "slotid", "appointment_slot_id"],
    reason: ["reason", "visit_reason", "chief_complaint"],
    appointment_datetime: ["appointment_datetime", "appointment_time", "datetime"],
  };

  for (const [canonical, keys] of Object.entries(aliases)) {
    if (!fields[canonical]) {
      const picked = pickFirst(fields, keys);
      if (picked) fields[canonical] = picked;
    }
  }

  return fields;
}

export type VoiceBookingFields = {
  patientName: string;
  phone: string;
  email: string;
  doctorId: string;
  doctorName: string;
  slotId: string;
  reason: string;
  whenHint: Date | null;
  otp: string;
};

export function extractVoiceBookingFields(payload: unknown): VoiceBookingFields {
  const fields = extractSynthflowFields(payload);
  const root = asRecord(payload);
  const analysis = asRecord(root.analysis);
  const call = asRecord(root.call);
  const transcript = asString(call.transcript || root.transcript);
  const summary =
    asString(analysis.call_summary_feedback) ||
    asString(analysis.summary) ||
    asString(fields.call_summary_feedback);
  const whenText = [fields.appointment_datetime, summary, transcript].filter(Boolean).join(" \n ");
  const slotIdRaw = pickFirst(fields, ["slot_id", "slotid"]);
  const slotIsId = looksLikeRecordId(slotIdRaw);
  return {
    patientName: pickFirst(fields, ["patient_name", "name", "full_name"]),
    phone: pickFirst(fields, ["phone", "phone_number", "caller_phone"]),
    email: pickFirst(fields, ["email", "patient_email"]),
    doctorId: pickFirst(fields, ["doctor_id", "doctorid"]),
    doctorName: pickFirst(fields, ["doctor_name", "doctor"]),
    slotId: slotIsId ? slotIdRaw.trim() : "",
    reason:
      pickFirst(fields, ["reason", "visit_reason"]) || "Booked via AI voice receptionist",
    whenHint: parseSpokenAppointmentTime(
      [whenText, slotIsId ? "" : slotIdRaw].filter(Boolean).join(" \n "),
    ),
    otp: pickFirst(fields, ["otp", "code", "verification_code", "pin"]),
  };
}
