import type { Appointment, AppointmentReminderKind, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { sendPatientReminderSms } from "./synthflow.client.js";
import { normalizePhone } from "../utils/phone.js";
import {
  clinicTimeZoneLabel,
  formatClinicDateTime,
  reminderInstants,
  type ReminderKind,
} from "../utils/clinic-time.js";

const SEND_GRACE_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const KIND_MESSAGE: Record<ReminderKind, string> = {
  THREE_DAYS: "This is your reminder 3 days before your visit.",
  TWENTY_FOUR_HOURS: "This is your reminder 24 hours before your visit.",
  SIX_HOURS: "This is your reminder 6 hours before your visit.",
};

const INBOX_KIND: Record<ReminderKind, string> = {
  THREE_DAYS: "reminder_3d",
  TWENTY_FOUR_HOURS: "reminder_24h",
  SIX_HOURS: "reminder_6h",
};

type ReminderAppointment = Appointment & {
  patient: User;
  doctorUser: User;
};

function reminderBody(appointment: ReminderAppointment, kind: ReminderKind) {
  const when = formatClinicDateTime(appointment.startsAt);
  const zone = clinicTimeZoneLabel(appointment.startsAt);
  const doctor = appointment.doctorUser.fullName.trim() || "your doctor";
  const clinic = appointment.clinic.trim() || "the clinic";
  return `Qubetech: ${KIND_MESSAGE[kind]} Appointment ${appointment.reference} with ${doctor} at ${clinic} is ${when} ${zone}.`;
}

async function resolveBookingPhone(appointment: Pick<Appointment, "id" | "patientId" | "bookingPhone">) {
  const stored = normalizePhone(appointment.bookingPhone);
  if (stored) return stored;

  const history = await prisma.patientMedicalHistory.findUnique({
    where: { userId: appointment.patientId },
    select: { phone: true },
  });
  const fromHistory = normalizePhone(history?.phone || "");
  if (fromHistory) return fromHistory;

  const otp = await prisma.appointmentOtp.findFirst({
    where: { appointmentId: appointment.id },
    orderBy: { createdAt: "desc" },
    select: { phone: true },
  });
  return normalizePhone(otp?.phone || "");
}

async function syncInboxRow(
  appointment: ReminderAppointment,
  kind: ReminderKind,
  scheduledFor: Date,
  status: "SCHEDULED" | "DELIVERED" | "CANCELLED",
) {
  if (status === "CANCELLED") return;
  const inboxKind = INBOX_KIND[kind];
  const subject = KIND_MESSAGE[kind].replace(/\.$/, "");
  const preview = `${formatClinicDateTime(appointment.startsAt)} with ${appointment.doctorUser.fullName} at ${appointment.clinic}.`;
  await prisma.followUpMessage.upsert({
    where: { appointmentId_kind: { appointmentId: appointment.id, kind: inboxKind } },
    update: {
      channel: "SMS",
      status: status === "DELIVERED" ? "DELIVERED" : "SCHEDULED",
      subject,
      preview,
      sentAt: scheduledFor,
    },
    create: {
      patientId: appointment.patientId,
      appointmentId: appointment.id,
      kind: inboxKind,
      channel: "SMS",
      status: status === "DELIVERED" ? "DELIVERED" : "SCHEDULED",
      subject,
      preview,
      sentAt: scheduledFor,
    },
  });
}

export async function cancelPendingReminders(appointmentId: string) {
  await prisma.appointmentReminder.updateMany({
    where: {
      appointmentId,
      status: { in: ["SCHEDULED", "FAILED"] },
    },
    data: { status: "CANCELLED", error: "" },
  });
}

/** Queue 3-day, 24-hour, and 6-hour SMS reminders after the visit is confirmed. */
export async function scheduleAppointmentReminders(appointmentId: string) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { patient: true, doctorUser: true },
  });
  if (!appointment) return;
  if (appointment.status !== "CONFIRMED") {
    await cancelPendingReminders(appointment.id);
    return;
  }

  const phone = await resolveBookingPhone(appointment);
  if (phone && phone !== appointment.bookingPhone) {
    await prisma.appointment.update({
      where: { id: appointment.id },
      data: { bookingPhone: phone },
    });
  }

  const instants = reminderInstants(appointment.startsAt);
  const now = Date.now();
  const kinds = Object.keys(instants) as ReminderKind[];

  for (const kind of kinds) {
    const scheduledFor = instants[kind];
    const existing = await prisma.appointmentReminder.findUnique({
      where: { appointmentId_kind: { appointmentId: appointment.id, kind } },
    });

    let status: "SCHEDULED" | "SKIPPED" | "SENT" | "FAILED" | "CANCELLED" = "SCHEDULED";
    let error = "";
    if (!phone) {
      status = "SKIPPED";
      error = "No mobile number was saved when this appointment was booked.";
    } else if (scheduledFor.getTime() >= appointment.startsAt.getTime()) {
      status = "SKIPPED";
      error = "Reminder time is not before the appointment.";
    } else if (scheduledFor.getTime() < now - SEND_GRACE_MS) {
      status = "SKIPPED";
      error = "The reminder time had already passed when the visit was confirmed.";
    }

    if (existing?.status === "SENT") {
      const moved = Math.abs(existing.scheduledFor.getTime() - scheduledFor.getTime()) > 60_000;
      if (!moved) continue;
      if (status !== "SCHEDULED") {
        await prisma.appointmentReminder.update({
          where: { id: existing.id },
          data: { scheduledFor, phone: phone || existing.phone, status, error, attempts: existing.attempts },
        });
        continue;
      }
    }

    const saved = await prisma.appointmentReminder.upsert({
      where: { appointmentId_kind: { appointmentId: appointment.id, kind } },
      update: {
        phone: phone || existing?.phone || "",
        scheduledFor,
        status,
        error,
        sentAt: status === "SCHEDULED" ? null : existing?.sentAt ?? null,
        attempts: status === "SCHEDULED" && existing?.status !== "SCHEDULED" ? 0 : existing?.attempts ?? 0,
      },
      create: {
        appointmentId: appointment.id,
        kind: kind as AppointmentReminderKind,
        phone: phone || "",
        scheduledFor,
        status,
        error,
      },
    });

    if (saved.status === "SCHEDULED" || saved.status === "SENT") {
      await syncInboxRow(
        appointment,
        kind,
        saved.scheduledFor,
        saved.status === "SENT" ? "DELIVERED" : "SCHEDULED",
      );
    }
  }
}

