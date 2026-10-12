-- AlterTable: account avatar for Super Admin (and other users)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "photoUrl" TEXT NOT NULL DEFAULT '';
