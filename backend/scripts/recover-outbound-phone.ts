/**
 * Recover clinic number onto a dedicated outbound test agent after a bad detach.
 */
import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  attachAssistantPhoneNumbers,
  createOutboundAgent,
  listAssistants,
  startOutboundVoiceCall,
  getPhoneCall,
  readCallStatus,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const toPhone = (process.argv[2] || "").trim();
  const fromPhone = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  const inboundId = env.SYNTHFLOW_AGENT_ID.trim();
  const agentName = "Qubetech AI Receptionist Clinic Outbound Test";

  console.log("--- current pools ---");
  const listed = await listAssistants({ limit: 50 });
  const aResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];
  for (const r of rows) {
    const phone = String(r.phone_number || "");
    const attached = r.attached_phone_numbers;
    if (!phone.includes("4244849053") && !JSON.stringify(attached || "").includes("4244849053")) {
      if (String(r.type) === "outbound" && String(r.name || "").includes("Outbound Test")) {
        console.log(JSON.stringify({ id: r.model_id || r.id, name: r.name, type: r.type, phone, attached }));
      }
      continue;
    }
    console.log(
      JSON.stringify({
        id: r.model_id || r.id,
        name: r.name,
        type: r.type,
        phone,
        attached,
      }),
    );
  }

  // Detach from inbound so we can attach to outbound cleanly, then re-attach inbound.
  if (inboundId) {
    try {
      await synthflowRequest(
        "DELETE",
        `/assistants/${encodeURIComponent(inboundId)}/phone_numbers/14244849053`,
      );
      console.log("detached_from_inbound");
    } catch (e) {
      console.warn("inbound_detach", e instanceof Error ? e.message : e);
    }
  }

  let outboundId =
    rows
      .filter((r) => String(r.type) === "outbound" && String(r.name || "") === agentName)
      .map((r) => String(r.model_id || r.id || ""))
      .find(Boolean) || "";

  if (!outboundId) {
    // Prefer the agent we just created if present
    outboundId =
      rows
        .filter((r) => String(r.type) === "outbound" && /Outbound Test/i.test(String(r.name || "")))
        .map((r) => String(r.model_id || r.id || ""))
        .find(Boolean) || "";
  }

  if (!outboundId) {
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
    outboundId = String(response.model_id || (created as Json).model_id || "");
    console.log("created", outboundId);
  } else {
    console.log("using_existing_outbound", outboundId);
  }

  // Attach by E.164
  try {
    console.log("attach_e164", JSON.stringify(await attachAssistantPhoneNumbers(outboundId, [fromPhone])));
  } catch (e) {
    console.warn("attach_e164_failed", e instanceof Error ? e.message : e);
    console.log(
      "attach_slug",
      JSON.stringify(
        await synthflowRequest("PUT", `/assistants/${encodeURIComponent(outboundId)}/phone_numbers`, {
          phone_number_slugs: ["14244849053"],
        }),
      ),
    );
  }

  // Restore inbound answering
  if (inboundId) {
    try {
      console.log(
        "reattach_inbound",
        JSON.stringify(await attachAssistantPhoneNumbers(inboundId, [fromPhone])),
      );
    } catch (e) {
      console.warn("inbound_reattach_failed", e instanceof Error ? e.message : e);
      try {
        console.log(
          "inbound_slug",
          JSON.stringify(
            await synthflowRequest(
              "PUT",
              `/assistants/${encodeURIComponent(inboundId)}/phone_numbers`,
              { phone_number_slugs: ["14244849053"] },
            ),
          ),
        );
      } catch (e2) {
        console.warn("inbound_slug_failed", e2 instanceof Error ? e2.message : e2);
      }
    }
  }

  const listed2 = await listAssistants({ limit: 50 });
  const aResp2 = ((listed2 as Json).response as Json | undefined) ?? (listed2 as Json);
  const rows2 = (aResp2.assistants as Json[] | undefined) ?? [];
  console.log("--- pools after ---");
  for (const r of rows2) {
    if (
      String(r.model_id || r.id) === outboundId ||
      String(r.model_id || r.id) === inboundId ||
      JSON.stringify(r.attached_phone_numbers || "").includes("4244849053")
    ) {
      console.log(
        JSON.stringify({
          id: r.model_id || r.id,
          name: r.name,
          type: r.type,
          phone: r.phone_number,
          attached: r.attached_phone_numbers,
        }),
      );
    }
  }

  if (!toPhone) {
    console.log("No dial number provided — recovery only.");
    return;
  }

  console.log("dialing", toPhone, "via", outboundId);
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
        to: call.phone_number_to || call.lead_phone_number,
        from: call.phone_number_from,
        duration: call.duration,
        end: call.end_call_reason,
        transcript: String(call.transcript || "").slice(0, 140).replace(/\n/g, " | "),
      }),
    );
    if (
      ["completed", "failed", "spam", "busy", "canceled", "no-answer", "voicemail"].includes(status)
    ) {
      break;
    }
    if (status === "paused" && i >= 3) {
      console.error("PAUSED_NO_RING");
      process.exit(2);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
