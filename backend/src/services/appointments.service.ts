import type { Appointment, AppointmentMode, AppointmentStatus, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone } from "../utils/phone.js";
import { findPatientIdsByPhone } from "./patient-phone.service.js";
import { createMessagesForAppointment } from "./messages.service.js";
import { cancelPendingReminders, scheduleAppointmentReminders } from "./appointment-reminders.service.js";
import { clinicTimeZoneLabel, formatClinicDate, formatClinicDateTime, formatClinicInput, formatClinicTime } from "../utils/clinic-time.js";
import { sendPatientReminderSms } from "./synthflow.client.js";
import { recordAppointmentStatus } from "./patient-chart.service.js";
import { logAppointmentBooked } from "./activity.service.js";
import {
  syncDoctorAppointmentInvoices,
  toPublicAppointmentInvoice,
  type PublicAppointmentInvoice,
} from "./appointment-invoices.service.js";
import {
  logAppointmentBookedForDoctor,
  logAppointmentCancelledForDoctor,
  logAppointmentRescheduledForDoctor,
} from "./notifications.service.js";

const ACTIVE_BOOKING_STATUSES: AppointmentStatus[] = ["PENDING", "CONFIRMED"];

export type PublicAppointmentRecordRequest = {
  status: string;
  smsSent: boolean;
  smsError: string;
  expiresAt: string;
  createdAt: string;
  recordsCount: number;
};

export type PublicAppointment = {
  id: string;
  reference: string;
  doctorId: string;
  doctorName: string;
  speciality: string;
  patientId: string;
  patientName: string;
  date: string;
  time: string;
  duration: string;
  mode: "In clinic" | "Video call";
  reason: string;
  status: "confirmed" | "pending" | "completed" | "cancelled";
  clinic: string;
  fee: string;
  startsAt: string;
  followUpOfId: string | null;
  followUpOfReference: string | null;
  isFollowUp: boolean;
  recordRequest: PublicAppointmentRecordRequest | null;
  invoice: PublicAppointmentInvoice | null;
};

type AppointmentWithPeople = Appointment & {
  patient: User;
  doctorUser: User;
  followUpOf?: { id: string; reference: string } | null;
  recordRequest?: {
    status: string;
    smsSent: boolean;
    smsError: string;
    expiresAt: Date;
    createdAt: Date;
    _count?: { records: number };
  } | null;
  invoice?: {
    status: import("@prisma/client").AppointmentInvoiceStatus;
    amountCents: number;
    currency: string;
    hostedInvoiceUrl: string;
    phone: string;
    smsError: string;
    sentAt: Date | null;
    paidAt: Date | null;
  } | null;
};

const STATUS_MAP: Record<PublicAppointment["status"], AppointmentStatus> = {
  confirmed: "CONFIRMED",
  pending: "PENDING",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
};

