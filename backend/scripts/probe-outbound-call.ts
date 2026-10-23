import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  getPhoneCall,
  readCallStatus,
  startOutboundVoiceCall,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const outboundId = process.argv[2]?.trim();
  const toPhone = process.argv[3]?.trim();
  if (!outboundId || !toPhone) {
    console.error("Usage: npx tsx scripts/probe-outbound-call.ts <outboundModelId> <toE164>");
    process.exit(1);
  }
  const fromPhone = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";

  console.log(JSON.stringify({ outboundId, toPhone, fromPhone }));
  const started = await startOutboundVoiceCall({
    modelId: outboundId,
    toPhone,
    fromPhone,
    name: "Outbound probe",
    greeting: "Hi, this is a clinic test call from Qubetech. Can you hear me clearly?",
    prompt:
      "You are verifying the clinic outbound dial path. Confirm the caller can hear you in one short sentence, then ask if they need anything else. Never go silent.",
  });
  console.log("started", started.callId);

  for (let i = 0; i < 8; i += 1) {
    await new Promise((r) => setTimeout(r, 2500));
    const detail = await getPhoneCall(started.callId);
    const status = readCallStatus(detail);
    const dRoot = detail as Json;
    const dResp = (dRoot.response as Json | undefined) ?? {};
    const dCalls = (dResp.calls as Json[] | undefined) ?? [];
    const d = (dCalls[0] as Json | undefined) ?? (dResp.call as Json | undefined) ?? dResp;
    console.log(
      JSON.stringify({
        i,
        status,
        type_of_call: d.type_of_call,
        from: d.phone_number_from,
        to: d.phone_number_to ?? d.lead_phone_number,
        duration: d.duration,
        error_message: d.error_message,
        end_call_reason: d.end_call_reason,
        transcript: String(d.transcript || "").slice(0, 180).replace(/\n/g, " | "),
      }),
    );
    if (["completed", "failed", "spam", "busy", "canceled", "no-answer", "voicemail"].includes(status)) {
      break;
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
