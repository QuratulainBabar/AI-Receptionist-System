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
  /** booking | cancellation | reschedule | report */
  eventType: string;
  unread: boolean;
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
    eventType: row.eventType,
    unread: row.readAt == null,
  };
}

async function assertActiveDoctor(doctorUserId: string) {
  const doctor = await prisma.user.findUnique({ where: { id: doctorUserId } });
  if (!doctor || doctor.role !== "DOCTOR" || !doctor.isActive) {
    throw new AppError(403, "Only active doctors can view notifications");
  }
  return doctor;
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
  const existing = await prisma.doctorNotification.findUnique({
    where: {
      doctorUserId_eventType_relatedId: {
        doctorUserId: input.doctorUserId,
        eventType: input.eventType,
        relatedId: input.relatedId,
      },
    },
  });

  if (!existing) {
    return prisma.doctorNotification.create({
      data: {
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

  // Preserve readAt when content is unchanged (list/ensure must not revive badges).
  // Re-open as unread only when the event meaningfully changes (e.g. pending → confirmed).
  const contentChanged =
    existing.kind !== input.kind ||
    existing.title !== input.title ||
    existing.detail !== input.detail;

  return prisma.doctorNotification.update({
    where: { id: existing.id },
    data: {
      kind: input.kind,
      title: input.title,
      detail: input.detail,
      occurredAt: input.occurredAt,
      ...(contentChanged ? { readAt: null } : {}),
    },
  });
}

/**
 * Doctor "new booking" alert — only after the appointment is CONFIRMED.
 * PENDING voice OTP holds must not create or upgrade a dashboard notification.
 */
export async function logAppointmentBookedForDoctor(appointment: AppointmentWithPatient) {
  if (appointment.status === "PENDING") {
    console.log(
      `[notifications] Skipping doctor alert for PENDING OTP hold ${appointment.id} (${appointment.reference})`,
    );
    return null;
  }
  if (appointment.status !== "CONFIRMED") {
    return null;
  }
  return upsertNotification({
    doctorUserId: appointment.doctorUserId,
    kind: "new",
    eventType: "booking",
    relatedId: appointment.id,
    title: `New booking — ${appointment.patient.fullName}`,
    detail: bookingDetail(appointment),
    occurredAt: appointment.updatedAt,
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
  // Only backfill missing rows — never rewrite existing notifications on every list poll.
  const existing = await prisma.doctorNotification.findMany({
    where: { doctorUserId },
    select: { eventType: true, relatedId: true },
  });
  const known = new Set(
    existing.map((row) => `${row.eventType}:${row.relatedId ?? ""}`),
  );

  const appointments = await prisma.appointment.findMany({
    where: { doctorUserId },
    include: { patient: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  for (const appointment of appointments) {
    // Only confirmed bookings — never backfill PENDING OTP holds onto the doctor feed.
    if (appointment.status === "CONFIRMED") {
      if (!known.has(`booking:${appointment.id}`)) {
        await logAppointmentBookedForDoctor(appointment);
        known.add(`booking:${appointment.id}`);
      }
    }

    if (appointment.status === "CANCELLED") {
      if (!known.has(`cancellation:${appointment.id}`)) {
        await logAppointmentCancelledForDoctor(appointment);
        known.add(`cancellation:${appointment.id}`);
      }
    }
  }

  const patientIds = [...new Set(appointments.map((appointment) => appointment.patientId))];
  if (!patientIds.length) return;

  const records = await prisma.patientMedicalRecord.findMany({
    where: { userId: { in: patientIds } },
    include: { user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  for (const record of records) {
    if (known.has(`report:${record.id}`)) continue;
    await logReportUploadedForDoctors(record);
    known.add(`report:${record.id}`);
  }
}

export async function listNotificationsForDoctor(doctorUserId: string) {
  await assertActiveDoctor(doctorUserId);
  await ensureNotificationsForDoctor(doctorUserId);

  const rows = await prisma.doctorNotification.findMany({
    where: { doctorUserId },
    orderBy: { occurredAt: "desc" },
  });

  return rows.map(toPublic);
}

/** Marks every unread notification as read when the doctor opens the Notifications page. */
export async function markAllNotificationsReadForDoctor(doctorUserId: string) {
  await assertActiveDoctor(doctorUserId);

  const result = await prisma.doctorNotification.updateMany({
    where: { doctorUserId, readAt: null },
    data: { readAt: new Date() },
  });

  return { marked: result.count };
}

/** Mark a single notification as read when the doctor opens/views it. */
export async function markNotificationReadForDoctor(doctorUserId: string, notificationId: string) {
  await assertActiveDoctor(doctorUserId);

  const row = await prisma.doctorNotification.findFirst({
    where: { id: notificationId, doctorUserId },
  });
  if (!row) throw new AppError(404, "Notification not found");
  if (row.readAt) return { marked: 0, id: row.id };

  await prisma.doctorNotification.update({
    where: { id: row.id },
    data: { readAt: new Date() },
  });
  return { marked: 1, id: row.id };
}