const ALLOWED_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  PENDING: ["CONFIRMED", "COMPLETED", "CANCELLED"],
  CONFIRMED: ["PENDING", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

function toPublicStatus(status: AppointmentStatus): PublicAppointment["status"] {
  switch (status) {
    case "PENDING":
      return "pending";
    case "COMPLETED":
      return "completed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "confirmed";
  }
}

function toPublicMode(mode: AppointmentMode): PublicAppointment["mode"] {
  return mode === "VIDEO_CALL" ? "Video call" : "In clinic";
}

function formatDateLabel(date: Date) {
  return formatClinicDate(date);
}

function formatTimeLabel(date: Date) {
  return formatClinicTime(date);
}

export type ActiveAppointmentForMobile = {
  id: string;
  reference: string;
  status: PublicAppointment["status"];
  doctorName: string;
  date: string;
  time: string;
  patientId: string;
  spokenSummary: string;
  blockMessage: string;
};

/**
 * Find a Pending/Confirmed appointment for this mobile (and optional patient id).
 * Completed/Cancelled are ignored.
 */
export async function findActiveAppointmentForMobile(input: {
  phone?: string;
  patientId?: string;
  /** When false, an in-progress OTP hold also blocks a new booking (patient portal). */
  ignoreOpenOtpHolds?: boolean;
}): Promise<ActiveAppointmentForMobile | null> {
  const patientIds = new Set<string>();
  if (input.patientId) patientIds.add(input.patientId);

  let phone = normalizePhone(input.phone || "");
  if (!phone && input.patientId) {
    const history = await prisma.patientMedicalHistory.findUnique({
      where: { userId: input.patientId },
      select: { phone: true },
    });
    phone = normalizePhone(history?.phone || "");
  }

  if (phone) {
    for (const id of await findPatientIdsByPhone(phone)) {
      patientIds.add(id);
    }
  }

  if (patientIds.size === 0) return null;

  await releaseExpiredOtpHolds();

  const active = await prisma.appointment.findFirst({
    where: {
      patientId: { in: [...patientIds] },
      status: { in: ACTIVE_BOOKING_STATUSES },
      ...(input.ignoreOpenOtpHolds === false
        ? {}
        : { otps: { none: { usedAt: null } } }),
    },
    include: { doctorUser: true },
    orderBy: { startsAt: "asc" },
  });

  if (!active) return null;

  const status = toPublicStatus(active.status);
  const date = formatDateLabel(active.startsAt);
  const time = formatTimeLabel(active.startsAt);
  const spokenSummary = `${active.reference}, ${status}, with ${active.doctorUser.fullName} on ${date} at ${time}`;
  return {
    id: active.id,
    reference: active.reference,
    status,
    doctorName: active.doctorUser.fullName,
    date,
    time,
    patientId: active.patientId,
    spokenSummary,
    blockMessage: `You already have an active appointment (${spokenSummary}). Please complete or cancel it before booking another one.`,
  };
}

/**
 * One active appointment per mobile: PENDING/CONFIRMED block new bookings;
 * COMPLETED/CANCELLED do not.
 */
async function assertNoActiveAppointmentForMobile(
  patientId: string,
  phoneHint?: string,
  options?: { ignoreOpenOtpHolds?: boolean },
) {
  const active = await findActiveAppointmentForMobile({
    patientId,
    phone: phoneHint,
    ignoreOpenOtpHolds: options?.ignoreOpenOtpHolds,
  });
  if (!active) return;
  throw new AppError(409, active.blockMessage);
}

function toPublicRecordRequest(
  row: AppointmentWithPeople["recordRequest"],
): PublicAppointmentRecordRequest | null {
  if (!row) return null;
  const recordsCount = row._count?.records ?? 0;
  const expired = row.expiresAt.getTime() < Date.now();
  const status = recordsCount > 0 ? "uploaded" : expired ? "expired" : row.status;
  return {
    status,
    smsSent: row.smsSent,
    smsError: row.smsError,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    recordsCount,
  };
}

function toPublicAppointment(row: AppointmentWithPeople): PublicAppointment {
  return {
    id: row.id,
    reference: row.reference,
    doctorId: row.doctorUserId,
    doctorName: row.doctorUser.fullName,
    speciality: row.specialtyName,
    patientId: row.patientId,
    patientName: row.patient.fullName,
    date: formatDateLabel(row.startsAt),
    time: formatTimeLabel(row.startsAt),
    duration: `${row.durationMinutes} min`,
    mode: toPublicMode(row.mode),
    reason: row.reason,
    status: toPublicStatus(row.status),
    clinic: row.clinic,
    fee: row.fee,
    startsAt: row.startsAt.toISOString(),
    followUpOfId: row.followUpOfId ?? null,
    followUpOfReference: row.followUpOf?.reference ?? null,
    isFollowUp: Boolean(row.followUpOfId),
    recordRequest: toPublicRecordRequest(row.recordRequest),
    invoice: toPublicAppointmentInvoice(row.invoice ?? null),
  };
}

const appointmentInclude = {
  patient: true,
  doctorUser: true,
  followUpOf: { select: { id: true, reference: true } },
  recordRequest: { include: { _count: { select: { records: true } } } },
  invoice: {
    select: {
      status: true,
      amountCents: true,
      currency: true,
      hostedInvoiceUrl: true,
      phone: true,
      smsError: true,
      sentAt: true,
      paidAt: true,
    },
  },
} as const;

async function generateAppointmentReference(
  client: Pick<typeof prisma, "appointment"> = prisma,
) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const reference = `APT-${Math.floor(1000 + Math.random() * 9000)}`;
    const existing = await client.appointment.findUnique({ where: { reference } });
    if (!existing) return reference;
  }
  throw new AppError(500, "Could not generate an appointment reference");
}

