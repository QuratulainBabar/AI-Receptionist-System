import type { Appointment, FollowUpMessage, MessageChannel, MessageStatus, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type PublicFollowUpMessage = {
  id: string;
  channel: "Email" | "SMS";
  subject: string;
  preview: string;
  sentAt: string;
  status: "Delivered" | "Scheduled" | "Opened";
  appointmentId?: string;
  appointmentReference?: string;
};

type AppointmentWithDoctor = Appointment & {
  doctorUser: User;
};

function toPublicChannel(channel: MessageChannel): PublicFollowUpMessage["channel"] {
  return channel === "SMS" ? "SMS" : "Email";
}

function toPublicStatus(status: MessageStatus): PublicFollowUpMessage["status"] {
  switch (status) {
    case "SCHEDULED":
      return "Scheduled";
    case "OPENED":
      return "Opened";
    default:
      return "Delivered";
  }
}

function formatSentAt(date: Date) {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).replace(",", "");
}

function formatVisitWhen(date: Date) {
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function toPublicMessage(
  row: FollowUpMessage & { appointment?: Appointment | null },
): PublicFollowUpMessage {
  return {
    id: row.id,
    channel: toPublicChannel(row.channel),
    subject: row.subject,
    preview: row.preview,
    sentAt: formatSentAt(row.sentAt),
    status: toPublicStatus(row.status),
    appointmentId: row.appointmentId ?? undefined,
    appointmentReference: row.appointment?.reference,
  };
}

function buildConfirmationContent(appointment: AppointmentWithDoctor) {
  return {
    kind: "confirmation",
    channel: "EMAIL" as const,
    status: "OPENED" as const,
    subject: `Your appointment is confirmed — ${appointment.reference}`,
    preview: `${formatVisitWhen(appointment.startsAt)} with ${appointment.doctorUser.fullName} at ${appointment.clinic}.`,
    sentAt: appointment.createdAt,
  };
}

function buildReminderContent(appointment: AppointmentWithDoctor) {
  const reminderAt = new Date(appointment.startsAt);
  reminderAt.setDate(reminderAt.getDate() - 1);
  reminderAt.setHours(8, 0, 0, 0);

  const visitTime = appointment.startsAt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const isFutureReminder = reminderAt.getTime() > Date.now();

  return {
    kind: "reminder",
    channel: "SMS" as const,
    status: (isFutureReminder ? "SCHEDULED" : "DELIVERED") as MessageStatus,
    subject: `Reminder: visit tomorrow at ${visitTime}`,
    preview: "Please arrive 10 minutes early and bring your medication list.",
    sentAt: reminderAt,
  };
}

function buildRecheckContent(appointment: AppointmentWithDoctor) {
  const sentAt = new Date(appointment.createdAt);
  sentAt.setMinutes(sentAt.getMinutes() + 5);
  const doctorShort = appointment.doctorUser.fullName.replace(/^Dr\.\s+/, "Dr. ");

  return {
    kind: "recheck",
    channel: "EMAIL" as const,
    status: "DELIVERED" as const,
    subject: "Follow-up recheck recommended",
    preview: `${doctorShort} recommends a recheck after your ${appointment.specialtyName.toLowerCase()} visit. Reply to book another appointment.`,
    sentAt,
  };
}

export async function createMessagesForAppointment(
  appointment: AppointmentWithDoctor,
  client: typeof prisma = prisma,
) {
  const payloads: Array<{
    kind: string;
    channel: MessageChannel;
    status: MessageStatus;
    subject: string;
    preview: string;
    sentAt: Date;
  }> = [buildConfirmationContent(appointment), buildReminderContent(appointment)];

  if (appointment.reason.toLowerCase().includes("blood pressure") || appointment.specialtyName === "Cardiologist" || appointment.specialtyName === "Cardiology") {
    payloads.push(buildRecheckContent(appointment));
  }

  for (const payload of payloads) {
    await client.followUpMessage.upsert({
      where: {
        appointmentId_kind: {
          appointmentId: appointment.id,
          kind: payload.kind,
        },
      },
      update: {
        channel: payload.channel,
        status: payload.status,
        subject: payload.subject,
        preview: payload.preview,
        sentAt: payload.sentAt,
      },
      create: {
        patientId: appointment.patientId,
        appointmentId: appointment.id,
        kind: payload.kind,
        channel: payload.channel,
        status: payload.status,
        subject: payload.subject,
        preview: payload.preview,
        sentAt: payload.sentAt,
      },
    });
  }
}

export async function ensureMessagesForPatient(patientId: string) {
  const appointments = await prisma.appointment.findMany({
    where: { patientId },
    include: { doctorUser: true },
    orderBy: { startsAt: "desc" },
  });

  for (const appointment of appointments) {
    await createMessagesForAppointment(appointment);
  }
}

export async function listMessagesForPatient(patientId: string) {
  await ensureMessagesForPatient(patientId);

  const rows = await prisma.followUpMessage.findMany({
    where: { patientId },
    include: { appointment: true },
    orderBy: { sentAt: "desc" },
  });

  return rows.map(toPublicMessage);
}
