/**
 * Temporarily give the clinic number ONLY to the outbound agent, dial once,
 * then restore inbound. Isolates inbound/outbound pool contention.
 */
import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  attachAssistantPhoneNumbers,
  getPhoneCall,
  listAssistants,
  readCallStatus,
  startOutboundVoiceCall,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const toPhone = (process.argv[2] || "").trim();
  if (!toPhone) throw new Error("need phone");
  const fromPhone = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  const inboundId = env.SYNTHFLOW_AGENT_ID.trim();

  const listed = await listAssistants({ limit: 50 });
  const aResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];
  const outbound = rows.find(
    (r) =>
      String(r.type) === "outbound" &&
      /Outbound Test/i.test(String(r.name || "")),
  );
  const outboundId = String(outbound?.model_id || outbound?.id || "");
  if (!outboundId) throw new Error("no outbound test agent");

  console.log("outbound", outboundId);

  // Exclusive: detach inbound, ensure outbound has number.
  if (inboundId) {
    await synthflowRequest(
      "DELETE",
      `/assistants/${encodeURIComponent(inboundId)}/phone_numbers/14244849053`,
    ).catch(() => null);
    console.log("inbound_detached");
  }
  await attachAssistantPhoneNumbers(outboundId, [fromPhone]);
  console.log("outbound_attached");

  const started = await startOutboundVoiceCall({
    modelId: outboundId,
    toPhone,
    fromPhone,
    name: "Doctor clinic test",
    greeting: "Hi, you've reached Qubetech AI Receptionist Clinic. How may I help you today?",
    prompt:
      "You are the clinic AI receptionist on a short TEST call. Keep replies under two sentences. Never go silent.",
  });
  console.log("call_id", started.callId);

  let finalStatus = "unknown";
  for (let i = 0; i < 15; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const detail = await getPhoneCall(started.callId);
    finalStatus = readCallStatus(detail);
    const root = detail as Json;
    const resp = (root.response as Json | undefined) ?? {};
    const list = (resp.calls as Json[] | undefined) ?? [];
    const call = (list[0] as Json | undefined) ?? (resp.call as Json | undefined) ?? resp;
    console.log(
      JSON.stringify({
        i: i + 1,
        status: finalStatus,
        from: call.phone_number_from,
        to: call.phone_number_to || call.lead_phone_number,
        duration: call.duration,
        end: call.end_call_reason,
        transcript: String(call.transcript || "").slice(0, 120).replace(/\n/g, " | "),
      }),
    );
    if (
      ["completed", "failed", "spam", "busy", "canceled", "no-answer", "voicemail"].includes(
        finalStatus,
      )
    ) {
      break;
    }
    if (finalStatus === "paused" && i >= 4) break;
  }

  // Always restore inbound answering.
  if (inboundId) {
    await attachAssistantPhoneNumbers(inboundId, [fromPhone]).catch(async () => {
      await synthflowRequest("PUT", `/assistants/${encodeURIComponent(inboundId)}/phone_numbers`, {
        phone_number_slugs: ["14244849053"],
      });
    });
    console.log("inbound_restored");
  }

  if (finalStatus === "paused") process.exit(2);
  if (!["ringing", "in-progress", "completed"].includes(finalStatus)) process.exit(3);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
