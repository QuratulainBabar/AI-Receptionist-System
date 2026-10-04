-- CreateEnum
CREATE TYPE "VoiceCallDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "VoiceCallStatus" AS ENUM ('RINGING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "voice_calls" (
    "id" TEXT NOT NULL,
    "synthflowCallId" TEXT,
    "direction" "VoiceCallDirection" NOT NULL DEFAULT 'INBOUND',
    "status" "VoiceCallStatus" NOT NULL DEFAULT 'RINGING',
    "fromNumber" TEXT NOT NULL DEFAULT '',
    "toNumber" TEXT NOT NULL DEFAULT '',
    "patientId" TEXT,
    "doctorUserId" TEXT,
    "appointmentId" TEXT,
    "modelId" TEXT NOT NULL DEFAULT '',
    "transcript" TEXT NOT NULL DEFAULT '',
    "recordingUrl" TEXT,
    "durationSeconds" INTEGER,
    "endCallReason" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "rawPayload" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voice_calls_synthflowCallId_key" ON "voice_calls"("synthflowCallId");

-- CreateIndex
CREATE INDEX "voice_calls_fromNumber_idx" ON "voice_calls"("fromNumber");

-- CreateIndex
CREATE INDEX "voice_calls_patientId_createdAt_idx" ON "voice_calls"("patientId", "createdAt");

-- CreateIndex
CREATE INDEX "voice_calls_doctorUserId_createdAt_idx" ON "voice_calls"("doctorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "voice_calls_status_createdAt_idx" ON "voice_calls"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_calls" ADD CONSTRAINT "voice_calls_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
