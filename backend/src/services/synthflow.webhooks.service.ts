import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { logPatientActivity, ActivityType } from "./activity.service.js";
import { digitsOnly, normalizePhone } from "../utils/phone.js";
import {
  addCivilDays,
  civilDateKey,
  clinicTimeZone,
  formatClinicDateTime,
  formatClinicTime,
  wallTimeToUtc,
  weekdayNameForCivilDate,
} from "../utils/clinic-time.js";
import { findPatientByPhone } from "./patient-phone.service.js";
import { emptyish, extractSynthflowFields, extractVoiceBookingFields } from "./synthflow-fields.service.js";
import { findActiveAppointmentForMobile, type PublicAppointment } from "./appointments.service.js";
import { processVoiceBooking } from "./voice-booking.service.js";
import { verifyBookingOtp } from "./booking-otp.service.js";
import {
  deliverSmsWithoutCall,
  fetchCallRecordingUrl,
  readRecordsUploadSmsExecution,
} from "./synthflow.client.js";
import {
  createUploadLinkForVoiceBooking,
  markRecordRequestSmsResult,
} from "./record-requests.service.js";
import {
  getLastRecordsUploadLink,
  rememberRecordsUploadLink,
} from "./records-link-mirror.service.js";
import { sendEmail } from "./mailer.service.js";
import {
  clinicDoctorProfileBlock,
  consultationFeeToSpeak,
  formatOpenSlotLabels,
  getClinicDoctor,
  openingDoctorLine,
} from "./clinic-doctor.service.js";
import { generateSlotsFromWeeklyHours } from "./doctor-availability.service.js";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function asString(value: unknown, fallback = "") {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return fallback;
}

function pickString(obj: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = obj[key];
    const str = asString(value).trim();
    // Reject unresolved Synthflow placeholders like "<patient_name>".
    if (str && !emptyish(str)) return str;
  }
  return "";
}

function deepFindString(payload: unknown, keys: string[]): string {
  if (!payload || typeof payload !== "object") return "";
  if (Array.isArray(payload)) {
    for (const item of payload) {
      const found = deepFindString(item, keys);
      if (found) return found;
    }
    return "";
  }
  const record = payload as JsonRecord;
  for (const key of keys) {
    const value = record[key];
    const str = asString(value).trim();
    if (str) return str;
  }
  for (const value of Object.values(record)) {
    const found = deepFindString(value, keys);
    if (found) return found;
  }
  return "";
}

export { findPatientByPhone } from "./patient-phone.service.js";

async function ensureClinicDoctorWithSlots(openSlotsTake: number) {
  let doctor = await getClinicDoctor({ openSlotsTake });
  if (!doctor) return null;
  // Always try to materialize open slots from weekly hours when the calendar is empty
  // so check_doctor_availability can speak real times (not "no open times").
  if (doctor.availability.length === 0) {
    try {
      await generateSlotsFromWeeklyHours(doctor.userId, { weeks: 1, allowEmpty: true });
      doctor = (await getClinicDoctor({ openSlotsTake })) ?? doctor;
    } catch (error) {
      console.warn(
        "[synthflow] Could not auto-generate open slots:",
        error instanceof Error ? error.message : error,
      );
    }
  }
  return doctor;
}

async function buildClinicContext() {
  const doctor = await ensureClinicDoctorWithSlots(16);
  if (!doctor) {
    return {
      clinic_name: "Qubetech AI Receptionist Clinic",
      doctors_available: "0",
      clinic_doctor_name: "",
      clinic_doctor_fee: "",
      opening_doctor_line: "",
      availability_summary: "No open slots. Do not invent a time.",
      booking_instructions:
        "This clinic has one doctor. Speak ONLY dates/times from check_doctor_availability (live database). Never invent a day. When the caller wants to book (e.g. I want to book an appointment), reply IMMEDIATELY with only \"Which day would you like your appointment?\" then WAIT — do not list dates and do not call any action yet. Only if they ask which days are available (or do not know), call check_doctor_availability with date empty and say the message exactly. After they pick a date, call again with that date and say only that day's times from the message. After they pick a time: ask full name, WAIT; ask reason for visit, WAIT; ask phone number, WAIT; say exactly \"Thank you. Let me check whether there is already an active appointment associated with this number.\"; then MUST call check_existing_appointment with that exact phone. If has_active_appointment is true, say the message and do not book or ask for a code. If false, you MUST call book_appointment with a real slot_id before asking for any code. Never ask only for the name. Never say OTP digits aloud. Only after book_appointment succeeds, ask for the six-digit verification code, then call verify_booking_otp. The appointment is not booked until appointment_confirmed is true. After the final appointment summary, ask exactly: Would you like to share your medical records or any relevant files with the doctor? If yes, call offer_records_upload with consent yes, then immediately call send_records_upload_link with the fields from that response on the same call. If no, call offer_records_upload with consent no.",
    };
  }

  const profile = clinicDoctorProfileBlock(doctor);
  const fee = consultationFeeToSpeak(profile.fee);
  const feeSpoken = fee
    ? `${fee}${profile.feeCurrency ? ` ${profile.feeCurrency}` : ""}`.trim()
    : "";
  const openLabels = formatOpenSlotLabels(doctor.availability, {
    withIds: false,
    limit: 16,
  });

  return {
    clinic_name: "Qubetech AI Receptionist Clinic",
    doctors_available: "1",
    clinic_doctor_name: profile.doctorName,
    clinic_doctor_fee: feeSpoken,
    opening_doctor_line: openingDoctorLine(profile.doctorName, feeSpoken || fee),
    availability_summary: openLabels.length
      ? "Do not read this aloud. Speak ONLY check_doctor_availability message: date today = today's open times from the database; date empty = which days this week have open slots; chosen day = that day's times. Never invent a date or time."
      : `${profile.doctorName} has no open slots right now.`,
    booking_instructions:
      "If the caller asks about today's availability, IMMEDIATELY call check_doctor_availability with date today and say the message EXACTLY — do not ask which day first. If they ask about this week / available days / which days the doctor is in, IMMEDIATELY call with date empty and say the message EXACTLY. Never invent dates like October 26. When they want to book without a list request (e.g. I want to book an appointment): reply IMMEDIATELY with only \"Which day would you like your appointment?\", WAIT — do not call any action on that turn — then after they name a day call with that date and say times. After they pick a time: ask full name WAIT; ask \"What is the reason for your visit today?\" WAIT; ask \"What phone number should we use for this booking?\" WAIT; say exactly \"Thank you. Let me check whether there is already an active appointment associated with this number.\"; then MUST call check_existing_appointment with that exact phone. If has_active_appointment is true, say the message and do not book or ask for a code. If false, MUST call book_appointment with a real slot_id — do not ask for a code yet. Never ask only for the name. Only after book_appointment succeeds, ask for the six-digit code and call verify_booking_otp. Never say OTP digits aloud. Confirm only when appointment_confirmed is true. After the final appointment summary, ask exactly in English: Would you like to share your medical records or any relevant files with the doctor? If yes, call offer_records_upload with consent yes and the booking phone, then immediately call send_records_upload_link with doctor_name, appointment_reference, upload_url, and to_phone_number from that response (same call). If no, call offer_records_upload with consent no.",
  };
}

