-- Doctor notes, written prescriptions, and appointment status history for the patient timeline.

CREATE TABLE "clinical_notes" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinical_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "doctor_prescriptions" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "medication" TEXT NOT NULL,
    "dosage" TEXT NOT NULL DEFAULT '',
    "instructions" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doctor_prescriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointment_status_events" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "fromStatus" TEXT NOT NULL DEFAULT '',
    "toStatus" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "clinical_notes_patientId_createdAt_idx" ON "clinical_notes"("patientId", "createdAt");
CREATE INDEX "clinical_notes_doctorUserId_createdAt_idx" ON "clinical_notes"("doctorUserId", "createdAt");
CREATE INDEX "doctor_prescriptions_patientId_createdAt_idx" ON "doctor_prescriptions"("patientId", "createdAt");
CREATE INDEX "doctor_prescriptions_doctorUserId_createdAt_idx" ON "doctor_prescriptions"("doctorUserId", "createdAt");
CREATE INDEX "appointment_status_events_patientId_occurredAt_idx" ON "appointment_status_events"("patientId", "occurredAt");
CREATE INDEX "appointment_status_events_appointmentId_occurredAt_idx" ON "appointment_status_events"("appointmentId", "occurredAt");

ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "doctor_prescriptions" ADD CONSTRAINT "doctor_prescriptions_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_prescriptions" ADD CONSTRAINT "doctor_prescriptions_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "doctor_prescriptions" ADD CONSTRAINT "doctor_prescriptions_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointment_status_events" ADD CONSTRAINT "appointment_status_events_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
