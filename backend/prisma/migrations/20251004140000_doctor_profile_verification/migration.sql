-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "verifiedAt" TIMESTAMP(3);
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "verifiedByAdminId" TEXT;
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "verificationNote" TEXT NOT NULL DEFAULT '';

-- Existing clinic doctors are treated as already verified so phone AI keeps working.
UPDATE "doctor_profiles"
SET "isVerified" = true,
    "verifiedAt" = COALESCE("verifiedAt", NOW())
WHERE "isVerified" = false;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "doctor_profiles_isVerified_idx" ON "doctor_profiles"("isVerified");
