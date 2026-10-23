import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  getPhoneCall,
  readCallStatus,
  startOutboundVoiceCall,
  synthflowRequest,
  attachAssistantPhoneNumbers,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const toPhone = (process.argv[2] || "").trim();
  const fromPhone = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  const inboundId = env.SYNTHFLOW_AGENT_ID.trim();

  // Detach from current outbound test agents so create can claim the number.
  for (const id of ["d474b029-ebfa-4a47-83e7-843a973c7684"]) {
    await synthflowRequest(
      "DELETE",
      `/assistants/${encodeURIComponent(id)}/phone_numbers/14244849053`,
    ).catch(() => null);
  }
  if (inboundId) {
    await synthflowRequest(
      "DELETE",
      `/assistants/${encodeURIComponent(inboundId)}/phone_numbers/14244849053`,
    ).catch(() => null);
  }

  const created = await synthflowRequest<Json>("POST", "/assistants", {
    type: "outbound",
    name: "Qubetech AI Receptionist Clinic Outbound Test",
    phone_number: fromPhone,
    is_recording: true,
    voice_engine_version: "2.0",
    agent: {
      prompt:
        "You are the clinic AI receptionist on a short TEST call. Keep replies under two sentences. Never go silent.",
      greeting_message:
        "Hi, you've reached Qubetech AI Receptionist Clinic. How may I help you today?",
      greeting_message_mode: "agent_static",
      llm: "gpt-4.1-mini",
      language: "en-US",
      voice_speed: 1.0,
      patience_level: "medium",
      min_words_to_interrupt: 3,
      transcriber_provider: "deepgram-nova-3",
      transcriber_speech_recognition: "high_accuracy",
    },
  });
  const resp = ((created.response as Json | undefined) ?? created) as Json;
  const outboundId = String(resp.model_id || created.model_id || "");
  console.log("created", outboundId, JSON.stringify(created).slice(0, 300));
  if (!outboundId) throw new Error("no id");

  await attachAssistantPhoneNumbers(outboundId, [fromPhone]).catch((e) =>
    console.warn("attach", e instanceof Error ? e.message : e),
  );

  if (!toPhone) {
    if (inboundId) await attachAssistantPhoneNumbers(inboundId, [fromPhone]);
    return;
  }

  const started = await startOutboundVoiceCall({
    modelId: outboundId,
    toPhone,
    fromPhone,
    name: "Doctor clinic test",
    greeting: "Hi, you've reached Qubetech AI Receptionist Clinic. How may I help you today?",
  });
  console.log("call_id", started.callId);

  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const detail = await getPhoneCall(started.callId);
    const status = readCallStatus(detail);
    const root = detail as Json;
    const r2 = (root.response as Json | undefined) ?? {};
    const list = (r2.calls as Json[] | undefined) ?? [];
    const call = (list[0] as Json | undefined) ?? (r2.call as Json | undefined) ?? r2;
    console.log(
      JSON.stringify({
        i: i + 1,
        status,
        from: call.phone_number_from,
        duration: call.duration,
        end: call.end_call_reason,
        transcript: String(call.transcript || "").slice(0, 100).replace(/\n/g, " | "),
      }),
    );
    if (["completed", "failed", "spam", "busy", "canceled", "no-answer", "voicemail"].includes(status)) break;
    if (status === "paused" && i >= 4) {
      console.error("PAUSED");
      break;
    }
  }

  if (inboundId) {
    await attachAssistantPhoneNumbers(inboundId, [fromPhone]);
    console.log("inbound_restored");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
