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
import { fetchCallRecordingUrl, sendPatientReminderSms } from "./synthflow.client.js";
import {
  createUploadLinkForVoiceBooking,
  markRecordRequestSmsResult,
} from "./record-requests.service.js";
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
    if (str) return str;
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
        "This clinic has one doctor. When the caller wants to book, ask only which day they want, then WAIT — do not list dates yet. Only if they ask which days are available (or do not know), call check_doctor_availability with date empty and say only open dates for the next seven days (speak slowly). After they pick a date, call again with that date and say only that day's times. Then collect booking details. After the caller gives a phone number, call check_existing_appointment. If has_active_appointment is true, do not book. If false, you MUST call book_appointment with a real slot_id before asking for any code. Never say OTP digits aloud. Only after book_appointment succeeds, ask for the six-digit verification code, then call verify_booking_otp. The appointment is not booked until appointment_confirmed is true. After the final appointment summary, ask exactly: Would you like to share your medical records or any relevant files with the doctor? If yes, call offer_records_upload with consent yes. If no, call offer_records_upload with consent no.",
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
      ? "Do not read this aloud. Use check_doctor_availability: date today for today's times; date empty for weekly open dates; or the chosen day for that day's times. Always speak the action message exactly."
      : `${profile.doctorName} has no open slots right now.`,
    booking_instructions:
      "If the caller asks about today's availability, call check_doctor_availability with date today and say the message. If they ask about the weekly schedule, call with date empty and say the message. When booking: ask which day, WAIT, then call with that date and say times. After phone number, call check_existing_appointment. If has_active_appointment is true, do not book. If false, MUST call book_appointment with a real slot_id — do not ask for a code yet. Only after book_appointment succeeds, ask for the six-digit code and call verify_booking_otp. Never say OTP digits aloud. Confirm only when appointment_confirmed is true. After the final appointment summary, ask exactly in English: Would you like to share your medical records or any relevant files with the doctor? If yes, call offer_records_upload with consent yes and the booking phone. If no, call offer_records_upload with consent no.",
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

