-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('DELIVERED', 'SCHEDULED', 'OPENED');

-- CreateTable
CREATE TABLE "follow_up_messages" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "kind" TEXT NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "status" "MessageStatus" NOT NULL,
    "subject" TEXT NOT NULL,
    "preview" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "follow_up_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follow_up_messages_patientId_sentAt_idx" ON "follow_up_messages"("patientId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "follow_up_messages_appointmentId_kind_key" ON "follow_up_messages"("appointmentId", "kind");

-- AddForeignKey
ALTER TABLE "follow_up_messages" ADD CONSTRAINT "follow_up_messages_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follow_up_messages" ADD CONSTRAINT "follow_up_messages_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
