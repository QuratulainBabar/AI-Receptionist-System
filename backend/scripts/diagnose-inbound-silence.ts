/**
 * Diagnose why inbound agent greets then goes silent.
 * Writes scripts/_inbound-silence-report.json
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { env } from "../src/config/env.js";
import { getPhoneCall, synthflowRequest } from "../src/services/synthflow.client.js";
import { prisma } from "../src/lib/prisma.js";

type Json = Record<string, unknown>;

async function main() {
  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  const settings = await prisma.clinicVoiceSettings.findUnique({ where: { id: "default" } });

  const assistantJson = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(agentId)}?include_actions=true`,
  );
  const aResp = ((assistantJson.response as Json | undefined) ?? assistantJson) as Json;
  const row = ((aResp.assistants as Json[] | undefined) ?? [aResp])[0] as Json;
  const agent = (row.agent as Json | undefined) ?? {};
  const actionIds = Array.isArray(row.actions) ? (row.actions as string[]) : [];
  const iv = Array.isArray(row.input_variables) ? (row.input_variables as Json[]) : [];

  const prompt = String(agent.prompt || "");
  const greeting = String(agent.greeting_message || "");

  // Resolve action names
  const catalogRows: Json[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    const cat = await synthflowRequest<Json>("GET", `/actions?limit=100&offset=${offset}`);
    const cResp = ((cat.response as Json | undefined) ?? cat) as Json;
    const batch = (cResp.actions as Json[] | undefined) ?? [];
    catalogRows.push(...batch);
    if (batch.length < 100) break;
  }
  const byId = new Map(
    catalogRows.map((r) => [String(r.action_id || r.id || ""), String(r.name || r.action_name || "")]),
  );
  const attachedNamed = actionIds.map((id) => ({ id, name: byId.get(id) || "?" }));
  const nameCounts: Record<string, number> = {};
  for (const n of attachedNamed) nameCounts[n.name] = (nameCounts[n.name] || 0) + 1;

  // Recent calls for this agent
  const callsJson = await synthflowRequest<Json>(
    "GET",
    `/calls?model_id=${encodeURIComponent(agentId)}&limit=12`,
  );
  const callsResp = ((callsJson.response as Json | undefined) ?? callsJson) as Json;
  const calls = (callsResp.calls as Json[] | undefined) ?? [];

  const callDetails: Json[] = [];
  for (const call of calls.slice(0, 8)) {
    const id = String(call.call_id ?? call.id ?? "");
    if (!id) continue;
    const detail = await getPhoneCall(id);
    const dRoot = detail as Json;
    const dResp = (dRoot.response as Json | undefined) ?? {};
    const dCalls = (dResp.calls as Json[] | undefined) ?? [];
    const d = (dCalls[0] as Json | undefined) ?? (dResp.call as Json | undefined) ?? dResp;
    const transcript = String(d.transcript ?? call.transcript ?? "");
    callDetails.push({
      id,
      status: d.status ?? call.status,
      type_of_call: d.type_of_call ?? call.type_of_call,
      duration: d.duration ?? call.duration,
      end_call_reason: d.end_call_reason ?? call.end_call_reason,
      error_message: d.error_message ?? call.error_message,
      telephony_disconnect_reason: d.telephony_disconnect_reason,
      from: d.phone_number_from ?? call.phone_number_from,
      to: d.phone_number_to ?? call.phone_number_to,
      executed_actions: d.executed_actions ?? d.actions_executed ?? d.action_logs ?? null,
      transcript_full: transcript.slice(0, 2500),
      transcript_preview: transcript.slice(0, 400).replace(/\n/g, " | "),
    });
  }

  const dbPrompt = settings?.agentSystemPrompt || "";
  const promptHasWhichDay = /Which day would you like your appointment/i.test(prompt);
  const promptHasFastBook = /want to book/i.test(prompt) && /Which day/i.test(prompt);
  const dbHasWhichDay = /Which day would you like your appointment/i.test(dbPrompt);

  const report = {
    agentId,
    type: row.type,
    phone_number: row.phone_number,
    actions_count: actionIds.length,
    nameCounts,
    attachedNamed,
    input_variables_count: iv.length,
    input_variables_sample: iv.slice(0, 20).map((x) => ({
      action_id: x.action_id,
      name: byId.get(String(x.action_id || "")) || "?",
      attachment_type: x.attachment_type,
      trigger_condition: x.trigger_condition,
    })),
    turn_taking: {
      patience_level: agent.patience_level,
      allowed_idle_time_seconds: agent.allowed_idle_time_seconds,
      send_user_idle_reminders: agent.send_user_idle_reminders,
      reminder_after_idle_time_seconds: agent.reminder_after_idle_time_seconds,
      reminder_after_idle_message: agent.reminder_after_idle_message,
      min_words_to_interrupt: agent.min_words_to_interrupt,
      noise_cancellation: agent.noise_cancellation,
      suppression_level: agent.suppression_level,
      greeting_message_mode: agent.greeting_message_mode,
      initial_pause_seconds: agent.initial_pause_seconds,
      ring_pause_seconds: agent.ring_pause_seconds,
      transcriber_provider: agent.transcriber_provider,
      transcriber_speech_recognition: agent.transcriber_speech_recognition,
      llm: agent.llm,
      voice_speed: agent.voice_speed,
    },
    greeting_live: greeting,
    prompt_len: prompt.length,
    prompt_head: prompt.slice(0, 500),
    prompt_has_which_day_rule: promptHasWhichDay,
    prompt_has_fast_book: promptHasFastBook,
    db_prompt_len: dbPrompt.length,
    db_has_which_day: dbHasWhichDay,
    prompt_matches_db_head: prompt.slice(0, 200) === dbPrompt.slice(0, 200),
    recent_calls: callDetails,
  };

  writeFileSync("scripts/_inbound-silence-report.json", JSON.stringify(report, null, 2));
  console.log(
    JSON.stringify(
      {
        actions_count: report.actions_count,
        nameCounts: report.nameCounts,
        turn_taking: report.turn_taking,
        prompt_has_which_day_rule: report.prompt_has_which_day_rule,
        greeting_live: report.greeting_live,
        recent: callDetails.map((c) => ({
          id: c.id,
          status: c.status,
          duration: c.duration,
          end: c.end_call_reason,
          preview: c.transcript_preview,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
