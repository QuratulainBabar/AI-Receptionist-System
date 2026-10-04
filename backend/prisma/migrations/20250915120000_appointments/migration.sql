-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('CONFIRMED', 'PENDING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentMode" AS ENUM ('IN_CLINIC', 'VIDEO_CALL');

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "durationMinutes" INTEGER NOT NULL DEFAULT 30,
    "mode" "AppointmentMode" NOT NULL DEFAULT 'IN_CLINIC',
    "reason" TEXT NOT NULL DEFAULT '',
    "fee" TEXT NOT NULL,
    "clinic" TEXT NOT NULL,
    "specialtyName" TEXT NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointments_reference_key" ON "appointments"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "appointments_slotId_key" ON "appointments"("slotId");

-- CreateIndex
CREATE INDEX "appointments_patientId_startsAt_idx" ON "appointments"("patientId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_doctorUserId_startsAt_idx" ON "appointments"("doctorUserId", "startsAt");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "availability_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
