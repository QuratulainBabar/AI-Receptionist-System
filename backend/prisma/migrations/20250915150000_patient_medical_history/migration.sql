-- CreateTable
CREATE TABLE "patient_medical_histories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "age" INTEGER,
    "bloodGroup" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "symptoms" TEXT NOT NULL DEFAULT '',
    "conditions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergies" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "medications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "surgeries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "familyHistory" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_medical_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "patient_medical_histories_userId_key" ON "patient_medical_histories"("userId");

-- AddForeignKey
ALTER TABLE "patient_medical_histories" ADD CONSTRAINT "patient_medical_histories_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