async function bookingPhoneForPatient(patientId: string, explicit?: string) {
  const direct = normalizePhone(explicit || "");
  if (direct) return direct;
  const history = await prisma.patientMedicalHistory.findUnique({
    where: { userId: patientId },
    select: { phone: true },
  });
  return normalizePhone(history?.phone || "");
}

export async function createAppointment(input: {
  patientId: string;
  doctorId: string;
  slotId: string;
  reason?: string;
  /** Optional mobile used for the one-active-appointment rule (voice / Synthflow). */
  phone?: string;
  /** Voice booking: claim the slot but stay pending until the OTP is verified. */
  holdForOtp?: boolean;
}) {
  const patient = await prisma.user.findUnique({ where: { id: input.patientId } });
  if (!patient || patient.role !== "PATIENT" || !patient.isActive) {
    throw new AppError(403, "Only active patients can book appointments");
  }

  await assertNoActiveAppointmentForMobile(patient.id, input.phone, {
    ignoreOpenOtpHolds: Boolean(input.holdForOtp),
  });

  const bookingPhone = await bookingPhoneForPatient(patient.id, input.phone);

  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: input.doctorId },
    include: {
      user: true,
      specialty: true,
    },
  });

  if (!profile || !profile.user.isActive || profile.user.role !== "DOCTOR") {
    throw new AppError(404, "Doctor not found");
  }

  const appointment = await prisma.$transaction(async (tx) => {
    const slot = await tx.availabilitySlot.findUnique({
      where: { id: input.slotId },
    });

    if (!slot || slot.doctorId !== profile.id) {
      throw new AppError(404, "Time slot not found for this doctor");
    }
    if (slot.startsAt.getTime() <= Date.now()) {
      throw new AppError(400, "This time slot has already passed");
    }

    const claimed = await tx.availabilitySlot.updateMany({
      where: { id: slot.id, isBooked: false },
      data: { isBooked: true },
    });
    if (claimed.count === 0) {
      throw new AppError(409, "This time slot is no longer available");
    }

    const reference = await generateAppointmentReference(tx);

    return tx.appointment.create({
      data: {
        reference,
        patientId: patient.id,
        doctorUserId: profile.userId,
        slotId: slot.id,
        startsAt: slot.startsAt,
        durationMinutes: 30,
        mode: "IN_CLINIC",
        reason: input.reason?.trim() || "",
        fee: profile.fee,
        clinic: profile.clinic,
        specialtyName: profile.specialty.name,
        status: input.holdForOtp ? "PENDING" : "CONFIRMED",
        bookingPhone,
      },
      include: appointmentInclude,
    });
  });

  await recordAppointmentStatus({
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    doctorUserId: appointment.doctorUserId,
    fromStatus: "",
    toStatus: appointment.status,
    occurredAt: appointment.createdAt,
  });

  if (!input.holdForOtp) {
    await createMessagesForAppointment(appointment);
    await logAppointmentBooked(appointment);
    await logAppointmentBookedForDoctor(appointment);
  }

  return toPublicAppointment(appointment);
}

export async function confirmHeldAppointment(appointmentId: string) {
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!existing || existing.status !== "PENDING") {
      throw new AppError(409, "This appointment is not waiting for a verification code.");
    }
    return tx.appointment.update({
      where: { id: appointmentId },
      data: { status: "CONFIRMED" },
      include: appointmentInclude,
    });
  });

  await recordAppointmentStatus({
    appointmentId: updated.id,
    patientId: updated.patientId,
    doctorUserId: updated.doctorUserId,
    fromStatus: "PENDING",
    toStatus: "CONFIRMED",
  });
  await createMessagesForAppointment(updated);
  await logAppointmentBooked(updated);
  await logAppointmentBookedForDoctor(updated);
  return toPublicAppointment(updated);
}