export async function handleInboundWebhook(payload: unknown) {
  const root = asRecord(payload);
  const callInbound = asRecord(root.call_inbound);
  const fromNumber = normalizePhone(
    pickString(callInbound, ["from_number", "fromNumber", "caller"]) ||
      pickString(root, ["from_number", "fromNumber"]),
  );
  const toNumber = normalizePhone(
    pickString(callInbound, ["to_number", "toNumber"]) ||
      pickString(root, ["to_number", "toNumber"]) ||
      env.SYNTHFLOW_PHONE_NUMBER,
  );
  const modelId =
    pickString(callInbound, ["model_id", "modelId"]) ||
    pickString(root, ["model_id", "modelId"]) ||
    env.SYNTHFLOW_AGENT_ID;

  const patient = fromNumber ? await findPatientByPhone(fromNumber) : null;
  const clinic = await buildClinicContext();
  const activeAppointment = await findActiveAppointmentForMobile({
    phone: fromNumber,
    patientId: patient?.id,
  });

  const customVariables: Record<string, string> = {
    ...clinic,
    caller_phone: fromNumber,
    clinic_phone: toNumber,
    patient_found: patient ? "true" : "false",
    patient_id: patient?.id ?? "",
    patient_name: patient?.fullName ?? "",
    patient_email: patient?.email ?? "",
    patient_reference: patient?.reference ?? "",
    // Live DB sync for one-active-appointment rule (Pending/Confirmed).
    active_appointment_found: activeAppointment ? "true" : "false",
    active_appointment_reference: activeAppointment?.reference ?? "",
    active_appointment_status: activeAppointment?.status ?? "",
    active_appointment_doctor: activeAppointment?.doctorName ?? "",
    active_appointment_when: activeAppointment
      ? `${activeAppointment.date} at ${activeAppointment.time}`
      : "",
    active_appointment_summary: activeAppointment?.spokenSummary ?? "",
    active_appointment_block_message: activeAppointment?.blockMessage ?? "",
  };

  const callId =
    pickString(callInbound, ["call_id", "callId", "id"]) ||
    pickString(root, ["call_id", "callId"]);

  const metadata = {
    source: "ai-receptionist-backend",
    patient_id: patient?.id ?? null,
    from_number: fromNumber,
    to_number: toNumber,
    call_id: callId || null,
  };

  const voiceCallData = {
    direction: "INBOUND" as const,
    status: "RINGING" as const,
    fromNumber,
    toNumber,
    callerName: patient?.fullName ?? "",
    patientId: patient?.id ?? null,
    modelId,
    metadata: metadata as Prisma.InputJsonValue,
    rawPayload: root as Prisma.InputJsonValue,
    startedAt: new Date(),
  };

  if (callId) {
    await prisma.voiceCall.upsert({
      where: { synthflowCallId: callId },
      create: { ...voiceCallData, synthflowCallId: callId },
      update: voiceCallData,
    });
  } else {
    await prisma.voiceCall.create({ data: voiceCallData });
  }

  if (patient) {
    await logPatientActivity({
      userId: patient.id,
      type: "voice_call_inbound",
      label: "AI receptionist call",
      detail: `Inbound call from ${fromNumber || "unknown number"} connected to clinic AI agent`,
      relatedId: fromNumber || undefined,
    }).catch(() => undefined);
  }

  // Keep the phone-attached agent (empty override) and inject patient/clinic context.
  return {
    call_inbound: {
      override_agent_id: "",
      override_model_id: "",
      custom_variables: customVariables,
      metadata,
    },
  };
}

function extractCallBlock(payload: unknown) {
  const root = asRecord(payload);
  const call = asRecord(root.call);
  return { root, call };
}

function extractExecutedValues(payload: unknown) {
  const root = asRecord(payload);
  const executed = asRecord(root.executed_actions);
  const values: Record<string, string> = {};

  for (const [actionName, actionValue] of Object.entries(executed)) {
    const action = asRecord(actionValue);
    const returned = asRecord(action.return_value);
    for (const [key, value] of Object.entries(returned)) {
      const str = asString(value).trim();
      if (str) values[key.toLowerCase()] = str;
    }
    const fromLlm = asRecord(action.parameters_from_llm);
    for (const [key, value] of Object.entries(fromLlm)) {
      const str = asString(value).trim();
      if (str) values[key.toLowerCase()] = str;
    }
    // Also map common aliases from action name
    const actionKey = actionName.toLowerCase();
    if (returned && Object.keys(returned).length === 1) {
      const only = asString(Object.values(returned)[0]).trim();
      if (only) values[actionKey] = only;
    }
  }

  return values;
}

async function maybeBookFromDataWebhook(
  _payload: unknown,
  _context: { fromNumber: string; patientId: string | null; callId: string },
): Promise<PublicAppointment | null> {
  // The live call sends the OTP and confirms only after verify_booking_otp.
  // Post-call payloads must not confirm the visit or text another code.
  return null;
}

/**
 * After a booking call ends, if Synthflow ran `send_records_upload_link` (INCALL_SMS)
 * without error, mark the matching record request as SMS-delivered.
 * Terminal DEBUG PREVIEW alone never counts as delivery.
 */
async function maybeMarkRecordsUploadSmsFromCall(payload: unknown) {
  const execution = readRecordsUploadSmsExecution(payload);
  if (!execution.ran) return;

  const last = getLastRecordsUploadLink();
  const toPhone = normalizePhone(execution.toPhone) || normalizePhone(last?.phone || "");
  const reference = last?.appointmentReference || "";

  if (execution.error) {
    console.warn(
      `[synthflow] records INCALL SMS failed action=${execution.actionName} phone=${toPhone || "(none)"}: ${execution.error}`,
    );
    if (last?.id && reference) {
      const row = await prisma.recordRequest.findFirst({
        where: {
          appointment: { reference: { equals: reference, mode: "insensitive" } },
        },
        orderBy: { createdAt: "desc" },
      });
      if (row) {
        await markRecordRequestSmsResult({
          requestId: row.id,
          smsSent: false,
          smsError: execution.error,
        }).catch(() => undefined);
      }
    }
    return;
  }

  console.log(
    `[synthflow] records INCALL SMS verified action=${execution.actionName} phone=${toPhone || "(none)"} ref=${reference || "(none)"}`,
  );

  const row = reference
    ? await prisma.recordRequest.findFirst({
        where: {
          appointment: { reference: { equals: reference, mode: "insensitive" } },
        },
        orderBy: { createdAt: "desc" },
      })
    : toPhone
      ? await prisma.recordRequest.findFirst({
          where: { phone: toPhone },
          orderBy: { createdAt: "desc" },
        })
      : null;

  if (row) {
    await markRecordRequestSmsResult({
      requestId: row.id,
      smsSent: true,
    }).catch(() => undefined);
  }
}

