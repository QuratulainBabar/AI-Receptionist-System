type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {};
}

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
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

  const aliases: Record<string, string[]> = {
    patient_name: ["patient_name", "name", "full_name", "customer_name"],
    phone: ["phone", "phone_number", "customer_phone", "caller_phone"],
    email: ["email", "patient_email"],
    doctor_id: ["doctor_id", "doctorid"],
    doctor_name: ["doctor_name", "doctor"],
    slot_id: ["slot_id", "slotid", "appointment_slot_id"],
    reason: ["reason", "visit_reason", "chief_complaint"],
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
};

export function extractVoiceBookingFields(payload: unknown): VoiceBookingFields {
  const fields = extractSynthflowFields(payload);
  return {
    patientName: pickFirst(fields, ["patient_name", "name", "full_name"]),
    phone: pickFirst(fields, ["phone", "phone_number", "caller_phone"]),
    email: pickFirst(fields, ["email", "patient_email"]),
    doctorId: pickFirst(fields, ["doctor_id", "doctorid"]),
    doctorName: pickFirst(fields, ["doctor_name", "doctor"]),
    slotId: pickFirst(fields, ["slot_id", "slotid"]),
    reason:
      pickFirst(fields, ["reason", "visit_reason"]) || "Booked via AI voice receptionist",
  };
}
