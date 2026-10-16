import type { User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone } from "../utils/phone.js";
import {
  findActiveAppointmentForMobile,
  getAppointmentForPatient,
  type PublicAppointment,
} from "./appointments.service.js";
import { issueBookingOtp } from "./booking-otp.service.js";
import { emptyish, looksLikeRecordId } from "./synthflow-fields.service.js";
import { findOrCreatePatientForVoice } from "./voice-patient.service.js";
import { getClinicDoctorUserId } from "./clinic-doctor.service.js";

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
  if (name && !emptyish(name)) {
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
    if (profile?.userId) return profile.userId;
  }

  // One-to-one clinic: default to the configured Doctor Dashboard doctor.
  return getClinicDoctorUserId();
}

async function resolveSlotId(doctorUserId: string, slotId?: string, whenHint?: Date | null) {
  if (slotId && looksLikeRecordId(slotId)) {
    const exact = await prisma.availabilitySlot.findFirst({
      where: { id: slotId, doctor: { userId: doctorUserId } },
    });
    if (exact) return exact.id;
  }

  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) return null;

  if (whenHint && !Number.isNaN(whenHint.getTime())) {
    const windowMs = 45 * 60 * 1000;
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
    if (slot) return slot.id;
  }

  const nextOpen = await prisma.availabilitySlot.findFirst({
    where: {
      doctorId: profile.id,
      isBooked: false,
      startsAt: { gt: new Date() },
    },
    orderBy: { startsAt: "asc" },
  });
  return nextOpen?.id ?? null;
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
): Promise<{
  patient: User;
  appointment: PublicAppointment;
  otp: string;
  expiresSeconds: number;
  alreadyConfirmed?: boolean;
} | null> {
  const existing = await existingAppointmentForCall(input.synthflowCallId);
  if (existing) {
    const patient = await prisma.user.findUnique({ where: { id: existing.patientId } });
    if (!patient) return null;
    const appointment = await getAppointmentForPatient(existing.id, existing.patientId);
    if (appointment.status === "confirmed") {
      return { patient, appointment, otp: "", expiresSeconds: 0, alreadyConfirmed: true };
    }
  }

  const phone = normalizePhone(input.phone || "");
  const spokenName = input.patientName?.trim() || "";
  let patientId = input.patientId?.trim() || "";
  let patient: User | null = null;

  // Prefer the booking phone + spoken name over inbound patient_id.
  // Inbound webhooks often inject a previous patient_id for the caller line, which
  // must not override a different person booking on a different mobile number.
  if (phone) {
    patient = await findOrCreatePatientForVoice({
      phone,
      fullName: spokenName || undefined,
      email: input.email,
      allowCreate: input.allowRegister !== false,
    });
  }

  if (!patient && patientId) {
    patient = await prisma.user.findFirst({
      where: { id: patientId, role: "PATIENT", isActive: true },
    });
  }

  if (!patient) return null;

  if (
    spokenName &&
    spokenName.toLowerCase() !== patient.fullName.trim().toLowerCase()
  ) {
    patient = await prisma.user.update({
      where: { id: patient.id },
      data: { fullName: spokenName },
    });
    console.log(
      `[voice-booking] Updated patient name to "${spokenName}" for phone=${phone || "(none)"} id=${patient.id}`,
    );
  }

  // Enforce one-active-appointment before slot/doctor work so Synthflow always
  // receives a clear speakable message (not a generic booking failure).
  const active = await findActiveAppointmentForMobile({
    patientId: patient.id,
    phone,
    ignoreOpenOtpHolds: true,
  });
  if (active) {
    throw new AppError(409, active.blockMessage);
  }

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

  const issued = await issueBookingOtp({
    patientId: patient.id,
    doctorId,
    slotId,
    reason,
    phone,
  });
  const { appointment } = issued;

  if (input.synthflowCallId) {
    await prisma.voiceCall
      .updateMany({
        where: { synthflowCallId: input.synthflowCallId },
        data: {
          callerName: patient.fullName || input.patientName || "",
          patientId: patient.id,
          doctorUserId: doctorId,
          appointmentId: appointment.id,
          summary: `OTP pending for ${appointment.reference}; not confirmed`,
        },
      })
      .catch(() => undefined);
  }

  return { patient, appointment, otp: issued.otp, expiresSeconds: issued.expiresSeconds };
}
