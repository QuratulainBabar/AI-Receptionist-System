-- CreateTable
CREATE TABLE "patient_activities" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "relatedId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_activities_userId_occurredAt_idx" ON "patient_activities"("userId", "occurredAt");

-- CreateIndex
CREATE INDEX "patient_activities_userId_type_relatedId_idx" ON "patient_activities"("userId", "type", "relatedId");

-- AddForeignKey
ALTER TABLE "patient_activities" ADD CONSTRAINT "patient_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
