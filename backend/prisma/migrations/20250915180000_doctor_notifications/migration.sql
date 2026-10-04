-- CreateTable
CREATE TABLE "doctor_notifications" (
    "id" TEXT NOT NULL,
    "doctorUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "relatedId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "doctor_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "doctor_notifications_doctorUserId_occurredAt_idx" ON "doctor_notifications"("doctorUserId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "doctor_notifications_doctorUserId_eventType_relatedId_key" ON "doctor_notifications"("doctorUserId", "eventType", "relatedId");

-- AddForeignKey
ALTER TABLE "doctor_notifications" ADD CONSTRAINT "doctor_notifications_doctorUserId_fkey" FOREIGN KEY ("doctorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