export async function handleDataWebhook(payload: unknown) {
  const { root, call } = extractCallBlock(payload);
  const callId =
    pickString(call, ["call_id", "callId", "id"]) ||
    pickString(root, ["call_id", "callId"]) ||
    deepFindString(payload, ["call_id", "callId"]);
  const extracted = extractSynthflowFields(payload);
  const bookingFields = extractVoiceBookingFields(payload);
  const lead = asRecord(root.lead);
  const fromNumber = normalizePhone(
    pickString(call, ["phone_number_from", "from_number", "fromNumber"]) ||
      pickString(lead, ["phone_number", "phone"]) ||
      bookingFields.phone ||
      deepFindString(payload, ["phone_number_from", "from_number"]),
  );
  const toNumber = normalizePhone(
    pickString(call, ["phone_number_to", "to_number", "toNumber"]) ||
      env.SYNTHFLOW_PHONE_NUMBER,
  );
  const transcript = pickString(call, ["transcript"]) || pickString(root, ["transcript"]);
  let recordingUrl =
    pickString(call, ["recording_url", "recordingUrl", "recording"]) ||
    pickString(root, ["recording_url", "recordingUrl", "recording"]) ||
    deepFindString(payload, ["recording_url", "recordingUrl"]) ||
    null;
  if (recordingUrl && !/^https?:\/\//i.test(recordingUrl)) {
    recordingUrl = null;
  }
  // Some post-call webhooks omit recording_url initially — pull from Synthflow Calls API.
  if (!recordingUrl && callId) {
    try {
      recordingUrl = (await fetchCallRecordingUrl(callId)) || null;
    } catch {
      // keep webhook flow resilient if Synthflow lookup fails
    }
  }
  const endCallReason =
    pickString(call, ["end_call_reason", "endCallReason"]) ||
    pickString(root, ["end_call_reason"]);
  const modelId =
    pickString(call, ["model_id", "modelId"]) ||
    pickString(root, ["model_id"]) ||
    env.SYNTHFLOW_AGENT_ID;
  const durationRaw =
    call.duration ?? root.duration ?? deepFindString(payload, ["duration"]);
  const durationSeconds =
    typeof durationRaw === "number"
      ? durationRaw
      : Number.parseInt(asString(durationRaw), 10) || null;
  const statusRaw = (
    pickString(call, ["status"]) ||
    pickString(root, ["status"]) ||
    "completed"
  ).toLowerCase();
  const status =
    statusRaw.includes("fail") || statusRaw.includes("error")
      ? "FAILED"
      : statusRaw.includes("cancel")
        ? "CANCELLED"
        : "COMPLETED";

  const analysis = asRecord(root.analysis);
  const summary =
    pickString(analysis, ["call_summary_feedback", "summary", "call_summary"]) ||
    (transcript ? transcript.slice(0, 500) : "");

  const callerNameFromPayload =
    bookingFields.patientName ||
    pickString(lead, ["name", "full_name", "patient_name", "caller_name"]) ||
    pickFirstFromExtracted(extracted, ["patient_name", "name", "full_name", "customer_name"]);

  let patient = fromNumber ? await findPatientByPhone(fromNumber) : null;
  const metadataPatientId = deepFindString(payload, ["patient_id", "patientId"]);
  if (!patient && metadataPatientId) {
    patient = await prisma.user.findFirst({
      where: { id: metadataPatientId, role: "PATIENT", isActive: true },
    });
  }

  const booked = await maybeBookFromDataWebhook(payload, {
    fromNumber,
    patientId: patient?.id ?? null,
    callId: callId || "",
  });

  if (booked && !patient) {
    patient = await prisma.user.findUnique({ where: { id: booked.patientId } });
  }

  const existing = callId
    ? await prisma.voiceCall.findUnique({ where: { synthflowCallId: callId } })
    : null;

  const callerName =
    (!emptyish(callerNameFromPayload) ? callerNameFromPayload.trim() : "") ||
    patient?.fullName ||
    existing?.callerName ||
    "";

  const data = {
    synthflowCallId: callId || existing?.synthflowCallId || null,
    direction: "INBOUND" as const,
    status: status as "COMPLETED" | "FAILED" | "CANCELLED",
    fromNumber: fromNumber || existing?.fromNumber || "",
    toNumber: toNumber || existing?.toNumber || "",
    callerName,
    patientId: patient?.id ?? booked?.patientId ?? existing?.patientId ?? null,
    doctorUserId: booked?.doctorId ?? existing?.doctorUserId ?? null,
    appointmentId: booked?.id ?? existing?.appointmentId ?? null,
    modelId: modelId || existing?.modelId || "",
    transcript: transcript || existing?.transcript || "",
    recordingUrl: recordingUrl || existing?.recordingUrl || null,
    durationSeconds: durationSeconds ?? existing?.durationSeconds ?? null,
    endCallReason: endCallReason || existing?.endCallReason || "",
    summary: summary || existing?.summary || "",
    metadata: {
      status: statusRaw,
      lead: root.lead ?? null,
      analysis: root.analysis ?? null,
      extracted,
      booking: {
        patient_name: bookingFields.patientName || null,
        phone: bookingFields.phone || null,
        email: bookingFields.email || null,
        doctor_id: bookingFields.doctorId || null,
        doctor_name: bookingFields.doctorName || null,
        slot_id: bookingFields.slotId || null,
        reason: bookingFields.reason || null,
        appointment_booked: Boolean(booked),
        appointment_reference: booked?.reference ?? null,
      },
    } as Prisma.InputJsonValue,
    rawPayload: root as Prisma.InputJsonValue,
    endedAt: new Date(),
  };

  const voiceCall = existing
    ? await prisma.voiceCall.update({
        where: { id: existing.id },
        data,
      })
    : await prisma.voiceCall.create({
        data: {
          ...data,
          startedAt: new Date(),
        },
      });

  if (patient) {
    await logPatientActivity({
      userId: patient.id,
      type: booked ? ActivityType.APPOINTMENT_BOOKED : ActivityType.VISIT_COMPLETED,
      label: booked ? "AI phone booking completed" : "AI voice call completed",
      detail: booked
        ? `Call booked ${booked.reference} (${durationSeconds ?? 0}s)`
        : summary || `Call with clinic AI receptionist (${durationSeconds ?? 0}s)`,
      relatedId: voiceCall.id,
    }).catch(() => undefined);
  }

  // Verify live-call INCALL_SMS delivery for records upload (preview alone is not success).
  await maybeMarkRecordsUploadSmsFromCall(payload).catch((error) => {
    console.warn(
      "[synthflow] records SMS delivery check failed:",
      error instanceof Error ? error.message : error,
    );
  });

  return {
    ok: true,
    voiceCallId: voiceCall.id,
    appointmentId: booked?.id ?? existing?.appointmentId ?? null,
    appointmentReference: booked?.reference ?? null,
  };
}

