import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { logPatientActivity, ActivityType } from "./activity.service.js";
import { digitsOnly, normalizePhone } from "../utils/phone.js";
import { formatClinicDateTime } from "../utils/clinic-time.js";
import { findPatientByPhone } from "./patient-phone.service.js";
import { emptyish, extractSynthflowFields, extractVoiceBookingFields } from "./synthflow-fields.service.js";
import { findActiveAppointmentForMobile, type PublicAppointment } from "./appointments.service.js";
import { processVoiceBooking } from "./voice-booking.service.js";
import { verifyBookingOtp } from "./booking-otp.service.js";
import { fetchCallRecordingUrl } from "./synthflow.client.js";
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
  if (doctor.availability.length === 0 && doctor.weeklyHours != null) {
    await generateSlotsFromWeeklyHours(doctor.userId, { weeks: 2, allowEmpty: true });
    doctor = (await getClinicDoctor({ openSlotsTake })) ?? doctor;
  }
  return doctor;
}

async function buildClinicContext() {
  const doctor = await ensureClinicDoctorWithSlots(8);
  if (!doctor) {
    return {
      clinic_name: "Qubetech AI Receptionist Clinic",
      doctors_available: "0",
      clinic_doctor_name: "",
      clinic_doctor_fee: "",
      opening_doctor_line: "",
      availability_summary: "No open slots. Do not invent a time.",
      booking_instructions:
        "This clinic has one doctor. Say only the doctor name and the consultation fee when a fee is set. When the caller wants to book, call check_doctor_availability and say only those open times. After the caller gives a phone number, call check_existing_appointment. If has_active_appointment is true, do not book. Otherwise call book_appointment for a real slot_id. Do not read the otp aloud. Ask for the six-digit verification code and call verify_booking_otp. The appointment is not booked until appointment_confirmed is true.",
    };
  }

  const profile = clinicDoctorProfileBlock(doctor);
  const fee = consultationFeeToSpeak(profile.fee);
  const openLabels = formatOpenSlotLabels(doctor.availability, {
    withIds: false,
    limit: 8,
  });

  return {
    clinic_name: "Qubetech AI Receptionist Clinic",
    doctors_available: "1",
    clinic_doctor_name: profile.doctorName,
    clinic_doctor_fee: fee,
    opening_doctor_line: openingDoctorLine(profile.doctorName, fee),
    availability_summary: openLabels.length
      ? "When the caller wants to book, call check_doctor_availability and say only those open times. Do not read this variable aloud."
      : `${profile.doctorName} has no open slots right now.`,
    booking_instructions:
      "Say only the doctor name and the consultation fee when a fee is set. Do not mention specialty, experience, qualifications, bio, languages, hospital, or other profile details. When the caller wants to book, call check_doctor_availability and say only spoken_summary. After the caller gives a phone number, call check_existing_appointment. If has_active_appointment is true, do not book. Otherwise call book_appointment with that doctor and a real slot_id. Do not read the otp aloud. Ask the caller to say the six-digit verification code and call verify_booking_otp. The appointment is not booked until appointment_confirmed is true.",
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

function speakOpenSlots(labels: string[]) {
  if (labels.length === 0) return "There are no open appointment times right now.";
  if (labels.length === 1) return `The open appointment time is ${labels[0]}. Would you like that time?`;
  const head = labels.slice(0, -1).join(", ");
  const last = labels[labels.length - 1];
  return `The open appointment times are ${head}, and ${last}. Which time would you like?`;
}

function pickFirstFromExtracted(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields[key];
    if (value && !emptyish(value)) return value.trim();
  }
  return "";
}

export async function handleAvailabilityAction(_body: unknown) {
  const doctor = await ensureClinicDoctorWithSlots(8);
  if (!doctor) {
    return {
      success: true,
      spoken_summary:
        "The clinic doctor profile is not set up yet. Ask the caller to try again later.",
      doctors: [],
    };
  }

  const profile = clinicDoctorProfileBlock(doctor);
  const slots = doctor.availability.map((slot) => ({
    slot_id: slot.id,
    label: formatClinicDateTime(slot.startsAt),
  }));
  const spoken_summary = speakOpenSlots(slots.map((slot) => slot.label));

  return {
    success: true,
    spoken_summary,
    doctor_id: profile.doctorId,
    doctor_name: profile.doctorName,
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

  const active = await findActiveAppointmentForMobile({ phone });
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
    message: "This number has no active appointment. We can book a new one.",
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
  // OTP SMS is delivered to the inbound caller. Store and verify against that number.
  const phone = callerPhone || spokenPhone;
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
    `[synthflow] Booking OTP issued for ${phone}; in-call SMS must text the inbound caller, not the clinic number`,
  );

  return {
    success: true,
    otp_required: true,
    appointment_booked: false,
    appointment_confirmed: false,
    otp: booked.otp,
    expires_seconds: booked.expiresSeconds,
    to_phone_number: smsTo,
    message:
      "The appointment is not booked yet. Do not read the otp aloud. Ask the caller to say the six-digit verification code, then call verify_booking_otp. Confirm only when appointment_confirmed is true. If the code is wrong, say the appointment is not booked and that time was released.",
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

export function getWebhookCallId(payload: unknown) {
  return (
    deepFindString(payload, ["call_id", "callId"]) ||
    digitsOnly(deepFindString(payload, ["call_sid", "callSid"])) ||
    ""
  );
}
