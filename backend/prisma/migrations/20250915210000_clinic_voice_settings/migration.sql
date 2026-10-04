-- CreateTable
CREATE TABLE "clinic_voice_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "clinicName" TEXT NOT NULL DEFAULT 'Qubetech AI Receptionist Clinic',
    "phoneNumber" TEXT NOT NULL DEFAULT '',
    "synthflowAgentId" TEXT,
    "synthflowActionIds" JSONB,
    "agentLanguage" TEXT NOT NULL DEFAULT 'en',
    "agentVoiceId" TEXT NOT NULL DEFAULT '',
    "agentFirstMessage" TEXT NOT NULL DEFAULT '',
    "agentSystemPrompt" TEXT NOT NULL DEFAULT '',
    "voiceProvider" TEXT NOT NULL DEFAULT 'synthflow',
    "synthflowSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clinic_voice_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "clinic_voice_settings" ("id", "updatedAt")
VALUES ('default', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
