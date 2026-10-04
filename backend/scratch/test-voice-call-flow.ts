import { PrismaClient } from "@prisma/client";
import { handleDataWebhook } from "../src/services/synthflow.webhooks.service.js";
import { listVoiceCallsForAdmin, getVoiceCallForAdmin } from "../src/services/admin-clinic.service.js";

const prisma = new PrismaClient();

async function main() {
  const callId = `test-call-${Date.now()}`;
  const sample = {
    call_id: callId,
    call: {
      call_id: callId,
      phone_number_from: "+15551234567",
      phone_number_to: "+14244849053",
      status: "completed",
      duration: 95,
      transcript:
        "Agent: Hello, how can I help?\nCaller: I'd like to book with Dr Smith tomorrow.\nAgent: Sure, I can help with that.",
      recording_url: "https://example.com/recording.mp3",
      end_call_reason: "hangup",
      model_id: "test-model",
    },
    lead: {
      name: "Jane Caller",
      phone_number: "+15551234567",
    },
    analysis: {
      call_summary: "Caller inquired about booking an appointment with Dr Smith.",
    },
    collected_variables: {
      patient_name: { value: "Jane Caller" },
      reason: { value: "General checkup" },
    },
  };

  const result = await handleDataWebhook(sample);
  console.log("webhook result:", result);

  const calls = await listVoiceCallsForAdmin({ limit: 5 });
  console.log(
    "list sample:",
    calls.slice(0, 1).map((c) => ({
      callerName: c.callerName,
      fromNumber: c.fromNumber,
      status: c.status,
      durationSeconds: c.durationSeconds,
      hasTranscript: c.hasTranscript,
      appointmentReference: c.appointmentReference,
    })),
  );

  if (result.voiceCallId) {
    const detail = await getVoiceCallForAdmin(result.voiceCallId);
    console.log("detail:", {
      callerName: detail.callerName,
      summary: detail.summary,
      transcriptPreview: detail.transcript.slice(0, 80),
      recordingUrl: detail.recordingUrl,
    });
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
