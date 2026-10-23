/**
 * Inspect recent inbound call transcripts for silence/mishear/latency clues.
 */
import "dotenv/config";
import { writeFileSync } from "node:fs";
import { env } from "../src/config/env.js";
import { getPhoneCall, synthflowRequest } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  const callsJson = await synthflowRequest<Json>(
    "GET",
    `/calls?model_id=${encodeURIComponent(agentId)}&limit=8`,
  );
  const callsResp = ((callsJson.response as Json | undefined) ?? callsJson) as Json;
  const calls = (callsResp.calls as Json[] | undefined) ?? [];

  const out: Json[] = [];
  for (const call of calls.slice(0, 6)) {
    const id = String(call.call_id ?? call.id ?? "");
    if (!id) continue;
    const detail = await getPhoneCall(id);
    const dRoot = detail as Json;
    const dResp = (dRoot.response as Json | undefined) ?? {};
    const dCalls = (dResp.calls as Json[] | undefined) ?? [];
    const d = (dCalls[0] as Json | undefined) ?? (dResp.call as Json | undefined) ?? dResp;
    const agent = (d.agent as Json | undefined) ?? {};
    out.push({
      id,
      status: d.status,
      type: d.type_of_call,
      duration: d.duration,
      end: d.end_call_reason,
      transcript: String(d.transcript || "").slice(0, 1800),
      timeline: d.timeline ?? d.transcript_object ?? d.messages ?? null,
      executed_action_names: d.executed_actions
        ? Object.keys(d.executed_actions as object).slice(0, 30)
        : [],
      latency_hints: {
        llm: agent.llm ?? d.llm,
        transcriber: agent.transcriber_provider ?? d.transcriber_provider,
        patience: agent.patience_level,
        voice_speed: agent.voice_speed,
      },
    });
  }

  const assistant = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(agentId)}?include_actions=true`,
  );
  const aResp = ((assistant.response as Json | undefined) ?? assistant) as Json;
  const row = ((aResp.assistants as Json[] | undefined) ?? [aResp])[0] as Json;
  const ag = (row.agent as Json | undefined) ?? {};

  writeFileSync(
    "scripts/_call-latency-report.json",
    JSON.stringify(
      {
        agent: {
          llm: ag.llm,
          stt: ag.transcriber_provider,
          recog: ag.transcriber_speech_recognition,
          patience: ag.patience_level,
          idle: ag.allowed_idle_time_seconds,
          voice_speed: ag.voice_speed,
          min_words: ag.min_words_to_interrupt,
          noise: ag.noise_cancellation,
          suppression: ag.suppression_level,
          actions: Array.isArray(row.actions) ? (row.actions as unknown[]).length : 0,
          prompt_len: String(ag.prompt || "").length,
        },
        calls: out,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      {
        agent: {
          llm: ag.llm,
          stt: ag.transcriber_provider,
          recog: ag.transcriber_speech_recognition,
          patience: ag.patience_level,
          voice_speed: ag.voice_speed,
          actions: Array.isArray(row.actions) ? (row.actions as unknown[]).length : 0,
          prompt_len: String(ag.prompt || "").length,
        },
        recent: out.map((c) => ({
          id: c.id,
          status: c.status,
          type: c.type,
          duration: c.duration,
          preview: String(c.transcript || "").slice(0, 280).replace(/\n/g, " | "),
          actions: c.executed_action_names,
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