/** Resolve a spoken/typed date to YYYY-MM-DD in the clinic zone (next 7 days only). */
function resolveAvailabilityDateKey(raw: string, now = new Date()): string | null {
  const text = raw.toLowerCase().trim();
  if (!text || emptyish(text) || text === "none" || text === "null") return null;
  // Weekly / schedule questions → list open dates (not a single day).
  if (
    /\b(week|weekly|schedule|this week|next week|available days|open days|which days)\b/.test(text)
  ) {
    return null;
  }

  const todayKey = civilDateKey(now);
  const weekEnd = addCivilDays(todayKey, 6);

  if (/\btoday\b/.test(text)) return todayKey;
  if (/\btomorrow\b/.test(text)) return addCivilDays(todayKey, 1);

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
      for (let offset = 0; offset < 7; offset += 1) {
        const key = addCivilDays(todayKey, offset);
        const [y, m, d] = key.split("-").map(Number);
        if (m === monthIdx + 1 && d === dayNum) return key;
      }
    }
  }

  for (const [alias, wantDow] of Object.entries(WEEKDAY_ALIASES)) {
    if (!new RegExp(`\\b${alias}\\b`).test(text)) continue;
    for (let offset = 0; offset < 7; offset += 1) {
      const key = addCivilDays(todayKey, offset);
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

function slotsWithinWeek(slots: Array<{ id: string; startsAt: Date }>, now = new Date()) {
  const todayKey = civilDateKey(now);
  const weekEnd = addCivilDays(todayKey, 6);
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
      label: speakableDateLabel(key),
      open_count: byDate.get(key) || 0,
    }));
    const dateLabels = dates.map((row) => row.label);
    let spoken_summary: string;
    if (dateLabels.length === 0) {
      spoken_summary = "There are no open dates in the next seven days.";
    } else if (dateLabels.length === 1) {
      spoken_summary = `Over the next seven days, the open date is ${dateLabels[0]}. Which date would you like?`;
    } else {
      const head = dateLabels.slice(0, -1).join(", ");
      const last = dateLabels[dateLabels.length - 1];
      spoken_summary = `Over the next seven days, the open dates are ${head}, and ${last}. Which date would you like?`;
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
  const dayLabel = speakableDateLabel(dateKey);
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
      const nextLabel = speakableDateLabel(nextKey);
      const timesSpoken =
        nextTimes.length === 1
          ? nextTimes[0]
          : `${nextTimes.slice(0, -1).join(", ")}, and ${nextTimes[nextTimes.length - 1]}`;
      spoken_summary = `There are no remaining open times today. The next open day is ${nextLabel}, with times ${timesSpoken}. Which time would you like, or would you prefer another day this week?`;
    } else {
      spoken_summary = `There are no open times on ${dayLabel}. Please choose another date from the next seven days.`;
    }
  } else if (timeLabels.length === 1) {
    spoken_summary = `On ${dayLabel}, the open time is ${timeLabels[0]}. Which time would you like?`;
  } else {
    const head = timeLabels.slice(0, -1).join(", ");
    const last = timeLabels[timeLabels.length - 1];
    spoken_summary = `On ${dayLabel}, the open times are ${head}, and ${last}. Which time would you like?`;
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

export async function handleCheckAppointmentAction(body: unknown) {
  const root = asRecord(body);
  const fields = extractVoiceBookingFields(body);
  const phone = normalizePhone(
    pickString(root, ["phone", "phone_number", "caller_phone", "from_number"]) || fields.phone,
  );

  if (!phone) {
    return {
      success: true,
      has_active_appointment: false,
      can_book: false,
      message: "Please repeat the phone number so I can check existing appointments.",
    };
  }

  const active = await findActiveAppointmentForMobile({ phone, ignoreOpenOtpHolds: true });
  if (active) {
    return {
      success: true,
      has_active_appointment: true,
      can_book: false,
      new_appointment_booked: false,
      reference: active.reference,
      status: active.status,
      doctor: active.doctorName,
      when: `${active.date} at ${active.time}`,
      message: `I did not book a new appointment. This number already has an active appointment: ${active.spokenSummary}. Please complete or cancel that one first. After it is completed or cancelled, this number can book a new appointment. If the caller asks whether today's request is confirmed, say no, the new appointment was not booked.`,
    };
  }

  return {
    success: true,
    has_active_appointment: false,
    can_book: true,
    next_action: "book_appointment",
    message:
      "This number has no active appointment. Next call book_appointment with doctor_id, slot_id, patient_name, phone, and reason. Do not ask for a verification code until book_appointment succeeds.",
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
      "The appointment is not booked yet. Do not say any code digits aloud. Ask the caller to say the six-digit verification code, then call verify_booking_otp with the booking phone and the digits they speak. If you did not catch the digits, ask them to say the six digits slowly again. Confirm only when appointment_confirmed is true. If the code is wrong, say the appointment is not booked and that time was released.",
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

  console.log(
    `[synthflow] records-offer response consent_raw="${consentRaw}" consent=${consent} phone=${phone || "(none)"} ref=${appointmentReference || "(none)"}`,
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

  if (!phone && !appointmentReference) {
    console.warn("[synthflow] records-offer yes but missing booking phone and reference");
    return {
      success: false,
      records_consent: "yes",
      records_sms_sent: false,
      message:
        "Please say the mobile number from your booking so I can text the secure upload link.",
    };
  }

  try {
    const link = await createUploadLinkForVoiceBooking({
      phone: phone || undefined,
      appointmentReference: appointmentReference || undefined,
    });

    const cleanDoctor = link.doctorName.replace(/^Dr\.?\s*/i, "").trim() || "your doctor";
    const smsBody = `Qubetech clinic: Secure upload link for your appointment ${link.appointmentReference} with Dr. ${cleanDoctor}. Share medical records here (expires in 7 days): ${link.uploadUrl}`;

    console.log(
      `[synthflow] records-offer accepted phone=${link.phone} ref=${link.appointmentReference} link_generated=true url=${link.uploadUrl}`,
    );

    // Send SMS in the background so Synthflow does not time out waiting on the
    // outbound messaging call. The upload link is already stored on the appointment.
    void (async () => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        await sendPatientReminderSms({
          toPhone: link.phone,
          body: smsBody,
          purpose: "confirmation",
        });
        await markRecordRequestSmsResult({
          requestId: link.requestId,
          smsSent: true,
        });
        console.log(
          `[synthflow] records-offer SMS sent phone=${link.phone} ref=${link.appointmentReference}`,
        );
      } catch (error) {
        const smsError = error instanceof Error ? error.message : String(error);
        await markRecordRequestSmsResult({
          requestId: link.requestId,
          smsSent: false,
          smsError,
        }).catch(() => undefined);
        console.warn(
          `[synthflow] records-offer SMS failed phone=${link.phone} ref=${link.appointmentReference}:`,
          smsError,
        );
      }
    })();

    return {
      success: true,
      records_consent: "yes",
      records_sms_sent: true,
      phone: link.phone,
      appointment_reference: link.appointmentReference,
      // For logging / retries only — never read aloud.
      upload_url: link.uploadUrl,
      message:
        "Thank you. I am texting a secure upload link to the phone number from your booking. Please open it to attach files or photos for the doctor. Do not call deliver_records_upload_sms. Is there anything else I can help you with?",
    };
  } catch (error) {
    const message =
      error instanceof AppError
        ? error.message
        : error instanceof Error
          ? error.message
          : "Could not create the upload link.";
    console.warn(
      `[synthflow] records-offer link/SMS error phone=${phone} ref=${appointmentReference}:`,
      message,
    );
    return {
      success: false,
      records_consent: "yes",
      records_sms_sent: false,
      message: `${message} Your appointment is still confirmed. Do not call deliver_records_upload_sms.`,
    };
  }
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

  console.log(`[synthflow] records-sms accepted phone=${phone} ref=${appointmentReference}`);

  // Deliver after a short delay so this call can end before the SMS delivery call starts.
  void (async () => {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    try {
      await sendPatientReminderSms({
        toPhone: phone,
        body: smsBody,
        purpose: "confirmation",
      });
      console.log(`[synthflow] Records upload SMS queued/delivered to ${phone}`);
    } catch (error) {
      console.warn(
        `[synthflow] Records upload SMS failed for ${phone}:`,
        error instanceof Error ? error.message : error,
      );
    }
  })();

  return {
    success: true,
    phone,
    message:
      "I have texted your secure upload link. Please open it to attach your files. Goodbye.",
  };
}

export function getWebhookCallId(payload: unknown) {
  return (
    deepFindString(payload, ["call_id", "callId"]) ||
    digitsOnly(deepFindString(payload, ["call_sid", "callSid"])) ||
    ""
  );
}
