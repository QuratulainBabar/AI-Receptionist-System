-- AlterTable
ALTER TABLE "voice_calls" ADD COLUMN "callerName" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "voice_calls_callerName_idx" ON "voice_calls"("callerName");
