-- AlterTable
ALTER TABLE "appointments" ADD COLUMN IF NOT EXISTS "followUpOfId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "appointments_followUpOfId_idx" ON "appointments"("followUpOfId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'appointments_followUpOfId_fkey'
  ) THEN
    ALTER TABLE "appointments"
      ADD CONSTRAINT "appointments_followUpOfId_fkey"
      FOREIGN KEY ("followUpOfId") REFERENCES "appointments"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
