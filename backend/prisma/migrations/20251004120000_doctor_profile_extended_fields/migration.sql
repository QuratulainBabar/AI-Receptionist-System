-- AlterTable
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "subSpecialty" TEXT NOT NULL DEFAULT '';
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "qualifications" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "consultationType" TEXT NOT NULL DEFAULT 'In clinic';
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "areasOfExpertise" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "location" TEXT NOT NULL DEFAULT '';
ALTER TABLE "doctor_profiles" ADD COLUMN IF NOT EXISTS "weeklyHours" JSONB;
