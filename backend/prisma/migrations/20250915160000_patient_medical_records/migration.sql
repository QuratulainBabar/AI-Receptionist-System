-- CreateTable
CREATE TABLE "patient_medical_records" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_medical_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_medical_records_userId_createdAt_idx" ON "patient_medical_records"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "patient_medical_records" ADD CONSTRAINT "patient_medical_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
