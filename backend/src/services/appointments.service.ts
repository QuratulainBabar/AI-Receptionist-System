import type { Appointment, AppointmentMode, AppointmentStatus, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { createMessagesForAppointment } from "./messages.service.js";
import { logAppointmentBooked } from "./activity.service.js";
import {
  logAppointmentBookedForDoctor,
  logAppointmentCancelledForDoctor,
  logAppointmentRescheduledForDoctor,
} from "./notifications.service.js";

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
};

type AppointmentWithPeople = Appointment & {
  patient: User;
  doctorUser: User;
  followUpOf?: { id: string; reference: string } | null;
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
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeLabel(date: Date) {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
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
  };
}

const appointmentInclude = {
  patient: true,
  doctorUser: true,
  followUpOf: { select: { id: true, reference: true } },
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

export async function createAppointment(input: {
  patientId: string;
  doctorId: string;
  slotId: string;
  reason?: string;
}) {
  const patient = await prisma.user.findUnique({ where: { id: input.patientId } });
  if (!patient || patient.role !== "PATIENT" || !patient.isActive) {
    throw new AppError(403, "Only active patients can book appointments");
  }

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
        status: "CONFIRMED",
      },
      include: appointmentInclude,
    });
  });

  await createMessagesForAppointment(appointment);
  await logAppointmentBooked(appointment);
  await logAppointmentBookedForDoctor(appointment);

  return toPublicAppointment(appointment);
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

  if (nextStatus === "CANCELLED") {
    await logAppointmentCancelledForDoctor(updated);
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
  }));
}

export async function createFollowUpAppointmentForDoctor(input: {
  doctorUserId: string;
  parentAppointmentId: string;
  slotId: string;
  reason?: string;
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
        durationMinutes: 30,
        mode: parent.mode,
        reason,
        fee: profile.fee,
        clinic: profile.clinic,
        specialtyName: profile.specialty.name,
        status: "CONFIRMED",
        followUpOfId: parent.id,
      },
      include: appointmentInclude,
    });
  });

  await createMessagesForAppointment(appointment);
  await logAppointmentBooked(appointment);
  await logAppointmentBookedForDoctor(appointment);

  return toPublicAppointment(appointment);
}