function speakList(labels: string[], singular: string, plural: string, ask: string) {
  if (labels.length === 0) return `There are no ${plural} right now.`;
  if (labels.length === 1) return `The ${singular} is ${labels[0]}. ${ask}`;
  const head = labels.slice(0, -1).join(", ");
  const last = labels[labels.length - 1];
  return `The ${plural} are ${head}, and ${last}. ${ask}`;
}

function speakOpenDates(labels: string[]) {
  return speakList(labels, "open date", "open dates this week", "Which date would you like?");
}

function speakOpenSlots(labels: string[]) {
  return speakList(labels, "open time", "open times that day", "Which time would you like?");
}

function pickFirstFromExtracted(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields[key];
    if (value && !emptyish(value)) return value.trim();
  }
  return "";
}

const WEEKDAY_ALIASES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/**
 * Remaining days of the current clinic calendar week (Monday–Sunday), inclusive.
 * Never includes next week — e.g. on Thursday, Monday resolves only if it is still this week.
 */
function remainingCalendarWeekKeys(now = new Date()): string[] {
  const todayKey = civilDateKey(now);
  const weekday = weekdayNameForCivilDate(todayKey).toLowerCase();
  const dow = WEEKDAY_ALIASES[weekday] ?? 0;
  const daysFromMonday = (dow + 6) % 7;
  const weekEnd = addCivilDays(todayKey, 6 - daysFromMonday);
  const keys: string[] = [];
  for (let key = todayKey; key <= weekEnd; key = addCivilDays(key, 1)) {
    keys.push(key);
  }
  return keys;
}

/** Resolve a spoken/typed date to YYYY-MM-DD in the clinic zone (remaining Mon–Sun week only). */
function resolveAvailabilityDateKey(raw: string, now = new Date()): string | null {
  const text = raw.toLowerCase().trim();
  if (!text || emptyish(text) || text === "none" || text === "null") return null;
  // Weekly / schedule questions → list open dates (not a single day).
  if (
    /\b(week|weekly|schedule|this week|next week|available days|open days|which days)\b/.test(text)
  ) {
    return null;
  }

  const weekKeys = remainingCalendarWeekKeys(now);
  const todayKey = weekKeys[0]!;
  const weekEnd = weekKeys[weekKeys.length - 1]!;

  if (/\btoday\b/.test(text)) return todayKey;
  if (/\btomorrow\b/.test(text)) {
    const tomorrow = addCivilDays(todayKey, 1);
    return tomorrow <= weekEnd ? tomorrow : null;
  }

  const iso = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const key = `${iso[1]}-${iso[2]}-${iso[3]}`;
    if (key >= todayKey && key <= weekEnd) return key;
  }

  // "October 14", "Oct 14", "14 October"
  const monthNames = [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ];
  const monthShort = monthNames.map((name) => name.slice(0, 3));
  const monthDay =
    text.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/,
    ) ||
    text.match(
      /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\b/,
    );
  if (monthDay) {
    const a = monthDay[1]!;
    const b = monthDay[2]!;
    const monthToken = /^\d+$/.test(a) ? b : a;
    const dayNum = Number(/^\d+$/.test(a) ? a : b);
    const monthIdx =
      monthNames.findIndex((name) => name.startsWith(monthToken.slice(0, 3))) >= 0
        ? monthNames.findIndex((name) => name.startsWith(monthToken.slice(0, 3)))
        : monthShort.indexOf(monthToken.slice(0, 3));
    if (monthIdx >= 0 && dayNum >= 1 && dayNum <= 31) {
      for (const key of weekKeys) {
        const [, m, d] = key.split("-").map(Number);
        if (m === monthIdx + 1 && d === dayNum) return key;
      }
    }
  }

  for (const [alias, wantDow] of Object.entries(WEEKDAY_ALIASES)) {
    if (!new RegExp(`\\b${alias}\\b`).test(text)) continue;
    for (const key of weekKeys) {
      const weekday = weekdayNameForCivilDate(key).toLowerCase();
      if (WEEKDAY_ALIASES[weekday] === wantDow) return key;
    }
  }

  return null;
}

