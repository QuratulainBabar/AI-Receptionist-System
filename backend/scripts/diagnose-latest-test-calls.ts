/**
 * Inspect the most recent Synthflow calls + outbound agent phone pool.
 */
import "dotenv/config";
import { env } from "../src/config/env.js";
import { prisma } from "../src/lib/prisma.js";
import {
  getPhoneCall,
  listAssistants,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

function dig(row: Json) {
  return {
    id: String(row.call_id ?? row.id ?? ""),
    status: String(row.status ?? ""),
    type: String(row.type_of_call ?? row.type ?? ""),
    to: String(row.phone_number ?? row.to_phone_number ?? row.phone ?? ""),
    from: String(row.from_phone_number ?? row.caller_id ?? ""),
    model: String(row.model_id ?? row.assistant_id ?? ""),
    duration: row.duration ?? row.call_duration ?? null,
    end: String(row.end_call_reason ?? row.end_reason ?? row.hangup_reason ?? ""),
    name: String(row.name ?? ""),
    created: String(row.created_at ?? row.start_time ?? row.timestamp ?? ""),
  };
}

async function main() {
  const settings = await prisma.clinicVoiceSettings.findFirst();
  console.log(
    JSON.stringify(
      {
        clinicPhone: settings?.phoneNumber ?? env.SYNTHFLOW_PHONE_NUMBER,
        inboundAgent: settings?.synthflowAgentId ?? env.SYNTHFLOW_AGENT_ID,
      },
      null,
      2,
    ),
  );

  const assistants = await listAssistants({ limit: 50 });
  const aResp = ((assistants as Json).response as Json | undefined) ?? (assistants as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];
  const outbound = rows
    .filter((r) => String(r.type || "").toLowerCase() === "outbound")
    .map((r) => ({
      id: String(r.model_id || r.id || ""),
      name: String(r.name || ""),
      phone_number: String(r.phone_number || ""),
      attached_phone_numbers: r.attached_phone_numbers ?? null,
      type: r.type,
      is_paused: r.is_paused ?? r.paused ?? null,
    }));
  console.log("\n--- outbound agents ---");
  console.log(JSON.stringify(outbound, null, 2));

  const inboundId = String(settings?.synthflowAgentId || env.SYNTHFLOW_AGENT_ID).trim();
  const queries = [
    inboundId ? `/calls?model_id=${encodeURIComponent(inboundId)}&limit=15` : "",
    ...outbound.map((o) =>
      o.id ? `/calls?model_id=${encodeURIComponent(o.id)}&limit=15` : "",
    ),
  ].filter(Boolean);

  const seen = new Set<string>();
  const all: ReturnType<typeof dig>[] = [];
  for (const q of queries) {
    const json = await synthflowRequest<Json>("GET", q);
    const resp = ((json.response as Json | undefined) ?? json) as Json;
    const calls = (resp.calls as Json[] | undefined) ?? [];
    for (const c of calls) {
      const d = dig(c);
      if (!d.id || seen.has(d.id)) continue;
      seen.add(d.id);
      all.push(d);
    }
  }

  all.sort((a, b) => String(b.created).localeCompare(String(a.created)));
  console.log("\n--- recent calls ---");
  console.log(JSON.stringify(all.slice(0, 12), null, 2));

  const latest = all[0];
  if (latest?.id) {
    const detail = await getPhoneCall(latest.id);
    const root = detail as Json;
    const resp = (root.response as Json | undefined) ?? {};
    const list = (resp.calls as Json[] | undefined) ?? [];
    const call = (list[0] as Json | undefined) ?? (resp.call as Json | undefined) ?? resp;
    console.log("\n--- latest call detail ---");
    console.log(
      JSON.stringify(
        {
          id: latest.id,
          status: call.status,
          type_of_call: call.type_of_call,
          phone_number: call.phone_number,
          from_phone_number: call.from_phone_number,
          model_id: call.model_id,
          duration: call.duration,
          end_call_reason: call.end_call_reason,
          error: call.error ?? call.error_message ?? call.failure_reason ?? null,
          executed_actions: call.executed_actions
            ? Object.keys(call.executed_actions as object).slice(0, 20)
            : [],
          transcript_preview: String(call.transcript || "").slice(0, 400),
        },
        null,
        2,
      ),
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
