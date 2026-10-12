-- AlterEnum
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLINIC_STAFF';

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "ClinicStaffRole" AS ENUM (
    'RECEPTIONIST',
    'CLINIC_ADMINISTRATOR',
    'OFFICE_MANAGER',
    'APPOINTMENT_COORDINATOR',
    'NURSE',
    'BILLING',
    'ADDITIONAL_DOCTOR'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "ClinicMemberStatus" AS ENUM ('ACTIVE', 'INACTIVE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "clinic_team_members" (
    "id" TEXT NOT NULL,
    "ownerDoctorUserId" TEXT NOT NULL,
    "memberUserId" TEXT NOT NULL,
    "staffRole" "ClinicStaffRole" NOT NULL,
    "status" "ClinicMemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_team_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "clinic_team_members_ownerDoctorUserId_memberUserId_key" ON "clinic_team_members"("ownerDoctorUserId", "memberUserId");
CREATE UNIQUE INDEX IF NOT EXISTS "clinic_team_members_memberUserId_key" ON "clinic_team_members"("memberUserId");
CREATE INDEX IF NOT EXISTS "clinic_team_members_ownerDoctorUserId_status_idx" ON "clinic_team_members"("ownerDoctorUserId", "status");
CREATE INDEX IF NOT EXISTS "clinic_team_members_staffRole_idx" ON "clinic_team_members"("staffRole");

DO $$ BEGIN
  ALTER TABLE "clinic_team_members" ADD CONSTRAINT "clinic_team_members_ownerDoctorUserId_fkey" FOREIGN KEY ("ownerDoctorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "clinic_team_members" ADD CONSTRAINT "clinic_team_members_memberUserId_fkey" FOREIGN KEY ("memberUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
