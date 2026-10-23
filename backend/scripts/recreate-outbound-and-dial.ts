/**
 * Recreate the clinic outbound test agent and place one fresh dial.
 * Usage: npx tsx scripts/recreate-outbound-and-dial.ts +923708321774
 */
import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  attachAssistantPhoneNumbers,
  createOutboundAgent,
  getPhoneCall,
  listAssistants,
  readCallStatus,
  startOutboundVoiceCall,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const toPhone = (process.argv[2] || "").trim();
  if (!toPhone) {
    console.error("Usage: npx tsx scripts/recreate-outbound-and-dial.ts <+E164>");
    process.exit(1);
  }
  const fromPhone = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  const agentName = "Qubetech AI Receptionist Clinic Outbound Test";

  const listed = await listAssistants({ limit: 50 });
  const aResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];

  for (const row of rows) {
    if (String(row.type || "").toLowerCase() !== "outbound") continue;
    const id = String(row.model_id || row.id || "");
    const name = String(row.name || "");
    if (name !== agentName && !/probe|temp/i.test(name)) continue;
    // Detach clinic number first so recreate is clean.
    try {
      await synthflowRequest(
        "DELETE",
        `/assistants/${encodeURIComponent(id)}/phone_numbers/14244849053`,
      );
      console.log("detached", id, name);
    } catch (e) {
      console.warn("detach_failed", id, e instanceof Error ? e.message : e);
    }
    if (name === agentName || /probe|temp/i.test(name)) {
      try {
        await synthflowRequest("DELETE", `/assistants/${encodeURIComponent(id)}`);
        console.log("deleted", id, name);
      } catch (e) {
        console.warn("delete_failed", id, e instanceof Error ? e.message : e);
      }
    }
  }

  const created = await createOutboundAgent({
    name: agentName,
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
  const response = ((created as Json).response as Json | undefined) ?? (created as Json);
  const outboundId = String(response.model_id || (created as Json).model_id || response.id || "");
  if (!outboundId) throw new Error(`No outbound id: ${JSON.stringify(created).slice(0, 400)}`);
  console.log("created_outbound", outboundId);

  await attachAssistantPhoneNumbers(outboundId, [fromPhone]);
  // Keep inbound answering on the same clinic number.
  const inboundId = env.SYNTHFLOW_AGENT_ID.trim();
  if (inboundId) {
    await attachAssistantPhoneNumbers(inboundId, [fromPhone]).catch((e) =>
      console.warn("inbound_reattach", e instanceof Error ? e.message : e),
    );
  }

  // Prefer agent-default caller ID first (omit from_phone_number).
  const started = await startOutboundVoiceCall({
    modelId: outboundId,
    toPhone,
    fromPhone: "", // signal omit
    name: "Doctor clinic test",
    greeting: "Hi, you've reached Qubetech AI Receptionist Clinic. How may I help you today?",
    prompt:
      "You are the clinic AI receptionist on a short TEST call. Keep replies under two sentences. Never go silent.",
  });
  console.log("started", started.callId);

  for (let i = 0; i < 12; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const detail = await getPhoneCall(started.callId);
    const status = readCallStatus(detail);
    const root = detail as Json;
    const resp = (root.response as Json | undefined) ?? {};
    const list = (resp.calls as Json[] | undefined) ?? [];
    const call = (list[0] as Json | undefined) ?? (resp.call as Json | undefined) ?? resp;
    console.log(
      JSON.stringify({
        i: i + 1,
        status,
        model: call.model_id,
        to: call.phone_number_to || call.lead_phone_number,
        from: call.phone_number_from,
        duration: call.duration,
        end: call.end_call_reason,
        transcript: String(call.transcript || "").slice(0, 160).replace(/\n/g, " | "),
      }),
    );
    if (["completed", "failed", "spam", "busy", "canceled", "no-answer", "voicemail", "paused"].includes(status) && i >= 2) {
      if (status === "paused") {
        console.error("STILL_PAUSED");
        process.exit(2);
      }
      break;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
