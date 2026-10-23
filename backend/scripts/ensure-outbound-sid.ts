/**
 * Ensure the clinic Twilio SID sits on the outbound test agent (required to dial),
 * then also keep inbound answering. Delete empty duplicate outbound agents.
 */
import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  attachAssistantPhoneNumbers,
  listAssistants,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const fromPhone = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  const inboundId = env.SYNTHFLOW_AGENT_ID.trim();

  const listed = await listAssistants({ limit: 50 });
  const aResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];
  const outboundRows = rows.filter(
    (r) =>
      String(r.type) === "outbound" &&
      /Outbound Test/i.test(String(r.name || "")),
  );

  // Prefer the one that already has the number / newest with phone at create.
  let primary =
    outboundRows.find((r) => {
      const attached = (r.attached_phone_numbers as Json[] | undefined) ?? [];
      return attached.some((p) => String(p.number || "").includes("4244849053"));
    }) || outboundRows[0];

  const primaryId = String(primary?.model_id || primary?.id || "");
  if (!primaryId) throw new Error("No outbound test agent");

  for (const row of outboundRows) {
    const id = String(row.model_id || row.id || "");
    if (id === primaryId) continue;
    try {
      await synthflowRequest("DELETE", `/assistants/${encodeURIComponent(id)}`);
      console.log("deleted_duplicate", id);
    } catch (e) {
      console.warn("delete_dup", id, e instanceof Error ? e.message : e);
    }
  }

  // Move SID to outbound: detach inbound → attach outbound → reattach inbound.
  if (inboundId) {
    await synthflowRequest(
      "DELETE",
      `/assistants/${encodeURIComponent(inboundId)}/phone_numbers/14244849053`,
    ).catch(() => null);
  }
  await attachAssistantPhoneNumbers(primaryId, [fromPhone]);
  if (inboundId) {
    await attachAssistantPhoneNumbers(inboundId, [fromPhone]);
  }

  const listed2 = await listAssistants({ limit: 50 });
  const aResp2 = ((listed2 as Json).response as Json | undefined) ?? (listed2 as Json);
  const rows2 = (aResp2.assistants as Json[] | undefined) ?? [];
  for (const r of rows2) {
    const id = String(r.model_id || r.id || "");
    if (id !== primaryId && id !== inboundId) continue;
    console.log(
      JSON.stringify({
        id,
        name: r.name,
        type: r.type,
        phone: r.phone_number,
        attached: r.attached_phone_numbers,
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