export async function cancelOtpHold(appointmentId: string) {
  const existing = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!existing || existing.status !== "PENDING") return;

  await prisma.$transaction(async (tx) => {
    await tx.availabilitySlot.update({
      where: { id: existing.slotId },
      data: { isBooked: false },
    });
    // Remove the unconfirmed hold so this slot can be booked again.
    await tx.appointment.delete({ where: { id: appointmentId } });
  });
}

/** Drop pending voice holds whose code has expired so the slot can be booked again. */
export async function releaseExpiredOtpHolds() {
  const stale = await prisma.appointmentOtp.findMany({
    where: {
      usedAt: null,
      expiresAt: { lt: new Date() },
      appointment: { status: "PENDING" },
    },
    select: { id: true, appointmentId: true },
  });

  for (const row of stale) {
    await prisma.appointmentOtp.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });
    await cancelOtpHold(row.appointmentId);
  }
}

export async function getPublicAppointmentById(appointmentId: string) {
  const row = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });
  if (!row) return null;
  return toPublicAppointment(row);
}

export async function getAppointmentForPatient(appointmentId: string, patientId: string) {
  const row = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });

  if (!row || row.patientId !== patientId) {
    throw new AppError(404, "Appointment not found");
  }

  return toPublicAppointment(row);
}

export async function listAppointmentsForPatient(patientId: string) {
  const rows = await prisma.appointment.findMany({
    where: { patientId },
    include: appointmentInclude,
    orderBy: { startsAt: "asc" },
  });

  return rows.map(toPublicAppointment);
}

export async function listAppointmentsForDoctor(doctorUserId: string) {
  const doctor = await prisma.user.findUnique({ where: { id: doctorUserId } });
  if (!doctor || doctor.role !== "DOCTOR" || !doctor.isActive) {
    throw new AppError(403, "Only active doctors can view appointments");
  }

  await syncDoctorAppointmentInvoices(doctorUserId);

  const rows = await prisma.appointment.findMany({
    where: { doctorUserId },
    include: appointmentInclude,
    orderBy: { startsAt: "asc" },
  });

  return rows.map(toPublicAppointment);
}

export async function getAppointmentForDoctor(appointmentId: string, doctorUserId: string) {
  const row = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: appointmentInclude,
  });

  if (!row || row.doctorUserId !== doctorUserId) {
    throw new AppError(404, "Appointment not found");
  }

  return toPublicAppointment(row);
}

async function updateAppointmentStatus(
  appointmentId: string,
  statusInput: PublicAppointment["status"],
  options?: { doctorUserId?: string },
) {
  const nextStatus = STATUS_MAP[statusInput];
  if (!nextStatus) {
    throw new AppError(400, "Invalid appointment status");
  }

  const existing = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true },
  });
  if (!existing) {
    throw new AppError(404, "Appointment not found");
  }
  if (options?.doctorUserId && existing.doctorUserId !== options.doctorUserId) {
    throw new AppError(404, "Appointment not found");
  }

  if (existing.status === nextStatus) {
    const current = await prisma.appointment.findUnique({
      where: { id: existing.id },
      include: appointmentInclude,
    });
    return toPublicAppointment(current!);
  }

  const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new AppError(
      400,
      `Cannot change status from ${toPublicStatus(existing.status)} to ${statusInput}`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (nextStatus === "CANCELLED") {
      await tx.availabilitySlot.update({
        where: { id: existing.slotId },
        data: { isBooked: false },
      });
    }

    return tx.appointment.update({
      where: { id: existing.id },
      data: { status: nextStatus },
      include: appointmentInclude,
    });
  });

  await recordAppointmentStatus({
    appointmentId: updated.id,
    patientId: updated.patientId,
    doctorUserId: updated.doctorUserId,
    fromStatus: existing.status,
    toStatus: nextStatus,
  });

  if (nextStatus === "CANCELLED") {
    await logAppointmentCancelledForDoctor(updated);
    await cancelPendingReminders(updated.id);
  } else if (nextStatus === "COMPLETED" || nextStatus === "PENDING") {
    await cancelPendingReminders(updated.id);
  } else if (nextStatus === "CONFIRMED") {
    await createMessagesForAppointment(updated);
    await scheduleAppointmentReminders(updated.id);
  }

  return toPublicAppointment(updated);
}

