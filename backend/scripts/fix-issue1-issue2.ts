/**
 * Apply Issue 1 + Issue 2 fixes against the live Synthflow workspace and verify.
 * Live dial: npx tsx scripts/fix-issue1-issue2.ts +1XXXXXXXXXX
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { env } from "../src/config/env.js";
import {
  createOrUpdateClinicSynthflowAgent,
  startClinicReceptionistTestCall,
  getClinicReceptionistTestCall,
} from "../src/services/clinic-synthflow.service.js";
import {
  listAssistantActionIds,
  getPhoneCall,
  readCallStatus,
  startOutboundVoiceCall,
  attachAssistantPhoneNumbers,
  createOutboundAgent,
  updateAgent,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const inboundId = env.SYNTHFLOW_AGENT_ID.trim();
  const phone = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  const liveTo = (process.argv[2] || "").trim();

  console.log("1) Force full agent sync (reconcile bloated actions + turn-taking)...");
  const synced = await createOrUpdateClinicSynthflowAgent({ promptOnly: false });
  console.log("sync result", {
    action: (synced as Json).action,
    modelId: (synced as Json).modelId,
    warnings: (synced as Json).warnings,
  });

  const afterCount = await listAssistantActionIds(inboundId);
  console.log("2) inbound attached action count after sync:", afterCount.length);

  const assistant = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(inboundId)}?include_actions=true`,
  );
  const resp = ((assistant.response as Json | undefined) ?? assistant) as Json;
  const row = ((resp.assistants as Json[] | undefined) ?? [resp])[0] as Json;
  const agent = (row.agent as Json | undefined) ?? {};
  console.log("3) turn-taking", {
    patience_level: agent.patience_level,
    allowed_idle_time_seconds: agent.allowed_idle_time_seconds,
    send_user_idle_reminders: agent.send_user_idle_reminders,
    reminder_after_idle_time_seconds: agent.reminder_after_idle_time_seconds,
    min_words_to_interrupt: agent.min_words_to_interrupt,
    noise_cancellation: agent.noise_cancellation,
    actions_count: afterCount.length,
  });

  console.log("4) Outbound dial probe (synthetic destination — expect non-paused)...");
  // Use a dedicated outbound agent with clinic caller ID.
  let outboundId = "";
  try {
    const created = await createOutboundAgent({
      name: "Clinic Outbound Verify Probe",
      agent: {
        prompt: "Say hello once.",
        greeting_message: "Hello, this is a dial-path verification call.",
        greeting_message_mode: "agent_static",
        llm: "gpt-4.1-Mini",
        language: "en-US",
      },
    });
    const cResp = ((created as Json).response as Json | undefined) ?? (created as Json);
    outboundId = String(cResp.model_id || "");
  } catch (e) {
    console.log("create outbound failed", e instanceof Error ? e.message : e);
  }
  if (outboundId) {
    await attachAssistantPhoneNumbers(outboundId, [phone]);
    // Destination that is not the clinic line. Prefer live argv; else a valid-format probe.
    const dest = liveTo || "+14155550123";
    const started = await startOutboundVoiceCall({
      modelId: outboundId,
      toPhone: dest,
      fromPhone: phone,
      name: "Dial path verify",
      greeting: "Hello, dial path verification.",
      prompt: "Say you can hear the caller, then stop.",
    });
    console.log("started call", started.callId, "to", dest);
    let last = "";
    for (let i = 0; i < 6; i += 1) {
      await new Promise((r) => setTimeout(r, 2500));
      const detail = await getPhoneCall(started.callId);
      last = readCallStatus(detail);
      const dRoot = detail as Json;
      const dResp = (dRoot.response as Json | undefined) ?? {};
      const dCalls = (dResp.calls as Json[] | undefined) ?? [];
      const d = (dCalls[0] as Json | undefined) ?? (dResp.call as Json | undefined) ?? dResp;
      console.log("poll", i, {
        status: last,
        from: d.phone_number_from,
        to: d.phone_number_to ?? d.lead_phone_number,
        type: d.type_of_call,
        error: d.error_message,
      });
      if (!["queued", "pending", "registered", "paused"].includes(last)) break;
    }
    const outboundOk = last !== "paused" && last !== "";
    console.log("outbound_non_paused", outboundOk, "final_status", last);

    // Clean up probe agent phone pool? leave agent for reuse.
    await updateAgent(outboundId, {
      agent: { prompt: "Retired dial-path probe." },
    }).catch(() => null);
  }

  if (liveTo) {
    console.log("5) Live clinic test-call API →", liveTo);
    try {
      const started = await startClinicReceptionistTestCall({ phone: liveTo });
      console.log("test call started", started);
      for (let i = 0; i < 8; i += 1) {
        await new Promise((r) => setTimeout(r, 4000));
        const st = await getClinicReceptionistTestCall(started.callId);
        console.log("test poll", i, st);
        if (st.finished) break;
      }
    } catch (e) {
      console.log("test call error (expected if dial failed):", e instanceof Error ? e.message : e);
    }
  } else {
    console.log("5) Skipped live test-call API (pass personal E.164 as argv to dial).");
  }

  const report = {
    inbound_actions_after: afterCount.length,
    turn_taking: {
      patience_level: agent.patience_level,
      allowed_idle_time_seconds: agent.allowed_idle_time_seconds,
      send_user_idle_reminders: agent.send_user_idle_reminders,
    },
    sync_warnings: (synced as Json).warnings,
  };
  writeFileSync("scripts/_fix-issues-report.json", JSON.stringify(report, null, 2));
  console.log("wrote scripts/_fix-issues-report.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
