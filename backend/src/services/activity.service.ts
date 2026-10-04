import type { Appointment, PatientActivity, PatientMedicalHistory, PatientMedicalRecord, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type PublicActivity = {
  id: string;
  label: string;
  detail: string;
  time: string;
  type: string;
};

export const ActivityType = {
  APPOINTMENT_BOOKED: "appointment_booked",
  REPORT_UPLOADED: "report_uploaded",
  HISTORY_UPDATED: "history_updated",
  VISIT_COMPLETED: "visit_completed",
  APPOINTMENT_CANCELLED: "appointment_cancelled",
} as const;

function formatActivityTime(date: Date) {
  return date
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .replace(",", "");
}

function toPublic(row: PatientActivity): PublicActivity {
  return {
    id: row.id,
    label: row.label,
    detail: row.detail,
    time: formatActivityTime(row.occurredAt),
    type: row.type,
  };
}

export async function logPatientActivity(input: {
  userId: string;
  type: string;
  label: string;
  detail: string;
  relatedId?: string | null;
  occurredAt?: Date;
}) {
  if (input.relatedId) {
    const existing = await prisma.patientActivity.findFirst({
      where: {
        userId: input.userId,
        type: input.type,
        relatedId: input.relatedId,
      },
    });
    if (existing) return existing;
  }

  return prisma.patientActivity.create({
    data: {
      userId: input.userId,
      type: input.type,
      label: input.label,
      detail: input.detail,
      relatedId: input.relatedId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
    },
  });
}

export async function logAppointmentBooked(appointment: Appointment & { doctorUser: User }) {
  return logPatientActivity({
    userId: appointment.patientId,
    type: ActivityType.APPOINTMENT_BOOKED,
    label: "Appointment booked",
    detail: `${appointment.reference} with ${appointment.doctorUser.fullName} via AI receptionist`,
    relatedId: appointment.id,
    occurredAt: appointment.createdAt,
  });
}

export async function logReportUploaded(record: PatientMedicalRecord) {
  return logPatientActivity({
    userId: record.userId,
    type: ActivityType.REPORT_UPLOADED,
    label: "Report uploaded",
    detail: record.fileName,
    relatedId: record.id,
    occurredAt: record.createdAt,
  });
}

export async function logHistoryUpdated(
  userId: string,
  detail: string,
  occurredAt: Date = new Date(),
) {
  return logPatientActivity({
    userId,
    type: ActivityType.HISTORY_UPDATED,
    label: "Medical history updated",
    detail,
    relatedId: null,
    occurredAt,
  });
}

function historyChangeDetail(
  previous: PatientMedicalHistory | null,
  next: PatientMedicalHistory,
) {
  if (!previous) return "Medical history created";

  const addedAllergy = next.allergies.find((item) => !previous.allergies.includes(item));
  if (addedAllergy) return `Added allergy: ${addedAllergy}`;

  const addedCondition = next.conditions.find((item) => !previous.conditions.includes(item));
  if (addedCondition) return `Added condition: ${addedCondition}`;

  const addedMedication = next.medications.find((item) => !previous.medications.includes(item));
  if (addedMedication) return `Updated medication: ${addedMedication}`;

  if (previous.symptoms !== next.symptoms && next.symptoms) {
    return "Updated current symptoms";
  }

  return "Updated patient medical history";
}

export async function logHistoryUpsert(
  userId: string,
  previous: PatientMedicalHistory | null,
  next: PatientMedicalHistory,
) {
  return logHistoryUpdated(userId, historyChangeDetail(previous, next), next.updatedAt);
}

async function ensureActivitiesForPatient(userId: string) {
  const [appointments, records, history] = await Promise.all([
    prisma.appointment.findMany({
      where: { patientId: userId },
      include: { doctorUser: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.patientMedicalRecord.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.patientMedicalHistory.findUnique({ where: { userId } }),
  ]);

  for (const appointment of appointments) {
    await logAppointmentBooked(appointment);

    if (appointment.status === "CANCELLED") {
      await logPatientActivity({
        userId,
        type: ActivityType.APPOINTMENT_CANCELLED,
        label: "Appointment cancelled",
        detail: `${appointment.reference} with ${appointment.doctorUser.fullName}`,
        relatedId: `cancel:${appointment.id}`,
        occurredAt: appointment.updatedAt,
      });
    }

    if (
      appointment.status === "COMPLETED" ||
      (appointment.status === "CONFIRMED" && appointment.startsAt.getTime() < Date.now())
    ) {
      await logPatientActivity({
        userId,
        type: ActivityType.VISIT_COMPLETED,
        label: "Visit completed",
        detail: `${appointment.specialtyName} visit with ${appointment.doctorUser.fullName}`,
        relatedId: `visit:${appointment.id}`,
        occurredAt: appointment.startsAt,
      });
    }
  }

  for (const record of records) {
    await logReportUploaded(record);
  }

  if (history) {
    const existingHistory = await prisma.patientActivity.findFirst({
      where: { userId, type: ActivityType.HISTORY_UPDATED },
    });
    if (!existingHistory) {
      await logHistoryUpdated(userId, "Medical history on file", history.updatedAt);
    }
  }
}

export async function listActivitiesForPatient(userId: string) {
  await ensureActivitiesForPatient(userId);

  const rows = await prisma.patientActivity.findMany({
    where: { userId },
    orderBy: { occurredAt: "desc" },
  });

  return rows.map(toPublic);
}
