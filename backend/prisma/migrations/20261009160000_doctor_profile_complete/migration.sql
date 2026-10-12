-- AlterTable: expand doctor profile for full My Profile management
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "feeCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "consultationServices" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "phone" TEXT NOT NULL DEFAULT '';
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT NOT NULL DEFAULT '';
