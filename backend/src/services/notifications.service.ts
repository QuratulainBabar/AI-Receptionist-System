import type { Appointment, DoctorNotification, PatientMedicalRecord, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { formatClinicDateTime } from "../utils/clinic-time.js";

export type NotificationKind = "new" | "changed" | "cancelled";

export type PublicDoctorNotification = {
  id: string;
  title: string;
  detail: string;
  time: string;
  kind: NotificationKind;
};

type AppointmentWithPatient = Appointment & { patient: User };

function formatNotificationDateTime(date: Date) {
  return formatClinicDateTime(date);
}

function formatRelativeTime(date: Date, now = new Date()) {
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} min ago`;

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const startToday = new Date(now);
  startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday);
  startYesterday.setDate(startYesterday.getDate() - 1);

  if (date >= startYesterday) return "Yesterday";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toPublic(row: DoctorNotification): PublicDoctorNotification {
  return {
    id: row.id,
    title: row.title,
    detail: row.detail,
    time: formatRelativeTime(row.occurredAt),
    kind: row.kind as NotificationKind,
  };
}

function bookingDetail(appointment: AppointmentWithPatient) {
  const when = formatNotificationDateTime(appointment.startsAt);
  const reason = appointment.reason.trim() || "General consultation";
  return `${when} · ${reason}`;
}

async function upsertNotification(input: {
  doctorUserId: string;
  kind: NotificationKind;
  eventType: string;
  title: string;
  detail: string;
  relatedId: string;
  occurredAt: Date;
}) {
  return prisma.doctorNotification.upsert({
    where: {
      doctorUserId_eventType_relatedId: {
        doctorUserId: input.doctorUserId,
        eventType: input.eventType,
        relatedId: input.relatedId,
      },
    },
    update: {
      kind: input.kind,
      title: input.title,
      detail: input.detail,
      occurredAt: input.occurredAt,
    },
    create: {
      doctorUserId: input.doctorUserId,
      kind: input.kind,
      eventType: input.eventType,
      title: input.title,
      detail: input.detail,
      relatedId: input.relatedId,
      occurredAt: input.occurredAt,
    },
  });
}

export async function logAppointmentBookedForDoctor(appointment: AppointmentWithPatient) {
  return upsertNotification({
    doctorUserId: appointment.doctorUserId,
    kind: "new",
    eventType: "booking",
    relatedId: appointment.id,
    title: `New booking — ${appointment.patient.fullName}`,
    detail: bookingDetail(appointment),
    occurredAt: appointment.createdAt,
  });
}

export async function logAppointmentCancelledForDoctor(appointment: AppointmentWithPatient) {
  return upsertNotification({
    doctorUserId: appointment.doctorUserId,
    kind: "cancelled",
    eventType: "cancellation",
    relatedId: appointment.id,
    title: `Cancelled — ${appointment.patient.fullName}`,
    detail: `${formatNotificationDateTime(appointment.startsAt)} slot is now free`,
    occurredAt: appointment.updatedAt,
  });
}

export async function logAppointmentRescheduledForDoctor(
  appointment: AppointmentWithPatient,
  previousStartsAt: Date,
) {
  const from = formatNotificationDateTime(previousStartsAt);
  const to = formatNotificationDateTime(appointment.startsAt);
  return upsertNotification({
    doctorUserId: appointment.doctorUserId,
    kind: "changed",
    eventType: "reschedule",
    relatedId: appointment.id,
    title: `Rescheduled — ${appointment.patient.fullName}`,
    detail: `Moved from ${from} to ${to}`,
    occurredAt: appointment.updatedAt,
  });
}

export async function logReportUploadedForDoctors(
  record: PatientMedicalRecord & { user: User },
  extra?: { appointmentReference?: string | null },
) {
  const doctors = await prisma.appointment.findMany({
    where: { patientId: record.userId },
    select: { doctorUserId: true },
    distinct: ["doctorUserId"],
  });

  const detail = extra?.appointmentReference
    ? `${record.fileName} uploaded for ${extra.appointmentReference}`
    : `${record.fileName} added to their records`;

  await Promise.all(
    doctors.map(({ doctorUserId }) =>
      upsertNotification({
        doctorUserId,
        kind: "new",
        eventType: "report",
        relatedId: record.id,
        title: `Report uploaded — ${record.user.fullName}`,
        detail,
        occurredAt: record.createdAt,
      }),
    ),
  );
}

async function ensureNotificationsForDoctor(doctorUserId: string) {
  const appointments = await prisma.appointment.findMany({
    where: { doctorUserId },
    include: { patient: true },
    orderBy: { createdAt: "desc" },
  });

  for (const appointment of appointments) {
    if (appointment.status === "PENDING") continue;
    await logAppointmentBookedForDoctor(appointment);

    if (appointment.status === "CANCELLED") {
      await logAppointmentCancelledForDoctor(appointment);
    }
  }

  const patientIds = [...new Set(appointments.map((appointment) => appointment.patientId))];
  if (!patientIds.length) return;

  const records = await prisma.patientMedicalRecord.findMany({
    where: { userId: { in: patientIds } },
    include: { user: true },
    orderBy: { createdAt: "desc" },
  });

  for (const record of records) {
    await logReportUploadedForDoctors(record);
  }
}

export async function listNotificationsForDoctor(doctorUserId: string) {
  const doctor = await prisma.user.findUnique({ where: { id: doctorUserId } });
  if (!doctor || doctor.role !== "DOCTOR" || !doctor.isActive) {
    throw new AppError(403, "Only active doctors can view notifications");
  }

  await ensureNotificationsForDoctor(doctorUserId);

  const rows = await prisma.doctorNotification.findMany({
    where: { doctorUserId },
    orderBy: { occurredAt: "desc" },
  });

  return rows.map(toPublic);
}
