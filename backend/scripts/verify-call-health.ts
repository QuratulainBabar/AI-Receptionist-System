/**
 * Smoke-check Synthflow agent + recent calls + local/tunnel health.
 * Run: npx tsx scripts/verify-call-health.ts
 */
import "dotenv/config";
import { env } from "../src/config/env.js";
import { syncClinicDirectoryToSynthflow } from "../src/services/clinic-synthflow.service.js";
import {
  getPhoneCall,
  isSynthflowConfigured,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  if (!isSynthflowConfigured()) {
    console.error("SYNTHFLOW_API_KEY missing");
    process.exit(1);
  }

  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  const publicUrl = env.PUBLIC_API_URL.replace(/\/$/, "");

  console.log("--- health ---");
  for (const url of [`${publicUrl}/api/health`, `http://localhost:${env.PORT}/api/health`]) {
    try {
      const res = await fetch(url);
      console.log(url, res.status, (await res.text()).slice(0, 80));
    } catch (error) {
      console.log(url, "FAIL", error instanceof Error ? error.message : error);
    }
  }

  console.log("\n--- agent ---");
  const assistant = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(agentId)}`,
  );
  const resp = (assistant.response as Json | undefined) ?? assistant;
  const assistants = (resp.assistants as Json[] | undefined) ?? [];
  const row = (assistants[0] as Json | undefined) ?? resp;
  const agent = (row.agent as Json | undefined) ?? row;
  const prompt = String(agent.prompt ?? row.prompt ?? "");
  console.log("model_id", agentId);
  console.log("phone", row.phone_number ?? agent.phone_number ?? "(none)");
  console.log("inbound_webhook", row.inbound_call_webhook_url ?? "(none)");
  console.log("data_webhook", row.external_webhook_url ?? "(none)");
  console.log("prompt_len", prompt.length);
  console.log("has_fast_response", /FAST RESPONSE/i.test(prompt));
  console.log("prompt_head", prompt.slice(0, 160).replace(/\n/g, " | "));

  console.log("\n--- recent calls ---");
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
  console.log("count", calls.length, "by_status", Object.fromEntries(byStatus));
  for (const call of calls.slice(0, 8)) {
    const id = String(call.call_id ?? call.id ?? "");
    const keys = Object.keys(call).slice(0, 25);
    console.log("call", {
      id,
      status: call.status ?? call.call_status,
      duration: call.duration ?? call.call_duration,
      type: call.type ?? call.call_type ?? call.direction,
      name: call.name,
      to: call.to ?? call.phone_number ?? call.phone,
      from: call.from ?? call.from_phone_number,
      end_reason: call.end_reason ?? call.hangup_reason ?? call.termination_reason,
      keys,
    });
    if (!id) continue;
    try {
      const detail = await getPhoneCall(id);
      const raw = detail as Json;
      const d =
        ((raw.response as Json | undefined)?.calls as Json[] | undefined)?.[0] ??
        (raw.response as Json | undefined) ??
        raw;
      console.log(
        "  detail",
        JSON.stringify({
          status: d.status ?? d.call_status,
          duration: d.duration ?? d.call_duration,
          end_reason: d.end_reason ?? d.hangup_reason,
          error: d.error ?? d.error_message,
          transcript_len: String(d.transcript ?? d.transcript_text ?? "").length,
          has_recording: Boolean(d.recording_url),
        }).slice(0, 500),
      );
    } catch (error) {
      console.log("  detail_fail", error instanceof Error ? error.message : error);
    }
  }

  console.log("\n--- availability action ---");
  try {
    const av = await fetch(`${publicUrl}/api/webhooks/synthflow/actions/availability`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doctor_name: "health-check" }),
    });
    console.log("status", av.status, (await av.text()).slice(0, 160));
  } catch (error) {
    console.log("FAIL", error instanceof Error ? error.message : error);
  }

  console.log("\n--- prompt-only sync timing ---");
  const t0 = Date.now();
  const sync = await syncClinicDirectoryToSynthflow();
  console.log({
    ms: Date.now() - t0,
    action: sync.action,
    doctor: sync.clinicDoctorName,
    slots: String(sync.openSlotsSummary || "").slice(0, 100),
    warning: sync.warning,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