export async function dispatchDueAppointmentReminders(now = new Date()) {
  const due = await prisma.appointmentReminder.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: now },
    },
    include: {
      appointment: { include: { patient: true, doctorUser: true } },
    },
    orderBy: { scheduledFor: "asc" },
    take: 10,
  });

  for (const reminder of due) {
    const appointment = reminder.appointment;
    if (appointment.status !== "CONFIRMED" || appointment.startsAt.getTime() <= now.getTime()) {
      await prisma.appointmentReminder.update({
        where: { id: reminder.id },
        data: {
          status: "CANCELLED",
          error: "Appointment is no longer an upcoming confirmed visit.",
        },
      });
      continue;
    }

    if (reminder.scheduledFor.getTime() < now.getTime() - SEND_GRACE_MS) {
      await prisma.appointmentReminder.update({
        where: { id: reminder.id },
        data: { status: "SKIPPED", error: "Reminder was more than an hour late, so it was not sent." },
      });
      continue;
    }

    const phone = normalizePhone(reminder.phone);
    if (!phone) {
      await prisma.appointmentReminder.update({
        where: { id: reminder.id },
        data: { status: "SKIPPED", error: "No mobile number was saved when this appointment was booked." },
      });
      continue;
    }

    try {
      await sendPatientReminderSms({
        toPhone: phone,
        body: reminderBody(appointment, reminder.kind),
      });
      await prisma.appointmentReminder.update({
        where: { id: reminder.id },
        data: { status: "SENT", sentAt: now, error: "", attempts: reminder.attempts + 1 },
      });
      await syncInboxRow(appointment, reminder.kind, reminder.scheduledFor, "DELIVERED");
      console.log(
        `[reminders] Sent ${reminder.kind} for ${appointment.reference} to ${phone.slice(0, 3)}…${phone.slice(-4)}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "SMS could not be sent";
      const attempts = reminder.attempts + 1;
      await prisma.appointmentReminder.update({
        where: { id: reminder.id },
        data: {
          attempts,
          error: message,
          status: attempts >= MAX_ATTEMPTS ? "FAILED" : "SCHEDULED",
        },
      });
      console.error(`[reminders] ${reminder.kind} for ${appointment.reference} failed: ${message}`);
    }
  }
}

export function startAppointmentReminderScheduler() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await dispatchDueAppointmentReminders();
    } catch (error) {
      console.error(
        "[reminders] Scheduler tick failed:",
        error instanceof Error ? error.message : error,
      );
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => {
    void tick();
  }, 30_000);
  timer.unref?.();
}
