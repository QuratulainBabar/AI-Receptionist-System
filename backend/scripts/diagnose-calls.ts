/**
 * Deep-dive recent Synthflow calls + agent telephony config.
 * Does NOT place a new live call unless argv phone is provided.
 * Run: npx tsx scripts/diagnose-calls.ts
 * Live: npx tsx scripts/diagnose-calls.ts +92...
 */
import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  extractCallId,
  getPhoneCall,
  readCallStatus,
  startOutboundVoiceCall,
  synthflowRequest,
} from "../src/services/synthflow.client.js";
import { normalizePhone } from "../src/utils/phone.js";

type Json = Record<string, unknown>;

function shallow(obj: Json, max = 40) {
  const out: Json = {};
  for (const [k, v] of Object.entries(obj).slice(0, max)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[k] = `{keys:${Object.keys(v as object).slice(0, 12).join(",")}}`;
    } else if (typeof v === "string") {
      out[k] = v.length > 160 ? `${v.slice(0, 160)}…` : v;
    } else {
      out[k] = v as never;
    }
  }
  return out;
}

async function main() {
  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  const clinicPhone = normalizePhone(env.SYNTHFLOW_PHONE_NUMBER);

  console.log("=== agent detail ===");
  const assistant = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(agentId)}`,
  );
  const resp = (assistant.response as Json | undefined) ?? assistant;
  const assistants = (resp.assistants as Json[] | undefined) ?? [];
  const row = (assistants[0] as Json | undefined) ?? resp;
  const agent = (row.agent as Json | undefined) ?? {};
  console.log(
    JSON.stringify(
      {
        top_keys: Object.keys(row),
        phone_number: row.phone_number,
        type: row.type ?? row.assistant_type ?? row.mode,
        is_inbound: row.is_inbound ?? row.inbound,
        status: row.status,
        inbound_call_webhook_url: row.inbound_call_webhook_url,
        external_webhook_url: row.external_webhook_url,
        agent_keys: Object.keys(agent),
        greeting_message: String(agent.greeting_message ?? "").slice(0, 200),
        greeting_message_mode: agent.greeting_message_mode,
        llm: agent.llm,
        voice_speed: agent.voice_speed,
        language: agent.language,
        voice_id: agent.voice_id,
        prompt_head: String(agent.prompt ?? "").slice(0, 300).replace(/\n/g, " | "),
        prompt_has_fast: /FAST RESPONSE/i.test(String(agent.prompt ?? "")),
        prompt_has_stop_wait: /STOP and WAIT/i.test(String(agent.prompt ?? "")),
      },
      null,
      2,
    ),
  );

  // Actions attached?
  console.log("\n=== attached actions sample ===");
  try {
    const actions = await synthflowRequest<Json>(
      "GET",
      `/assistants/${encodeURIComponent(agentId)}/actions`,
    );
    console.log(JSON.stringify(shallow(actions), null, 2).slice(0, 1200));
  } catch (error) {
    console.log("actions endpoint:", error instanceof Error ? error.message : error);
  }

  console.log("\n=== recent calls (20) ===");
  const callsJson = await synthflowRequest<Json>(
    "GET",
    `/calls?model_id=${encodeURIComponent(agentId)}&limit=20`,
  );
  const callsResp = (callsJson.response as Json | undefined) ?? callsJson;
  const calls = (callsResp.calls as Json[] | undefined) ?? [];
  const byStatus = new Map<string, number>();
  for (const call of calls) {
    const st = String(call.status ?? call.call_status ?? "unknown");
    byStatus.set(st, (byStatus.get(st) || 0) + 1);
  }
  console.log("by_status", Object.fromEntries(byStatus));

  for (const call of calls.slice(0, 8)) {
    const id = String(call.call_id ?? call.id ?? "");
    console.log("\n--- list row ---");
    console.log(
      JSON.stringify(
        {
          id,
          status: call.status,
          duration: call.duration,
          type: call.type ?? call.call_type ?? call.direction,
          name: call.name,
          phone: call.phone ?? call.to ?? call.phone_number,
          from: call.from ?? call.from_phone_number,
          keys: Object.keys(call).slice(0, 30),
        },
        null,
        2,
      ),
    );
    if (!id) continue;
    const detail = await getPhoneCall(id);
    const dRoot = detail as Json;
    const dResp = (dRoot.response as Json | undefined) ?? {};
    const dCalls = (dResp.calls as Json[] | undefined) ?? [];
    const d = dCalls[0] ?? (dResp.call as Json | undefined) ?? dResp;
    console.log(
      "detail",
      JSON.stringify(
        {
          status: readCallStatus(detail),
          duration: d.duration ?? d.call_duration,
          end_reason: d.end_reason ?? d.hangup_reason ?? d.termination_reason,
          error: d.error ?? d.error_message ?? d.failure_reason,
          transcript: String(d.transcript ?? d.transcript_text ?? "").slice(0, 400),
          recording: Boolean(d.recording_url),
          executed_actions: d.executed_actions
            ? Object.keys(d.executed_actions as object).slice(0, 10)
            : null,
          keys: Object.keys(d).slice(0, 25),
        },
        null,
        2,
      ),
    );
  }

  const phone = (process.argv[2] || "").trim();
  if (!phone) {
    console.log("\n(no live dial — pass a personal mobile as argv to test POST /calls)");
    return;
  }

  const to = normalizePhone(phone);
  console.log("\n=== live POST /calls ===", { to, from: clinicPhone, agentId });
  try {
    const started = await startOutboundVoiceCall({
      modelId: agentId,
      toPhone: to,
      fromPhone: clinicPhone,
      name: "Diagnose test",
      greeting: "Hello, this is a short clinic connectivity test.",
      prompt:
        "Say hello once. Confirm you can hear the person. Ask if they want to book. If yes, say: Which day would you like your appointment? Then wait. Keep replies short. Never invent slots — use check_doctor_availability.",
    });
    console.log("started", started.callId);
    console.log("raw_keys", Object.keys(started.raw));
    console.log("raw_shallow", JSON.stringify(shallow(started.raw as Json), null, 2).slice(0, 1500));

    for (let i = 0; i < 10; i += 1) {
      await new Promise((r) => setTimeout(r, 3000));
      const detail = await getPhoneCall(started.callId);
      const status = readCallStatus(detail);
      const dRoot = detail as Json;
      const dResp = (dRoot.response as Json | undefined) ?? {};
      const dCalls = (dResp.calls as Json[] | undefined) ?? [];
      const d = dCalls[0] ?? (dResp.call as Json | undefined) ?? dResp;
      console.log(`poll ${i + 1}`, {
        status,
        duration: d.duration,
        error: d.error ?? d.error_message ?? d.failure_reason,
        end_reason: d.end_reason ?? d.hangup_reason,
        transcript_len: String(d.transcript ?? "").length,
        phone: d.phone ?? d.to,
        from: d.from ?? d.from_phone_number,
      });
      if (
        !["queued", "pending", "registered", "ringing", "in-progress", "paused", ""].includes(
          status,
        )
      ) {
        break;
      }
    }
  } catch (error) {
    console.error("LIVE_CALL_FAILED", error instanceof Error ? error.message : error);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