export async function updateAppointmentStatusForDoctor(
  appointmentId: string,
  doctorUserId: string,
  statusInput: PublicAppointment["status"],
) {
  return updateAppointmentStatus(appointmentId, statusInput, { doctorUserId });
}

export async function updateAppointmentStatusForAdmin(
  appointmentId: string,
  statusInput: PublicAppointment["status"],
) {
  return updateAppointmentStatus(appointmentId, statusInput);
}

export async function rescheduleAppointmentForAdmin(appointmentId: string, slotId: string) {
  const existing = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, doctorUser: true },
  });
  if (!existing) {
    throw new AppError(404, "Appointment not found");
  }
  if (existing.status === "CANCELLED" || existing.status === "COMPLETED") {
    throw new AppError(400, `Cannot reschedule a ${toPublicStatus(existing.status)} appointment`);
  }

  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: existing.doctorUserId },
  });
  if (!profile) {
    throw new AppError(404, "Doctor profile not found");
  }

  const previousStartsAt = existing.startsAt;

  const updated = await prisma.$transaction(async (tx) => {
    const newSlot = await tx.availabilitySlot.findUnique({ where: { id: slotId } });
    if (!newSlot || newSlot.doctorId !== profile.id) {
      throw new AppError(404, "Time slot not found for this doctor");
    }
    if (newSlot.startsAt.getTime() <= Date.now()) {
      throw new AppError(400, "This time slot has already passed");
    }
    if (newSlot.id === existing.slotId) {
      throw new AppError(400, "Choose a different time slot to reschedule");
    }

    const claimed = await tx.availabilitySlot.updateMany({
      where: { id: newSlot.id, isBooked: false },
      data: { isBooked: true },
    });
    if (claimed.count === 0) {
      throw new AppError(409, "This time slot is no longer available");
    }

    await tx.availabilitySlot.update({
      where: { id: existing.slotId },
      data: { isBooked: false },
    });

    return tx.appointment.update({
      where: { id: existing.id },
      data: {
        slotId: newSlot.id,
        startsAt: newSlot.startsAt,
        status: "CONFIRMED",
      },
      include: appointmentInclude,
    });
  });

  await logAppointmentRescheduledForDoctor(updated, previousStartsAt);
  await createMessagesForAppointment(updated);
  await scheduleAppointmentReminders(updated.id);

  return toPublicAppointment(updated);
}

export async function listOpenSlotsForDoctorAdmin(doctorUserId: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    include: { user: true },
  });
  if (!profile || profile.user.role !== "DOCTOR") {
    throw new AppError(404, "Doctor not found");
  }

  const now = new Date();
  const rows = await prisma.availabilitySlot.findMany({
    where: {
      doctorId: profile.id,
      isBooked: false,
      startsAt: { gt: now },
    },
    orderBy: { startsAt: "asc" },
    take: 200,
  });

  return rows.map((row) => ({
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    date: formatDateLabel(row.startsAt),
    time: formatTimeLabel(row.startsAt),
    isBooked: row.isBooked,
    startsAtLocal: formatClinicInput(row.startsAt),
  }));
}

function toStoredMode(mode: PublicAppointment["mode"] | undefined, fallback: AppointmentMode): AppointmentMode {
  if (mode === "Video call") return "VIDEO_CALL";
  if (mode === "In clinic") return "IN_CLINIC";
  return fallback;
}

