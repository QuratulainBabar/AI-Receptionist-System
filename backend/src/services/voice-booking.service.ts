import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { normalizePhone } from "../utils/phone.js";
import {
  createAppointment,
  getAppointmentForPatient,
  type PublicAppointment,
} from "./appointments.service.js";
import { emptyish, looksLikeRecordId } from "./synthflow-fields.service.js";
import { findOrCreatePatientForVoice } from "./voice-patient.service.js";
import { findPatientByPhone } from "./patient-phone.service.js";
import { logPatientActivity, ActivityType } from "./activity.service.js";

export type VoiceBookingInput = {
  patientId?: string;
  phone?: string;
  patientName?: string;
  email?: string;
  doctorId?: string;
  doctorName?: string;
  slotId?: string;
  reason?: string;
  whenHint?: Date | null;
  allowRegister?: boolean;
  synthflowCallId?: string;
};

async function resolveDoctorUserId(doctorId?: string, doctorName?: string) {
  if (doctorId && !emptyish(doctorId)) {
    const doctor = await prisma.user.findFirst({
      where: { id: doctorId, role: "DOCTOR", isActive: true },
    });
    if (doctor) return doctor.id;
  }

  const name = doctorName?.trim();
  if (!name || emptyish(name)) return null;

  const profile = await prisma.doctorProfile.findFirst({
    where: {
      user: {
        isActive: true,
        role: "DOCTOR",
        fullName: { contains: name.replace(/^dr\.?\s*/i, ""), mode: "insensitive" },
      },
    },
    include: { user: true },
  });
  return profile?.userId ?? null;
}

async function resolveSlotId(doctorUserId: string, slotId?: string, whenHint?: Date | null) {
  if (slotId && looksLikeRecordId(slotId)) {
    const exact = await prisma.availabilitySlot.findFirst({
      where: { id: slotId, doctor: { userId: doctorUserId } },
    });
    if (exact) return exact.id;
  }

  if (!whenHint || Number.isNaN(whenHint.getTime())) return null;

  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) return null;

  const windowMs = 20 * 60 * 1000;
  const slot = await prisma.availabilitySlot.findFirst({
    where: {
      doctorId: profile.id,
      isBooked: false,
      startsAt: {
        gte: new Date(whenHint.getTime() - windowMs),
        lte: new Date(whenHint.getTime() + windowMs),
      },
    },
    orderBy: { startsAt: "asc" },
  });
  return slot?.id ?? null;
}

async function existingAppointmentForCall(synthflowCallId?: string) {
  if (!synthflowCallId) return null;
  const call = await prisma.voiceCall.findUnique({
    where: { synthflowCallId },
    include: {
      appointment: {
        include: { patient: true, doctorUser: true },
      },
    },
  });
  if (!call?.appointment) return null;
  return call.appointment;
}

export async function processVoiceBooking(
  input: VoiceBookingInput,
): Promise<{ patient: User; appointment: PublicAppointment } | null> {
  const existing = await existingAppointmentForCall(input.synthflowCallId);
  if (existing) {
    const patient = await prisma.user.findUnique({ where: { id: existing.patientId } });
    if (!patient) return null;
    const appointment = await getAppointmentForPatient(existing.id, existing.patientId);
    return { patient, appointment };
  }

  let patientId = input.patientId?.trim() || "";
  let patient: User | null = null;

  if (patientId) {
    patient = await prisma.user.findFirst({
      where: { id: patientId, role: "PATIENT", isActive: true },
    });
  }

  const phone = normalizePhone(input.phone || "");
  if (!patient && phone) {
    patient = await findPatientByPhone(phone);
  }

  if (!patient && phone && input.allowRegister !== false) {
    patient = await findOrCreatePatientForVoice({
      phone,
      fullName: input.patientName,
      email: input.email,
      allowCreate: true,
    });
  }

  if (!patient) return null;

  const doctorId = await resolveDoctorUserId(input.doctorId, input.doctorName);
  if (!doctorId) {
    console.warn("[voice-booking] skipped: doctor not resolved", {
      doctorId: input.doctorId,
      doctorName: input.doctorName,
    });
    return null;
  }

  const slotId = await resolveSlotId(doctorId, input.slotId, input.whenHint);
  if (!slotId) {
    console.warn("[voice-booking] skipped: slot not resolved", {
      doctorId,
      slotId: input.slotId,
      whenHint: input.whenHint?.toISOString() ?? null,
    });
    return null;
  }

  const reason = input.reason?.trim() || "Booked via AI voice receptionist";

  const appointment = await createAppointment({
    patientId: patient.id,
    doctorId,
    slotId,
    reason,
    phone,
  });

  await logPatientActivity({
    userId: patient.id,
    type: ActivityType.APPOINTMENT_BOOKED,
    label: "Appointment booked by phone",
    detail: `${appointment.reference} with ${appointment.doctorName} on ${appointment.date} at ${appointment.time}`,
    relatedId: appointment.id,
  }).catch(() => undefined);

  if (input.synthflowCallId) {
    await prisma.voiceCall
      .updateMany({
        where: { synthflowCallId: input.synthflowCallId },
        data: {
          callerName: patient.fullName || input.patientName || "",
          patientId: patient.id,
          doctorUserId: doctorId,
          appointmentId: appointment.id,
          summary: `Booked ${appointment.reference}`,
        },
      })
      .catch(() => undefined);
  }

  return { patient, appointment };
}
