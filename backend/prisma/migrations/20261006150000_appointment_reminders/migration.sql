-- Appointment reminders and the clinic US time zone used for doctor hours.

ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'America/Los_Angeles';

ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "bookingPhone" TEXT NOT NULL DEFAULT '';

CREATE TYPE "AppointmentReminderKind" AS ENUM ('THREE_DAYS', 'TWENTY_FOUR_HOURS', 'SIX_HOURS');
CREATE TYPE "AppointmentReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'FAILED', 'SKIPPED', 'CANCELLED');

CREATE TABLE "appointment_reminders" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "kind" "AppointmentReminderKind" NOT NULL,
    "phone" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "status" "AppointmentReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointment_reminders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "appointment_reminders_appointmentId_kind_key" ON "appointment_reminders"("appointmentId", "kind");
CREATE INDEX "appointment_reminders_status_scheduledFor_idx" ON "appointment_reminders"("status", "scheduledFor");

ALTER TABLE "appointment_reminders" ADD CONSTRAINT "appointment_reminders_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
