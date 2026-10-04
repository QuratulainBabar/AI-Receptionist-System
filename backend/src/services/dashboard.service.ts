import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { listActivitiesForPatient, type PublicActivity } from "./activity.service.js";
import {
  listAppointmentsForPatient,
  type PublicAppointment,
} from "./appointments.service.js";
import { listSpecialties, type PublicSpecialty } from "./doctors.service.js";
import { ensureMessagesForPatient, listMessagesForPatient } from "./messages.service.js";

export type DashboardFollowUpDue = {
  value: string;
  detail: string;
};

export type DashboardNextAppointment = {
  value: string;
  detail: string;
  appointment: PublicAppointment;
};

export type PatientDashboard = {
  patientName: string;
  nextAppointment: DashboardNextAppointment | null;
  followUpDue: DashboardFollowUpDue | null;
  unreadMessages: number;
  recordsCount: number;
  upcomingAppointments: PublicAppointment[];
  popularSpecialties: PublicSpecialty[];
  recentActivity: PublicActivity[];
};

function isUpcoming(appointment: PublicAppointment, now: number) {
  if (appointment.status === "cancelled" || appointment.status === "completed") return false;
  return new Date(appointment.startsAt).getTime() >= now;
}

function formatShortDate(date: Date) {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function formatDueLabel(dueAt: Date, now = new Date()) {
  const diffMs = dueAt.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "1 day";
  if (diffDays < 7) return `${diffDays} days`;
  if (diffDays < 14) return "1 week";
  if (diffDays < 21) return "2 weeks";
  if (diffDays < 28) return "3 weeks";

  const weeks = Math.round(diffDays / 7);
  return `${weeks} weeks`;
}

function recheckDetail(reason: string, specialtyName: string) {
  if (reason.toLowerCase().includes("blood pressure")) return "Blood pressure recheck";
  return `${specialtyName} recheck`;
}

async function getFollowUpDue(patientId: string): Promise<DashboardFollowUpDue | null> {
  await ensureMessagesForPatient(patientId);

  const recheckRows = await prisma.followUpMessage.findMany({
    where: { patientId, kind: "recheck" },
    include: { appointment: true },
    orderBy: { sentAt: "desc" },
  });

  const now = Date.now();
  let best: { dueAt: Date; detail: string } | null = null;

  for (const row of recheckRows) {
    if (!row.appointment) continue;
    if (row.appointment.status === "CANCELLED") continue;

    const dueAt = new Date(row.appointment.startsAt);
    dueAt.setDate(dueAt.getDate() + 14);

    const detail = recheckDetail(row.appointment.reason, row.appointment.specialtyName);
    const candidate = { dueAt, detail };

    if (!best) {
      best = candidate;
      continue;
    }

    const bestFuture = best.dueAt.getTime() >= now;
    const candidateFuture = dueAt.getTime() >= now;

    if (candidateFuture && !bestFuture) {
      best = candidate;
      continue;
    }

    if (candidateFuture === bestFuture) {
      const bestDistance = Math.abs(best.dueAt.getTime() - now);
      const candidateDistance = Math.abs(dueAt.getTime() - now);
      if (candidateDistance < bestDistance) best = candidate;
    }
  }

  if (!best) return null;

  return {
    value: formatDueLabel(best.dueAt),
    detail: best.detail,
  };
}

export async function getPatientDashboard(patientId: string): Promise<PatientDashboard> {
  const patient = await prisma.user.findUnique({ where: { id: patientId } });
  if (!patient || patient.role !== "PATIENT") {
    throw new AppError(404, "Patient not found");
  }

  const now = Date.now();

  const [appointments, messages, specialties, recordsCount, recentActivity, followUpDue] =
    await Promise.all([
      listAppointmentsForPatient(patientId),
      listMessagesForPatient(patientId),
      listSpecialties(),
      prisma.patientMedicalRecord.count({ where: { userId: patientId } }),
      listActivitiesForPatient(patientId),
      getFollowUpDue(patientId),
    ]);

  const upcoming = appointments
    .filter((appointment) => isUpcoming(appointment, now))
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

  const next = upcoming[0] ?? null;
  const nextAppointment = next
    ? {
        value: formatShortDate(new Date(next.startsAt)),
        detail: `${next.doctorName} · ${next.time}`,
        appointment: next,
      }
    : null;

  const unreadMessages = messages.filter((message) => message.status !== "Opened").length;

  const popularSpecialties = [...specialties]
    .sort((a, b) => b.doctors - a.doctors || a.name.localeCompare(b.name))
    .slice(0, 4);

  return {
    patientName: patient.fullName,
    nextAppointment,
    followUpDue,
    unreadMessages,
    recordsCount,
    upcomingAppointments: upcoming.slice(0, 5),
    popularSpecialties,
    recentActivity: recentActivity.slice(0, 5),
  };
}