async function sendNextVisitConfirmation(appointment: AppointmentWithPeople) {
  const phone = normalizePhone(appointment.bookingPhone) || (await bookingPhoneForPatient(appointment.patientId));
  if (!phone) {
    return "Next visit saved. No booking mobile was on file, so the confirmation text was not sent.";
  }
  const when = `${formatClinicDateTime(appointment.startsAt)} ${clinicTimeZoneLabel(appointment.startsAt)}`;
  const visitType = appointment.mode === "VIDEO_CALL" ? "Video call" : "In clinic";
  const reason = appointment.reason.trim();
  const body = `Qubetech: your next visit is confirmed. ${appointment.reference} with ${appointment.doctorUser.fullName} at ${appointment.clinic || "the clinic"} on ${when}. Type: ${visitType}.${reason ? ` Details: ${reason.slice(0, 180)}` : ""}`;
  try {
    await sendPatientReminderSms({ toPhone: phone, body, purpose: "confirmation" });
    return `Next visit ${appointment.reference} is confirmed. A confirmation text was sent to the patient's booking mobile.`;
  } catch (error) {
    console.error(
      "[appointments] Next-visit confirmation SMS failed:",
      error instanceof Error ? error.message : error,
    );
    return `Next visit ${appointment.reference} is saved. The confirmation text could not be delivered.`;
  }
}

export async function createFollowUpAppointmentForDoctor(input: {
  doctorUserId: string;
  parentAppointmentId: string;
  slotId: string;
  reason?: string;
  mode?: PublicAppointment["mode"];
}) {
  const parent = await prisma.appointment.findUnique({
    where: { id: input.parentAppointmentId },
    include: {
      patient: true,
      doctorUser: true,
      followUpOf: { select: { id: true, reference: true } },
    },
  });

  if (!parent || parent.doctorUserId !== input.doctorUserId) {
    throw new AppError(404, "Previous appointment not found");
  }
  if (parent.status === "CANCELLED") {
    throw new AppError(400, "Cannot schedule a follow-up for a cancelled appointment");
  }

  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: input.doctorUserId },
    include: { specialty: true, user: true },
  });
  if (!profile || !profile.user.isActive) {
    throw new AppError(403, "Only active doctors can schedule follow-ups");
  }

  const reason =
    input.reason?.trim() ||
    `Follow-up after ${parent.reference}${parent.reason ? ` — ${parent.reason}` : ""}`;

  const appointment = await prisma.$transaction(async (tx) => {
    const slot = await tx.availabilitySlot.findUnique({ where: { id: input.slotId } });
    if (!slot || slot.doctorId !== profile.id) {
      throw new AppError(404, "Time slot not found for this doctor");
    }
    if (slot.startsAt.getTime() <= Date.now()) {
      throw new AppError(400, "This time slot has already passed");
    }
    if (slot.startsAt.getTime() <= parent.startsAt.getTime()) {
      throw new AppError(400, "Follow-up must be scheduled after the previous appointment");
    }

    const claimed = await tx.availabilitySlot.updateMany({
      where: { id: slot.id, isBooked: false },
      data: { isBooked: true },
    });
    if (claimed.count === 0) {
      throw new AppError(409, "This time slot is no longer available");
    }

    const reference = await generateAppointmentReference(tx);
    return tx.appointment.create({
      data: {
        reference,
        patientId: parent.patientId,
        doctorUserId: profile.userId,
        slotId: slot.id,
        startsAt: slot.startsAt,
        durationMinutes: parent.durationMinutes,
        mode: toStoredMode(input.mode, parent.mode),
        reason,
        fee: profile.fee,
        clinic: profile.clinic,
        specialtyName: profile.specialty.name,
        status: "CONFIRMED",
        followUpOfId: parent.id,
        bookingPhone: parent.bookingPhone || (await bookingPhoneForPatient(parent.patientId)),
      },
      include: appointmentInclude,
    });
  });

  await recordAppointmentStatus({
    appointmentId: appointment.id,
    patientId: appointment.patientId,
    doctorUserId: appointment.doctorUserId,
    fromStatus: "",
    toStatus: "CONFIRMED",
    occurredAt: appointment.createdAt,
  });
  await createMessagesForAppointment(appointment);
  await logAppointmentBooked(appointment);
  await logAppointmentBookedForDoctor(appointment);
  const message = await sendNextVisitConfirmation(appointment);

  return { appointment: toPublicAppointment(appointment), message };
}
