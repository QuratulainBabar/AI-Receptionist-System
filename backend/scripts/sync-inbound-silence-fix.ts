/**
 * Force full inbound agent sync (LLM/STT/actions/prompt) and print verification.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { env } from "../src/config/env.js";
import { createOrUpdateClinicSynthflowAgent } from "../src/services/clinic-synthflow.service.js";
import { listAssistantActionIds, synthflowRequest } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  console.log("Syncing inbound agent (promptOnly=false)...");
  let synced: Json;
  try {
    synced = (await createOrUpdateClinicSynthflowAgent({ promptOnly: false })) as Json;
  } catch (error) {
    // If deepgram/voicemail fields are rejected, surface and retry without optional fields.
    console.error("Full sync failed:", error instanceof Error ? error.message : error);
    throw error;
  }

  const agentId = String(synced.synthflowAgentId || env.SYNTHFLOW_AGENT_ID.trim());
  const assistantJson = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(agentId)}?include_actions=true`,
  );
  const aResp = ((assistantJson.response as Json | undefined) ?? assistantJson) as Json;
  const row = ((aResp.assistants as Json[] | undefined) ?? [aResp])[0] as Json;
  const agent = (row.agent as Json | undefined) ?? {};
  const actionIds = Array.isArray(row.actions) ? (row.actions as string[]) : [];

  const catalogRows: Json[] = [];
  for (let offset = 0; offset < 300; offset += 100) {
    const cat = await synthflowRequest<Json>("GET", `/actions?limit=100&offset=${offset}`);
    const cResp = ((cat.response as Json | undefined) ?? cat) as Json;
    const batch = (cResp.actions as Json[] | undefined) ?? [];
    catalogRows.push(...batch);
    if (batch.length < 100) break;
  }
  const byId = new Map(
    catalogRows.map((r) => [String(r.action_id || r.id || ""), String(r.name || r.action_name || "")]),
  );
  const names = actionIds.map((id) => byId.get(id) || id);

  const out = {
    sync_warning: synced.warning ?? null,
    synthflowAgentId: agentId,
    actions_count: actionIds.length,
    action_names: names,
    llm: agent.llm,
    transcriber_provider: agent.transcriber_provider,
    transcriber_speech_recognition: agent.transcriber_speech_recognition,
    patience_level: agent.patience_level,
    min_words_to_interrupt: agent.min_words_to_interrupt,
    allowed_idle_time_seconds: agent.allowed_idle_time_seconds,
    noise_cancellation: agent.noise_cancellation,
    suppression_level: agent.suppression_level,
    greeting_message_mode: agent.greeting_message_mode,
    prompt_len: String(agent.prompt || "").length,
    prompt_has_fast_response: /FAST RESPONSE RULE/i.test(String(agent.prompt || "")),
    prompt_has_listening_capture: /LISTENING & CAPTURE RULE/i.test(String(agent.prompt || "")),
    prompt_has_exact_which_day: /Which day would you like your appointment\?/i.test(
      String(agent.prompt || ""),
    ),
    list_count_check: await listAssistantActionIds(agentId).then((ids) => ids.length),
  };
  writeFileSync("scripts/_inbound-silence-fix-sync.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
