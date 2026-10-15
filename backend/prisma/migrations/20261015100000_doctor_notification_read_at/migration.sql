-- AlterTable
ALTER TABLE "doctor_notifications" ADD COLUMN "readAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "doctor_notifications_doctorUserId_readAt_idx" ON "doctor_notifications"("doctorUserId", "readAt");
