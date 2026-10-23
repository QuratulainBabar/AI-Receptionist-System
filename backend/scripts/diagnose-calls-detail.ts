import "dotenv/config";
import { env } from "../src/config/env.js";
import { getPhoneCall, synthflowRequest } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  const callsJson = await synthflowRequest<Json>(
    "GET",
    `/calls?model_id=${encodeURIComponent(agentId)}&limit=15`,
  );
  const callsResp = (callsJson.response as Json | undefined) ?? callsJson;
  const calls = (callsResp.calls as Json[] | undefined) ?? [];

  for (const call of calls.slice(0, 12)) {
    const id = String(call.call_id ?? call.id ?? "");
    const detail = await getPhoneCall(id);
    const dRoot = detail as Json;
    const dResp = (dRoot.response as Json | undefined) ?? {};
    const dCalls = (dResp.calls as Json[] | undefined) ?? [];
    const d = (dCalls[0] as Json | undefined) ?? (dResp.call as Json | undefined) ?? dResp;
    console.log(
      JSON.stringify({
        id,
        list_status: call.status,
        detail_status: d.status,
        type_of_call: d.type_of_call ?? call.type_of_call,
        duration: d.duration ?? call.duration,
        end_call_reason: d.end_call_reason ?? call.end_call_reason,
        error_message: d.error_message ?? call.error_message,
        telephony_disconnect_reason: d.telephony_disconnect_reason,
        telephony_ringing_duration: d.telephony_ringing_duration,
        phone_number_from: d.phone_number_from ?? call.phone_number_from,
        phone_number_to: d.phone_number_to ?? call.phone_number_to ?? call.lead_phone_number,
        name: d.name ?? call.name,
        transcript_preview: String(d.transcript ?? "").slice(0, 220).replace(/\n/g, " | "),
      }),
    );
  }

  console.log("\n=== assistant full phone fields ===");
  const assistant = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(agentId)}`,
  );
  const resp = (assistant.response as Json | undefined) ?? assistant;
  const assistants = (resp.assistants as Json[] | undefined) ?? [];
  const row = (assistants[0] as Json | undefined) ?? resp;
  const agent = (row.agent as Json | undefined) ?? {};
  console.log(
    JSON.stringify({
      type: row.type,
      phone_number: row.phone_number,
      attached_phone_numbers: row.attached_phone_numbers,
      caller_id_number: row.caller_id_number,
      max_duration: row.max_duration,
      allowed_idle_time_seconds: agent.allowed_idle_time_seconds,
      initial_pause_seconds: agent.initial_pause_seconds,
      ring_pause_seconds: agent.ring_pause_seconds,
      patience_level: agent.patience_level,
      send_user_idle_reminders: agent.send_user_idle_reminders,
      reminder_after_idle_time_seconds: agent.reminder_after_idle_time_seconds,
      reminder_after_idle_message: agent.reminder_after_idle_message,
      end_call_reasons: agent.end_call_reasons,
      end_call_reasons_v2: agent.end_call_reasons_v2,
      min_words_to_interrupt: agent.min_words_to_interrupt,
      suppression_level: agent.suppression_level,
      greeting_message_human_talk_timeout: agent.greeting_message_human_talk_timeout,
      working_hours: agent.working_hours,
      out_hours_action: agent.out_hours_action,
      timezone: agent.timezone,
      actions_count: Array.isArray(row.actions) ? (row.actions as unknown[]).length : null,
      action_names: Array.isArray(row.actions)
        ? (row.actions as Json[]).map((a) => a.name || a.action_name || a.action_id).slice(0, 20)
        : null,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
