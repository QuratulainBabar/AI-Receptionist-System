import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rows = await prisma.voiceCall.findMany({
  orderBy: { createdAt: "desc" },
  take: 10,
  select: {
    id: true,
    synthflowCallId: true,
    callerName: true,
    recordingUrl: true,
    status: true,
    rawPayload: true,
  },
});

for (const row of rows) {
  const raw = row.rawPayload && typeof row.rawPayload === "object" ? (row.rawPayload as Record<string, unknown>) : {};
  const call = raw.call && typeof raw.call === "object" ? (raw.call as Record<string, unknown>) : {};
  console.log(
    JSON.stringify(
      {
        id: row.id,
        synthflowCallId: row.synthflowCallId,
        callerName: row.callerName,
        recordingUrl: row.recordingUrl,
        status: row.status,
        rawRecordingKeys: {
          root_recording_url: raw.recording_url ?? null,
          call_recording_url: call.recording_url ?? null,
          call_recordingUrl: call.recordingUrl ?? null,
          root_keys: Object.keys(raw).slice(0, 20),
          call_keys: Object.keys(call).slice(0, 30),
        },
      },
      null,
      2,
    ),
  );
}

await prisma.$disconnect();
