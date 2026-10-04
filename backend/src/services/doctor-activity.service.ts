import type { Appointment, PatientMedicalRecord, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";

export type PublicDoctorActivity = {
  id: string;
  label: string;
  detail: string;
  time: string;
  type: string;
};

type AppointmentWithPatient = Appointment & { patient: User };
type RecordWithPatient = PatientMedicalRecord & { user: User };

type ActivityDraft = {
  id: string;
  label: string;
  detail: string;
  type: string;
  occurredAt: Date;
};

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

function formatSlotWhen(date: Date) {
  const day = date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${day} ${time}`;
}

function toPublic(entry: ActivityDraft): PublicDoctorActivity {
  return {
    id: entry.id,
    label: entry.label,
    detail: entry.detail,
    time: formatActivityTime(entry.occurredAt),
    type: entry.type,
  };
}

function bookingActivity(appointment: AppointmentWithPatient): ActivityDraft {
  const reason = appointment.reason.trim() || "General consultation";
  return {
    id: `booking:${appointment.id}`,
    type: "booking",
    label: "New booking received",
    detail: `${appointment.reference} — ${appointment.patient.fullName} · ${reason}`,
    occurredAt: appointment.createdAt,
  };
}

function cancellationActivity(appointment: AppointmentWithPatient): ActivityDraft {
  return {
    id: `cancellation:${appointment.id}`,
    type: "cancellation",
    label: "Slot released",
    detail: `APT cancelled — ${appointment.patient.fullName} · ${formatSlotWhen(appointment.startsAt)}`,
    occurredAt: appointment.updatedAt,
  };
}

function visitCompletedActivity(appointment: AppointmentWithPatient): ActivityDraft {
  return {
    id: `visit:${appointment.id}`,
    type: "visit_completed",
    label: "Visit completed",
    detail: `${appointment.reference} prep notes saved for ${appointment.patient.fullName}`,
    occurredAt: appointment.startsAt,
  };
}

function reportActivity(record: RecordWithPatient): ActivityDraft {
  return {
    id: `report:${record.id}`,
    type: "report",
    label: "Patient report reviewed",
    detail: `${record.fileName} — ${record.user.fullName}`,
    occurredAt: record.createdAt,
  };
}

function isVisitCompleted(appointment: Appointment, now = Date.now()) {
  if (appointment.status === "CANCELLED") return false;
  if (appointment.status === "COMPLETED") return true;
  return (
    (appointment.status === "CONFIRMED" || appointment.status === "PENDING") &&
    appointment.startsAt.getTime() < now
  );
}

export async function listActivitiesForDoctor(doctorUserId: string) {
  const doctor = await prisma.user.findUnique({ where: { id: doctorUserId } });
  if (!doctor || doctor.role !== "DOCTOR" || !doctor.isActive) {
    throw new AppError(403, "Only active doctors can view activity history");
  }

  const appointments = await prisma.appointment.findMany({
    where: { doctorUserId },
    include: { patient: true },
    orderBy: { createdAt: "desc" },
  });

  const drafts: ActivityDraft[] = [];

  for (const appointment of appointments) {
    drafts.push(bookingActivity(appointment));

    if (appointment.status === "CANCELLED") {
      drafts.push(cancellationActivity(appointment));
    }

    if (isVisitCompleted(appointment)) {
      drafts.push(visitCompletedActivity(appointment));
    }
  }

  const patientIds = [...new Set(appointments.map((appointment) => appointment.patientId))];
  if (patientIds.length) {
    const records = await prisma.patientMedicalRecord.findMany({
      where: { userId: { in: patientIds } },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    });

    for (const record of records) {
      drafts.push(reportActivity(record));
    }
  }

  drafts.sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());

  return drafts.map(toPublic);
}
