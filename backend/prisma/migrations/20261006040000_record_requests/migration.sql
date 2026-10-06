-- Secure doctor-requested upload links, tied to the appointment.
ALTER TABLE "patient_medical_records" ADD COLUMN "appointmentId" TEXT;
ALTER TABLE "patient_medical_records" ADD COLUMN "recordRequestId" TEXT;

CREATE TABLE "record_requests" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'sent',
    "smsSent" BOOLEAN NOT NULL DEFAULT false,
    "smsError" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "record_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "record_requests_tokenHash_key" ON "record_requests"("tokenHash");
CREATE UNIQUE INDEX "record_requests_appointmentId_key" ON "record_requests"("appointmentId");
CREATE INDEX "record_requests_patientId_idx" ON "record_requests"("patientId");
CREATE INDEX "record_requests_doctorUserId_idx" ON "record_requests"("doctorUserId");
CREATE INDEX "patient_medical_records_appointmentId_createdAt_idx" ON "patient_medical_records"("appointmentId", "createdAt");

ALTER TABLE "patient_medical_records" ADD CONSTRAINT "patient_medical_records_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patient_medical_records" ADD CONSTRAINT "patient_medical_records_recordRequestId_fkey" FOREIGN KEY ("recordRequestId") REFERENCES "record_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "record_requests" ADD CONSTRAINT "record_requests_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "record_requests" ADD CONSTRAINT "record_requests_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "record_requests" ADD CONSTRAINT "record_requests_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
