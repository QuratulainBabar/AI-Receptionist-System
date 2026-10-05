import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { formatWeeklyHoursSummary, parseWeeklyHours } from "../utils/doctor-profile.js";
import { logPatientActivity, ActivityType } from "./activity.service.js";
import { digitsOnly, normalizePhone } from "../utils/phone.js";
import { findPatientByPhone } from "./patient-phone.service.js";
import { emptyish, extractSynthflowFields, extractVoiceBookingFields } from "./synthflow-fields.service.js";
import { processVoiceBooking } from "./voice-booking.service.js";
import { fetchCallRecordingUrl } from "./synthflow.client.js";
import { formatDoctorDirectoryLine, formatDoctorSpokenBlurb } from "./doctor-profile.service.js";

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

async function buildClinicContext() {
  const now = new Date();
  const doctors = await prisma.doctorProfile.findMany({
    where: { user: { isActive: true, role: "DOCTOR" } },
    include: {
      user: true,
      specialty: true,
      availability: {
        where: { isBooked: false, startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        take: 4,
      },
    },
    orderBy: { user: { fullName: "asc" } },
    take: 100,
  });

  const profileBlurbs: string[] = [];
  const lines = doctors.map((doctor) => {
    const slots = doctor.availability
      .map((slot) => {
        const when = slot.startsAt.toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return `${when} [slot:${slot.id}]`;
      })
      .join("; ");
    const weeklyHoursSummary = formatWeeklyHoursSummary(parseWeeklyHours(doctor.weeklyHours));
    profileBlurbs.push(
      formatDoctorSpokenBlurb({
        fullName: doctor.user.fullName,
        specialty: doctor.specialty.name,
        qualifications: doctor.qualifications,
        certifications: doctor.certifications,
        experienceYears: doctor.experienceYears,
        about: doctor.about,
        clinic: doctor.clinic,
        fee: doctor.fee,
        languages: doctor.languages,
      }),
    );
    return formatDoctorDirectoryLine({
      fullName: doctor.user.fullName,
      doctorId: doctor.userId,
      specialty: doctor.specialty.name,
      subSpecialty: doctor.subSpecialty,
      qualifications: doctor.qualifications,
      certifications: doctor.certifications,
      experienceYears: doctor.experienceYears,
      about: doctor.about,
      areasOfExpertise: doctor.areasOfExpertise,
      clinic: doctor.clinic,
      fee: doctor.fee,
      consultationType: doctor.consultationType,
      languages: doctor.languages,
      location: doctor.location,
      weeklyHoursSummary,
      nextSlots: slots || "none",
    });
  });

  return {
    clinic_name: "Qubetech AI Receptionist Clinic",
    doctors_available: String(doctors.length),
    doctors_directory: lines.join("\n") || "No doctors currently available.",
    doctor_profiles: profileBlurbs.join("\n") || "none",
    availability_summary:
      lines
        .map((line) => {
          const name = line.match(/^Doctor: ([^|]+)/)?.[1]?.trim() || "";
          const fee = line.match(/consultation_fee: ([^|]+)/)?.[1]?.trim() || "";
          const slots = line.match(/next_slots: (.+)$/)?.[1]?.trim() || "none";
          if (!name) return "";
          if (!slots || slots === "none") return `${name}: no open slots`;
          const firstTwo = slots
            .split(";")
            .map((part) => part.replace(/\s*\[slot:[^\]]+\]/g, "").trim())
            .filter(Boolean)
            .slice(0, 2)
            .join("; ");
          return `${name} AVAILABLE (${fee}): ${firstTwo}`;
        })
        .filter(Boolean)
        .join(" | ") || "No open slots.",
    booking_instructions:
<<<<<<< Updated upstream
      "When a doctor is discussed, share experience, qualifications, and professional bio from doctor_profiles. You CAN check availability from availability_summary and doctors_directory next_slots. To book, confirm name, doctor, and slot_id, then call the book appointment action.",
=======
      "To book, confirm patient full name, preferred doctor, and one available slot_id. Then call the book appointment action with patient_id or phone, doctor_id, and slot_id. One active appointment per mobile: if booking fails because they already have a Pending or Confirmed appointment, tell them clearly they must complete or cancel it before booking another. Completed or Cancelled appointments allow a new booking. Share bio, qualifications, certifications, expertise, hospital, location, languages, and weekly hours ONLY if the caller asks about that doctor.",
>>>>>>> Stashed changes
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

  const customVariables: Record<string, string> = {
    ...clinic,
    caller_phone: fromNumber,
    clinic_phone: toNumber,
    patient_found: patient ? "true" : "false",
    patient_id: patient?.id ?? "",
    patient_name: patient?.fullName ?? "",
    patient_email: patient?.email ?? "",
    patient_reference: patient?.reference ?? "",
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
  payload: unknown,
  context: { fromNumber: string; patientId: string | null; callId: string },
) {
  const fields = extractVoiceBookingFields(payload);
  const executed = extractExecutedValues(payload);

  const doctorId =
    fields.doctorId ||
    executed.doctor_id ||
    executed.doctorid ||
    deepFindString(payload, ["doctor_id", "doctorId"]);
  const slotId =
    fields.slotId ||
    executed.slot_id ||
    executed.slotid ||
    deepFindString(payload, ["slot_id", "slotId"]);
  const reason =
    fields.reason ||
    executed.reason ||
    deepFindString(payload, ["reason", "visit_reason"]) ||
    "Booked via AI voice receptionist";

  const phone = normalizePhone(fields.phone || context.fromNumber);

  try {
    const result = await processVoiceBooking({
      patientId: context.patientId || undefined,
      phone,
      patientName: fields.patientName,
      email: fields.email,
      doctorId,
      doctorName: fields.doctorName,
      slotId: fields.slotId,
      reason,
      whenHint: fields.whenHint,
      allowRegister: true,
      synthflowCallId: context.callId || undefined,
    });
    return result?.appointment ?? null;
  } catch (error) {
    console.warn(
      "[synthflow] Post-call booking skipped:",
      error instanceof Error ? error.message : error,
    );
    return null;
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

  return {
    ok: true,
    voiceCallId: voiceCall.id,
    appointmentId: booked?.id ?? existing?.appointmentId ?? null,
    appointmentReference: booked?.reference ?? null,
  };
}

function pickFirstFromExtracted(fields: Record<string, string>, keys: string[]) {
  for (const key of keys) {
    const value = fields[key];
    if (value && !emptyish(value)) return value.trim();
  }
  return "";
}

export async function handleAvailabilityAction(body: unknown) {
  const root = asRecord(body);
  const specialty = pickString(root, ["specialty", "speciality", "department"]).toLowerCase();
  const doctorNameRaw = pickString(root, ["doctor_name", "doctor", "doctorName"]);
  const doctorId = pickString(root, ["doctor_id", "doctorId"]);
  const doctorQuery = doctorNameRaw
    .toLowerCase()
    .replace(/^dr\.?\s*/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const now = new Date();
  const doctors = await prisma.doctorProfile.findMany({
    where: {
      ...(doctorId ? { userId: doctorId } : {}),
      user: { isActive: true, role: "DOCTOR" },
      ...(specialty
        ? { specialty: { name: { contains: specialty, mode: "insensitive" as const } } }
        : {}),
    },
    include: {
      user: true,
      specialty: true,
      availability: {
        where: { isBooked: false, startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        take: 6,
      },
    },
    take: 40,
  });

  const matched = doctors.filter((doctor) => {
    if (!doctorQuery) return true;
    const hay = doctor.user.fullName
      .toLowerCase()
      .replace(/^dr\.?\s*/i, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    const parts = doctorQuery.split(" ").filter(Boolean);
    return hay.includes(doctorQuery) || parts.every((part) => hay.includes(part));
  });

  const sourceDoctors = matched.length ? matched : doctors;
  const rows = sourceDoctors.map((doctor) => ({
    doctor_id: doctor.userId,
    name: doctor.user.fullName,
    specialty: doctor.specialty.name,
    clinic: doctor.clinic,
    fee: doctor.fee,
    experience_years: doctor.experienceYears,
    qualifications: doctor.qualifications,
    professional_bio: doctor.about,
    available: doctor.availability.length > 0,
    slots: doctor.availability.map((slot) => ({
      slot_id: slot.id,
      starts_at: slot.startsAt.toISOString(),
      label: slot.startsAt.toLocaleString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    })),
  }));

  const firstDoctor = sourceDoctors[0];
  const first = rows[0];
  const intro = firstDoctor
    ? formatDoctorSpokenBlurb({
        fullName: firstDoctor.user.fullName,
        specialty: firstDoctor.specialty.name,
        qualifications: firstDoctor.qualifications,
        certifications: firstDoctor.certifications,
        experienceYears: firstDoctor.experienceYears,
        about: firstDoctor.about,
        clinic: firstDoctor.clinic,
        fee: firstDoctor.fee,
        languages: firstDoctor.languages,
      }).replace(/^- /, "")
    : "";
  const spoken_summary = first
    ? first.available
      ? `${intro} Next openings: ${first.slots
          .slice(0, 2)
          .map((slot) => slot.label)
          .join("; ")}.`
      : `${intro} There are no open slots right now.`
    : "That doctor is not on the current clinic roster.";

  return {
    success: true,
    spoken_summary,
    doctors: rows,
  };
}

export async function handleBookAction(body: unknown) {
  const root = asRecord(body);
  const fields = extractVoiceBookingFields(body);
  const doctorId = pickString(root, ["doctor_id", "doctorId"]) || fields.doctorId;
  const slotId = pickString(root, ["slot_id", "slotId"]) || fields.slotId;
  const reason =
    pickString(root, ["reason", "visit_reason"]) || fields.reason || "Booked via AI voice receptionist";
  const phone = normalizePhone(
    pickString(root, ["phone", "phone_number", "caller_phone", "from_number"]) || fields.phone,
  );
  const patientId = pickString(root, ["patient_id", "patientId"]);
  const patientName =
    pickString(root, ["patient_name", "full_name", "name"]) || fields.patientName;
  const email = pickString(root, ["email"]) || fields.email;
  const callId = pickString(root, ["call_id", "callId"]);

<<<<<<< Updated upstream
  const booked = await processVoiceBooking({
    patientId: patientId || undefined,
    phone,
    patientName,
    email,
    doctorId,
    doctorName: fields.doctorName,
    slotId,
    reason,
    whenHint: fields.whenHint,
    allowRegister: true,
    synthflowCallId: callId || undefined,
  });
=======
  let booked: Awaited<ReturnType<typeof processVoiceBooking>>;
  try {
    booked = await processVoiceBooking({
      patientId: patientId || undefined,
      phone,
      patientName,
      email,
      doctorId,
      doctorName: fields.doctorName,
      slotId,
      reason,
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
>>>>>>> Stashed changes

  if (!booked) {
    return {
      success: false,
      message:
        "Could not complete booking. Need phone (or patient_id), doctor_id, slot_id, and patient name for new callers.",
    };
  }

  const { appointment, patient } = booked;

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
          summary: `Booked ${appointment.reference}`,
          startedAt: new Date(),
        },
        update: {
          callerName: patient.fullName || patientName || undefined,
          patientId: patient.id,
          doctorUserId: appointment.doctorId,
          appointmentId: appointment.id,
          summary: `Booked ${appointment.reference}`,
        },
      })
      .catch(() => undefined);
  }

  return {
    success: true,
    message: `Appointment ${appointment.reference} confirmed with ${appointment.doctorName} on ${appointment.date} at ${appointment.time}.`,
    appointment,
    patient_id: patient.id,
    patient_reference: patient.reference,
  };
}

export function getWebhookCallId(payload: unknown) {
  return (
    deepFindString(payload, ["call_id", "callId"]) ||
    digitsOnly(deepFindString(payload, ["call_sid", "callSid"])) ||
    ""
  );
}
