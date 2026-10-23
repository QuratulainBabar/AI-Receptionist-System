import "dotenv/config";
import { writeFileSync } from "node:fs";
import { env } from "../src/config/env.js";
import { synthflowRequest } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function listAllActions() {
  const all: Json[] = [];
  for (let offset = 0; offset < 2000; offset += 100) {
    const catalog = await synthflowRequest<Json>("GET", `/actions?limit=100&offset=${offset}`);
    const cResp = ((catalog.response as Json | undefined) ?? catalog) as Json;
    const batch = (cResp.actions as Json[] | undefined) ?? [];
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function main() {
  const id = env.SYNTHFLOW_AGENT_ID.trim();
  const j = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(id)}?include_actions=true`,
  );
  const r = ((j.response as Json | undefined) ?? j) as Json;
  const assistants = (r.assistants as Json[] | undefined) ?? [];
  const a = assistants[0] ?? r;
  const agent = (a.agent as Json | undefined) ?? {};
  const actionIds = Array.isArray(a.actions) ? (a.actions as string[]) : [];

  const catalogActions = await listAllActions();
  const byId = new Map(
    catalogActions.map((row) => [
      String(row.action_id || row.id || ""),
      String(row.name || row.action_name || row.action_type || ""),
    ]),
  );

  const named = actionIds.map((aid) => ({ id: aid, name: byId.get(aid) || "?" }));
  const nameCounts: Record<string, number> = {};
  for (const n of named) {
    nameCounts[n.name] = (nameCounts[n.name] || 0) + 1;
  }

  const bookingNames = [
    "check_doctor_availability",
    "book_appointment",
    "send_booking_otp",
    "verify_booking_otp",
    "check_existing_appointment",
    "offer_records_upload",
    "send_records_upload_link",
    "deliver_records_upload_sms",
  ];
  const bookingPresent = bookingNames.map((name) => {
    const hits = named.filter((n) => n.name === name);
    return { name, count: hits.length, ids: hits.map((h) => h.id) };
  });

  const out = {
    type: a.type,
    actions_count: actionIds.length,
    catalog_count: catalogActions.length,
    unknown_count: named.filter((n) => n.name === "?").length,
    nameCounts,
    bookingPresent,
    patience: agent.patience_level,
    idle: agent.allowed_idle_time_seconds,
    reminders: agent.send_user_idle_reminders,
    reminder_s: agent.reminder_after_idle_time_seconds,
    noise: agent.noise_cancellation,
    suppression: agent.suppression_level,
    min_words: agent.min_words_to_interrupt,
    greeting_mode: agent.greeting_message_mode,
    transcriber_provider: agent.transcriber_provider,
    transcriber_speech_recognition: agent.transcriber_speech_recognition,
  };
  writeFileSync("scripts/_actions-inspect.json", JSON.stringify(out, null, 2));
  console.log(
    JSON.stringify(
      {
        actions_count: out.actions_count,
        bookingPresent: out.bookingPresent,
        topNames: Object.entries(nameCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15),
        patience: out.patience,
        idle: out.idle,
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
