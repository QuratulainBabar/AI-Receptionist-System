CREATE TABLE "appointment_otps" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "appointmentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_otps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "appointment_otps_phone_createdAt_idx" ON "appointment_otps"("phone", "createdAt");
CREATE INDEX "appointment_otps_appointmentId_idx" ON "appointment_otps"("appointmentId");
CREATE INDEX "appointment_otps_expiresAt_idx" ON "appointment_otps"("expiresAt");

ALTER TABLE "appointment_otps" ADD CONSTRAINT "appointment_otps_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