/** Voice-friendly date: "Monday, October 19" (full names, no year, no Oct shorthand). */
function speakableDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const noon = wallTimeToUtc({
    year: year!,
    month: month!,
    day: day!,
    hour: 12,
    minute: 0,
  });
  return noon.toLocaleDateString("en-US", {
    timeZone: clinicTimeZone(),
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** Prefer "today" / "tomorrow" in clinic timezone so the agent does not say the calendar date. */
function relativeSpeakableDateLabel(dateKey: string, now = new Date()) {
  const todayKey = civilDateKey(now);
  if (dateKey === todayKey) return "today";
  if (dateKey === addCivilDays(todayKey, 1)) return "tomorrow";
  return speakableDateLabel(dateKey);
}

/** Opening phrase for slot lists: "Today, the open times…" / "On Monday, October 19, …" */
function speakableDayOpener(dateKey: string, now = new Date()) {
  const todayKey = civilDateKey(now);
  if (dateKey === todayKey) return "Today";
  if (dateKey === addCivilDays(todayKey, 1)) return "Tomorrow";
  return `On ${speakableDateLabel(dateKey)}`;
}

function slotsWithinWeek(slots: Array<{ id: string; startsAt: Date }>, now = new Date()) {
  // Current calendar week only (Mon–Sun): remaining open slots from today through Sunday.
  const weekKeys = remainingCalendarWeekKeys(now);
  const todayKey = weekKeys[0]!;
  const weekEnd = weekKeys[weekKeys.length - 1]!;
  return slots.filter((slot) => {
    const key = civilDateKey(slot.startsAt);
    return key >= todayKey && key <= weekEnd;
  });
}

export async function handleAvailabilityAction(body: unknown) {
  const root = asRecord(body);
  const extracted = extractSynthflowFields(body);
  const requestedDateRaw =
    pickString(root, ["date", "requested_date", "appointment_date", "day"]) ||
    pickFirstFromExtracted(extracted, [
      "date",
      "requested_date",
      "appointment_date",
      "day",
    ]);

  // Pull enough open slots to cover one clinic week (many slots/day can fill a small take).
  const doctor = await ensureClinicDoctorWithSlots(200);
  if (!doctor) {
    const spoken =
      "The clinic doctor profile is not set up yet. Ask the caller to try again later.";
    return {
      success: true,
      mode: "none",
      spoken_summary: spoken,
      // Synthflow speaks `message` after custom actions — keep spoken_summary as alias.
      message: spoken,
      doctors: [],
      dates: [],
      slots: [],
    };
  }

  const profile = clinicDoctorProfileBlock(doctor);
  const weekSlots = slotsWithinWeek(doctor.availability);

  const dateKey = resolveAvailabilityDateKey(requestedDateRaw);
  if (!dateKey) {
    const byDate = new Map<string, number>();
    for (const slot of weekSlots) {
      const key = civilDateKey(slot.startsAt);
      byDate.set(key, (byDate.get(key) || 0) + 1);
    }
    const dates = [...byDate.keys()].sort().map((key) => ({
      date: key,
      label: relativeSpeakableDateLabel(key),
      open_count: byDate.get(key) || 0,
    }));
    const dateLabels = dates.map((row) => row.label);
    let spoken_summary: string;
    if (dateLabels.length === 0) {
      spoken_summary = "There are no open dates this week.";
    } else if (dateLabels.length === 1) {
      spoken_summary = `This week, the open date is ${dateLabels[0]}. Which date would you like?`;
    } else {
      const head = dateLabels.slice(0, -1).join(", ");
      const last = dateLabels[dateLabels.length - 1];
      spoken_summary = `This week, the open dates are ${head}, and ${last}. Which date would you like?`;
    }

    return {
      success: true,
      mode: "dates",
      week_only: true,
      spoken_summary,
      message: spoken_summary,
      doctor_id: profile.doctorId,
      doctor_name: profile.doctorName,
      dates,
      slots: [],
    };
  }

  const daySlots = weekSlots.filter((slot) => civilDateKey(slot.startsAt) === dateKey);
  const slots = daySlots.map((slot) => ({
    slot_id: slot.id,
    label: formatClinicTime(slot.startsAt),
    datetime_label: formatClinicDateTime(slot.startsAt),
    date: dateKey,
  }));
  const dayLabel = relativeSpeakableDateLabel(dateKey);
  const dayOpener = speakableDayOpener(dateKey);
  const timeLabels = slots.map((slot) => slot.label);
  const todayKey = civilDateKey(new Date());
  let spoken_summary: string;
  if (timeLabels.length === 0) {
    const nextSlot = weekSlots.find((slot) => civilDateKey(slot.startsAt) > dateKey);
    if (dateKey === todayKey && nextSlot) {
      const nextKey = civilDateKey(nextSlot.startsAt);
      const nextTimes = weekSlots
        .filter((slot) => civilDateKey(slot.startsAt) === nextKey)
        .map((slot) => formatClinicTime(slot.startsAt));
      const nextLabel = relativeSpeakableDateLabel(nextKey);
      const timesSpoken =
        nextTimes.length === 1
          ? `an open time at ${nextTimes[0]}`
          : `open times ${nextTimes.slice(0, -1).join(", ")}, and ${nextTimes[nextTimes.length - 1]}`;
      spoken_summary = `There are no remaining open times today. The next open day is ${nextLabel}, with ${timesSpoken}. Which time would you like, or would you prefer another day this week?`;
    } else if (dateKey === todayKey) {
      spoken_summary =
        "There are no remaining open times today. Please choose another date this week.";
    } else {
      spoken_summary = `There are no open times ${dayLabel === "tomorrow" ? "tomorrow" : `on ${speakableDateLabel(dateKey)}`}. Please choose another date this week.`;
    }
  } else if (timeLabels.length === 1) {
    spoken_summary = `${dayOpener}, the open time is ${timeLabels[0]}. Which time would you like?`;
  } else {
    const head = timeLabels.slice(0, -1).join(", ");
    const last = timeLabels[timeLabels.length - 1];
    spoken_summary = `${dayOpener}, the open times are ${head}, and ${last}. Which time would you like?`;
  }

  return {
    success: true,
    mode: "slots",
    spoken_summary,
    message: spoken_summary,
    doctor_id: profile.doctorId,
    doctor_name: profile.doctorName,
    date: dateKey,
    date_label: dayLabel,
    dates: [],
    slots,
  };
}

/**
 * Prompt block with today's open times and this week's schedule, read from the
 * local database at dial time. Uses handleAvailabilityAction so the wording
 * matches exactly what check_doctor_availability would say mid-call.
 * `toolsOnline` false = the public tunnel is down, so the agent must answer
 * from this snapshot instead of calling the (unreachable) action.
 */
export async function buildLiveAvailabilityPromptBlock(options: { toolsOnline: boolean }) {
  const now = new Date();
  const today = await handleAvailabilityAction({ date: "today" });
  const week = await handleAvailabilityAction({ date: "" });

  const dayLines: string[] = [];
  for (const row of week.dates) {
    const day = await handleAvailabilityAction({ date: row.date });
    const times = day.slots.map((slot) => `${slot.label} [slot:${slot.slot_id}]`).join(", ");
    dayLines.push(`- ${speakableDateLabel(row.date)} (${row.date}): ${times || "none"}`);
  }

  const asOf = `${formatClinicDateTime(now)} (${clinicTimeZone()})`;
  return [
    "## Live availability snapshot (Doctor Dashboard database)",
    `Read at ${asOf}. Today is ${speakableDateLabel(civilDateKey(now))}.`,
    options.toolsOnline
      ? "Call check_doctor_availability as usual. If it fails or errors, answer from this snapshot instead of saying you could not load times."
      : "check_doctor_availability is OFFLINE on this call. Do NOT call it. Answer availability ONLY from this snapshot. Booking tools are also offline: if the caller wants to book, say booking is unavailable on this test line right now.",
    `- Today's availability → say exactly: "${today.message}"`,
    `- This week / which days → say exactly: "${week.message}"`,
    "- Open times per day this week (slot ids are INTERNAL — never read them aloud):",
    ...(dayLines.length ? dayLines : ["- none"]),
    "Never mention any date or time that is not listed here or returned by check_doctor_availability.",
  ].join("\n");
}

export async function handleCheckAppointmentAction(body: unknown) {
  const root = asRecord(body);
  const fields = extractVoiceBookingFields(body);
  const spokenPhone = normalizePhone(
    pickString(root, ["phone", "phone_number"]) || fields.phone,
  );
  const callerPhone = normalizePhone(
    pickString(root, ["caller_phone", "user_phone_number", "from_number"]) || "",
  );
  // Prefer the contact number the caller gave for booking; fall back to the inbound line.
  const phone = spokenPhone || callerPhone;

  if (!phone) {
    return {
      success: true,
      has_active_appointment: false,
      can_book: false,
      message: "Please repeat the phone number so I can check existing appointments.",
    };
  }

  console.log(
    `[synthflow] check_existing_appointment phone=${phone} spoken=${spokenPhone || "(none)"} caller=${callerPhone || "(none)"}`,
  );

  const active = await findActiveAppointmentForMobile({ phone, ignoreOpenOtpHolds: true });
  if (active) {
    console.log(
      `[synthflow] check_existing_appointment BLOCK phone=${phone} ref=${active.reference} status=${active.status}`,
    );
    return {
      success: true,
      has_active_appointment: true,
      can_book: false,
      new_appointment_booked: false,
      reference: active.reference,
      status: active.status,
      doctor: active.doctorName,
      when: `${active.date} at ${active.time}`,
      message:
        "It looks like you already have an active appointment associated with this number. Please complete your existing appointment before booking another one.",
    };
  }

  console.log(`[synthflow] check_existing_appointment CLEAR phone=${phone} (no Pending/Confirmed)`);
  return {
    success: true,
    has_active_appointment: false,
    can_book: true,
    next_action: "book_appointment",
    message:
      "This number has no Pending or Confirmed appointment. Completed or Cancelled visits do not block booking. Next call book_appointment with doctor_id, slot_id, patient_name, phone, and reason. Do not ask for a verification code until book_appointment succeeds.",
  };
}

export async function handleBookAction(body: unknown) {
  const root = asRecord(body);
  const fields = extractVoiceBookingFields(body);
  const doctorId = pickString(root, ["doctor_id", "doctorId"]) || fields.doctorId;
  const doctorName =
    pickString(root, ["doctor_name", "doctorName", "doctor"]) || fields.doctorName;
  const slotId = pickString(root, ["slot_id", "slotId"]) || fields.slotId;
  const reason =
    pickString(root, ["reason", "visit_reason"]) || fields.reason || "Booked via AI voice receptionist";
  const spokenPhone = normalizePhone(pickString(root, ["phone", "phone_number"]) || fields.phone);
  const callerPhone = normalizePhone(pickString(root, ["caller_phone", "user_phone_number"]) || "");
  // Prefer the booking number the caller said; fall back to the inbound caller line.
  const phone = spokenPhone || callerPhone;
  const smsTo = phone;
  const patientId = pickString(root, ["patient_id", "patientId"]);
  const patientName =
    pickString(root, ["patient_name", "full_name", "name"]) || fields.patientName;
  const email = pickString(root, ["email"]) || fields.email;
  const callId = pickString(root, ["call_id", "callId"]);

  let booked: Awaited<ReturnType<typeof processVoiceBooking>>;
  try {
    booked = await processVoiceBooking({
      patientId: patientId || undefined,
      phone,
      patientName,
      email,
      doctorId,
      doctorName,
      slotId,
      reason,
      whenHint: fields.whenHint,
      allowRegister: true,
      synthflowCallId: callId || undefined,
    });
  } catch (error) {
    if (error instanceof AppError) {
      return {
        success: false,
        message: error.message,
      };
    }
    throw error;
  }

  if (!booked) {
    return {
      success: false,
      message:
        "Could not complete booking. Need phone (or patient_id), doctor_id, slot_id, and patient name for new callers.",
    };
  }

  const { appointment, patient } = booked;

  if (booked.alreadyConfirmed) {
    return {
      success: true,
      otp_required: false,
      appointment_confirmed: true,
      message: `Appointment ${appointment.reference} is already confirmed with ${appointment.doctorName} on ${appointment.date} at ${appointment.time}.`,
      patient_id: patient.id,
      patient_reference: patient.reference,
    };
  }

  if (callId) {
    await prisma.voiceCall
      .upsert({
        where: { synthflowCallId: callId },
        create: {
          synthflowCallId: callId,
          direction: "INBOUND",
          status: "IN_PROGRESS",
          fromNumber: phone,
          callerName: patient.fullName || patientName || "",
          patientId: patient.id,
          doctorUserId: appointment.doctorId,
          appointmentId: appointment.id,
          modelId: env.SYNTHFLOW_AGENT_ID,
          summary: `OTP pending for ${appointment.reference}; not confirmed`,
          startedAt: new Date(),
        },
        update: {
          callerName: patient.fullName || patientName || undefined,
          patientId: patient.id,
          doctorUserId: appointment.doctorId,
          appointmentId: appointment.id,
          summary: `OTP pending for ${appointment.reference}; not confirmed`,
        },
      })
      .catch(() => undefined);
  }

  console.log(
    `[synthflow] book_appointment held ref=${appointment.reference} phone=${phone} slot=${slotId || "(resolved)"} otp_required=true`,
  );

  return {
    success: true,
    otp_required: true,
    appointment_booked: false,
    appointment_confirmed: false,
    // Never return the OTP digits to the voice agent — it will speak them.
    expires_seconds: booked.expiresSeconds,
    to_phone_number: smsTo,
    reference: appointment.reference,
    doctor: appointment.doctorName,
    date: appointment.date,
    time: appointment.time,
    message:
      "The appointment is not booked yet. Do not say any code digits aloud to the caller. Ask them to say the six-digit verification code, WAIT, then IMMEDIATELY call verify_booking_otp with the booking phone and otp set to the digits they spoke (testing code 123456). Do not say you did not catch the code before calling verify_booking_otp. Confirm only when appointment_confirmed is true.",
    patient_id: patient.id,
    patient_reference: patient.reference,
  };
}

export async function handleVerifyOtpAction(body: unknown) {
  const root = asRecord(body);
  const fields = extractVoiceBookingFields(body);
  const phone = normalizePhone(
    pickString(root, ["phone", "phone_number"]) || fields.phone,
  );
  const callerPhone = normalizePhone(
    pickString(root, ["caller_phone", "user_phone_number", "from_number"]) || "",
  );
  const otp = pickString(root, ["otp", "code", "verification_code", "pin"]) || fields.otp;

  console.log(
    `[synthflow] verify_booking_otp phone=${phone || "(none)"} caller=${callerPhone || "(none)"} otp_raw=${JSON.stringify(otp)}`,
  );

  try {
    return await verifyBookingOtp({ phone, otp, callerPhone });
  } catch (error) {
    if (error instanceof AppError) {
      return {
        success: false,
        appointment_confirmed: false,
        message: error.message,
      };
    }
    throw error;
  }
}

const SPOKEN_DIGIT: Record<string, string> = {
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
};

/** Turn "nine two three…" or mixed text into digit characters. */
function spokenWordsToDigits(value: string) {
  const raw = value.trim().toLowerCase();
  if (!raw) return "";
  if (/\d/.test(raw)) return digitsOnly(raw);
  const parts = raw.split(/[^a-z]+/).filter(Boolean);
  let out = "";
  for (const part of parts) {
    if (SPOKEN_DIGIT[part] != null) out += SPOKEN_DIGIT[part];
  }
  return out;
}

function coercePhoneCandidate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const direct = normalizePhone(trimmed);
  if (direct && digitsOnly(direct).length >= 10) return direct;
  const fromSpoken = normalizePhone(spokenWordsToDigits(trimmed));
  if (fromSpoken && digitsOnly(fromSpoken).length >= 10) return fromSpoken;
  const loose = digitsOnly(trimmed);
  if (loose.length >= 10) return normalizePhone(loose);
  return "";
}

function collectPhoneCandidates(body: unknown): string[] {
  const root = asRecord(body);
  const fields = extractVoiceBookingFields(body);
  const custom = asRecord(root.custom_variables || root.customVariables);
  const keys = [
    "phone",
    "to_phone",
    "to_phone_number",
    "mobile",
    "contact_phone",
    "phone_number",
    "caller_phone",
    "user_phone_number",
    "fallback_phone",
    "from_number",
    "to",
  ];
  const out: string[] = [];
  for (const key of keys) {
    const fromRoot = pickString(root, [key]);
    if (fromRoot) out.push(fromRoot);
    const fromCustom = asString(custom[key]).trim();
    if (fromCustom) out.push(fromCustom);
  }
  if (fields.phone) out.push(fields.phone);
  // Synthflow sometimes nests values under parameters / variables.
  for (const nestKey of ["parameters", "variables", "args", "input"]) {
    const nest = asRecord(root[nestKey]);
    for (const key of keys) {
      const value = pickString(nest, [key]);
      if (value) out.push(value);
    }
  }
  // Last resort: any 10+ digit run in the raw payload.
  try {
    const blob = JSON.stringify(body);
    const matches = blob.match(/\+?\d[\d\s().-]{8,}\d/g) || [];
    out.push(...matches);
  } catch {
    // ignore
  }
  return out;
}

function parseRecordsConsent(raw: string): "yes" | "no" | "" {
  const text = raw.trim().toLowerCase().replace(/[^\w\s]/g, " ");
  if (!text) return "";
  if (
    /\b(no|nope|nah|decline|don'?t|do not|not really|no thanks|no thank you)\b/.test(text)
  ) {
    return "no";
  }
  if (
    /\b(yes|yeah|yep|yup|sure|ok|okay|please|affirmative|of course|go ahead|i would|i'?d like|send|share)\b/.test(
      text,
    )
  ) {
    return "yes";
  }
  if (text === "y") return "yes";
  if (text === "n") return "no";
  return "";
}

function extractAppointmentReference(body: unknown, fallback = "") {
  const root = asRecord(body);
  const custom = asRecord(root.custom_variables || root.customVariables);
  const direct =
    pickString(root, ["appointment_reference", "reference", "appointment"]) ||
    asString(custom.appointment_reference).trim() ||
    fallback.trim();
  const fromDirect = direct.match(/APT-?\s*([0-9]{3,6})/i);
  if (fromDirect?.[1]) return `APT-${fromDirect[1]}`;
  if (/^APT-\d+/i.test(direct)) return direct.toUpperCase().replace(/\s+/g, "");
  try {
    const blob = JSON.stringify(body);
    const fromBlob = blob.match(/APT-?\s*([0-9]{3,6})/i);
    if (fromBlob?.[1]) return `APT-${fromBlob[1]}`;
  } catch {
    // ignore
  }
  return "";
}

/**
 * After OTP confirmation summary: log the caller's yes/no, and if yes mint + SMS
 * an upload link to the booking phone. Does not change appointment confirmation.
 */
export async function handleOfferRecordsUploadAction(body: unknown) {
  const root = asRecord(body);
  const bookingFields = extractVoiceBookingFields(body);
  const custom = asRecord(root.custom_variables || root.customVariables);

  let phone = "";
  for (const candidate of collectPhoneCandidates(body)) {
    phone = coercePhoneCandidate(candidate);
    if (phone) break;
  }
  if (!phone) {
    phone = coercePhoneCandidate(
      bookingFields.phone || asString(custom.caller_phone) || asString(custom.phone),
    );
  }

  const consentRaw =
    pickString(root, ["consent", "answer", "response", "records_consent", "choice"]) ||
    asString(custom.consent).trim() ||
    asString(custom.records_consent).trim();
  let consent = parseRecordsConsent(consentRaw);
  // Agent is instructed to call this only after yes/no. Missing consent usually means
  // Synthflow omitted the field after the caller already agreed — default to yes.
  if (!consent) {
    try {
      consent = parseRecordsConsent(JSON.stringify(body)) || "yes";
    } catch {
      consent = "yes";
    }
  }

  const appointmentReference = extractAppointmentReference(body);

  // Email comes from the live LLM (offer_records_upload.email); info_extractor_email's
  // `email` identifier is accepted too when Synthflow includes extracted fields.
  const email = normalizeSpokenEmail(
    pickString(root, ["email", "patient_email", "records_email"]) ||
      asString(custom.email).trim() ||
      pickFirstFromExtracted(extractSynthflowFields(body), ["email"]),
  );
  const emailConfirmedRaw =
    pickString(root, ["email_confirmed", "emailConfirmed"]) ||
    asString(custom.email_confirmed).trim();
  const emailConfirmed =
    /^true$/i.test(emailConfirmedRaw) || parseRecordsConsent(emailConfirmedRaw) === "yes";

  console.log(
    `[synthflow] records-offer response consent_raw="${consentRaw}" consent=${consent} email=${email || "(none)"} email_confirmed=${emailConfirmed} phone=${phone || "(none)"} ref=${appointmentReference || "(none)"}`,
  );

  if (consent === "no") {
    console.log(`[synthflow] records-offer declined phone=${phone || "(none)"}`);
    return {
      success: true,
      records_consent: "no",
      records_sms_sent: false,
      message:
        "No problem. Your appointment is already confirmed. Is there anything else I can help you with?",
    };
  }

  // Consent yes: the link goes by email only, after the caller confirms the address.
  // Never fall back to SMS here.
  if (!email) {
    return {
      success: false,
      records_consent: "yes",
      records_email_sent: false,
      next_action: "ask_email",
      message: "What email address should we use to share your medical records upload link?",
    };
  }
  if (!emailConfirmed) {
    return {
      success: false,
      records_consent: "yes",
      records_email_sent: false,
      email,
      next_action: "confirm_email",
      message: `I have ${spokenEmail(email)}. Is that email address correct?`,
    };
  }

  if (!phone && !appointmentReference) {
    console.warn("[synthflow] records-offer yes but missing booking phone and reference");
    return {
      success: false,
      records_consent: "yes",
      records_email_sent: false,
      message:
        "Please say the mobile number from your booking so I can find your appointment for the upload link.",
    };
  }

  try {
    const link = await createUploadLinkForVoiceBooking({
      phone: phone || undefined,
      appointmentReference: appointmentReference || undefined,
    });

    const cleanDoctor = link.doctorName.replace(/^Dr\.?\s*/i, "").trim() || "your doctor";
    const emailText = `Hello,\n\nHere is your secure link to share medical records or relevant files with Dr. ${cleanDoctor} for appointment ${link.appointmentReference}:\n\n${link.uploadUrl}\n\nThe link expires in 7 days.\n\nQubetech clinic`;

    // DEBUG PREVIEW only — not proof of delivery.
    rememberRecordsUploadLink({
      phone: link.phone,
      appointmentReference: link.appointmentReference,
      doctorName: link.doctorName,
      uploadUrl: link.uploadUrl,
      smsBody: emailText,
    });

    const delivery = await sendEmail({
      to: email,
      subject: `Secure upload link for appointment ${link.appointmentReference}`,
      text: emailText,
    });

    if (delivery.ok) {
      console.log(
        `[synthflow] records-offer EMAIL SENT → ${email} ref=${link.appointmentReference} id=${delivery.messageId}`,
      );
      return {
        success: true,
        records_consent: "yes",
        records_email_sent: true,
        email,
        appointment_reference: link.appointmentReference,
        next_action: "none",
        message:
          "Thank you. I have emailed the secure upload link to that address. Is there anything else I can help you with?",
      };
    }

    await markRecordRequestSmsResult({
      requestId: link.requestId,
      smsSent: false,
      smsError: `Email to ${email} failed: ${delivery.error}`,
    }).catch(() => undefined);
    console.warn(
      `[synthflow] records-offer EMAIL FAILED → ${email} ref=${link.appointmentReference}: ${delivery.error}`,
    );
    return {
      success: false,
      records_consent: "yes",
      records_email_sent: false,
      email,
      next_action: "none",
      message:
        "I'm sorry, I was not able to send the email just now. Your appointment is still confirmed, and the clinic can send you the upload link later. Is there anything else I can help you with?",
    };
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not create the upload link.";
    console.warn(
      `[synthflow] records-offer link/email error email=${email} ref=${appointmentReference}:`,
      message,
    );
    return {
      success: false,
      records_consent: "yes",
      records_email_sent: false,
      message: `${message} I have not sent an email. Your appointment is still confirmed.`,
    };
  }
}

/** "john dot smith at gmail dot com" → "john.smith@gmail.com"; "" when not a valid address. */
function normalizeSpokenEmail(raw: string) {
  const text = raw
    .trim()
    .toLowerCase()
    .replace(/\s+at\s+/g, "@")
    .replace(/\s+dot\s+/g, ".")
    .replace(/\s+(underscore)\s+/g, "_")
    .replace(/\s+(dash|hyphen)\s+/g, "-")
    .replace(/\s+/g, "")
    .replace(/\.+$/, "");
  if (emptyish(text) || text === "none") return "";
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/.test(text) ? text : "";
}

/** Read an address back the way a caller would say it. */
function spokenEmail(email: string) {
  return email.replace(/@/g, " at ").replace(/\./g, " dot ");
}

/**
 * Voice agent confirmed a mobile number for the medical-records upload link.
 * Queue SMS delivery shortly after so the live call can hang up first.
 */
export async function handleRecordsSmsAction(body: unknown) {
  const root = asRecord(body);
  const extracted = extractSynthflowFields(body);
  const bookingFields = extractVoiceBookingFields(body);
  const custom = asRecord(root.custom_variables || root.customVariables);

  let phone = "";
  for (const candidate of collectPhoneCandidates(body)) {
    phone = coercePhoneCandidate(candidate);
    if (phone) break;
  }

  const doctorName =
    pickString(root, ["doctor_name", "doctor"]) ||
    asString(custom.doctor_name).trim() ||
    bookingFields.doctorName ||
    pickFirstFromExtracted(extracted, ["doctor_name"]) ||
    "your doctor";
  const appointmentReference =
    pickString(root, ["appointment_reference", "reference", "appointment"]) ||
    asString(custom.appointment_reference).trim() ||
    pickFirstFromExtracted(extracted, ["appointment_reference"]) ||
    "your visit";
  const uploadUrl =
    pickString(root, ["upload_url", "uploadUrl", "link", "url"]) ||
    asString(custom.upload_url).trim() ||
    pickFirstFromExtracted(extracted, ["upload_url"]);

  if (!phone) {
    console.warn(
      "[synthflow] records-sms: no phone in payload keys=",
      Object.keys(root).join(","),
    );
    return {
      success: false,
      message:
        "Please say the mobile number as digits where I should text the upload link so you can share your documents.",
    };
  }
  if (!uploadUrl || !/^https?:\/\//i.test(uploadUrl)) {
    console.warn("[synthflow] records-sms: missing upload_url for phone", phone);
    return {
      success: false,
      message: "The upload link is missing. Please ask your doctor to resend the records request.",
    };
  }

  const clinicNumber = normalizePhone(env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053");
  if (clinicNumber && phone === clinicNumber) {
    return {
      success: false,
      message: "That number is the clinic line. Please give your personal mobile number.",
    };
  }

  const cleanDoctor = doctorName.replace(/^Dr\.?\s*/i, "").trim() || "your doctor";
  const smsBody = `Qubetech clinic: Dr. ${cleanDoctor} requested your medical records for appointment ${appointmentReference}. Upload securely here (expires in 7 days): ${uploadUrl}`;

  // DEBUG PREVIEW only — not proof of delivery.
  rememberRecordsUploadLink({
    phone,
    appointmentReference,
    doctorName: cleanDoctor,
    uploadUrl,
    smsBody,
  });
  console.log(`[synthflow] records-sms accepted phone=${phone} ref=${appointmentReference}`);

  // Deliver the same prepared body without placing an automated outbound call.
  const delivery = await deliverSmsWithoutCall({
    toPhone: phone,
    body: smsBody,
    purpose: "records_upload",
  });

  if (delivery.ok) {
    console.log(`[synthflow] Records upload SMS DELIVERED (no call) → ${phone}`);
    return {
      success: true,
      records_sms_sent: true,
      phone,
      message:
        "I have texted your secure upload link. Please open it to attach your files. Goodbye.",
    };
  }

  console.warn(
    `[synthflow] Records upload SMS failed (no call) → ${phone}: ${delivery.error}`,
  );
  return {
    success: false,
    records_sms_sent: false,
    phone,
    message:
      "I could not text the upload link just now. Please confirm the mobile number as digits, or ask me to send the link again on this call with send_records_upload_link.",
  };
}

export function getWebhookCallId(payload: unknown) {
  return (
    deepFindString(payload, ["call_id", "callId"]) ||
    digitsOnly(deepFindString(payload, ["call_sid", "callSid"])) ||
    ""
  );
}
