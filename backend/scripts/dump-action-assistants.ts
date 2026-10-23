import "dotenv/config";
import { env } from "../src/config/env.js";
import { synthflowRequest } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const inboundId = env.SYNTHFLOW_AGENT_ID.trim();
  const actionsJson = await synthflowRequest<Json>("GET", "/actions?limit=100");
  const aResp = (actionsJson.response as Json | undefined) ?? actionsJson;
  const actions = (aResp.actions as Json[] | undefined) ?? [];
  const wanted = [
    "check_doctor_availability",
    "book_appointment",
    "send_booking_otp",
    "verify_booking_otp",
    "check_existing_appointment",
    "offer_records_upload",
    "send_records_upload_link",
  ];
  for (const name of wanted) {
    const row = actions.find((a) => String(a.name || a.action_name || "") === name);
    if (!row) {
      console.log(name, "NOT_IN_LIST");
      continue;
    }
    const id = String(row.action_id || row.id || "");
    const detail = await synthflowRequest<Json>("GET", `/actions/${encodeURIComponent(id)}`);
    const dResp = (detail.response as Json | undefined) ?? detail;
    const dActions = (dResp.actions as Json[] | undefined) ?? [];
    const d0 = (dActions[0] as Json | undefined) ?? dResp;
    const assistants = d0.assistants ?? d0.attached_assistants ?? d0.model_ids ?? null;
    console.log(
      JSON.stringify({
        name,
        id,
        assistants,
        keys: Object.keys(d0).filter((k) => /assist|model|attach/i.test(k)),
      }),
    );
  }

  // Full-ensure attach via items for booking actions, then check again
  const ids = wanted
    .map((name) => {
      const row = actions.find((a) => String(a.name || "") === name);
      return String(row?.action_id || row?.id || "");
    })
    .filter(Boolean);

  console.log("attaching via items", ids.length);
  const attach = await synthflowRequest("POST", "/actions/attach", {
    model_id: inboundId,
    items: ids.map((action_id) => ({
      action_id,
      attachment_type: "during",
    })),
  });
  console.log("attach", JSON.stringify(attach).slice(0, 200));

  for (const name of wanted.slice(0, 3)) {
    const row = actions.find((a) => String(a.name || "") === name);
    const id = String(row?.action_id || row?.id || "");
    if (!id) continue;
    const detail = await synthflowRequest<Json>("GET", `/actions/${encodeURIComponent(id)}`);
    const dResp = (detail.response as Json | undefined) ?? detail;
    const dActions = (dResp.actions as Json[] | undefined) ?? [];
    const d0 = (dActions[0] as Json | undefined) ?? dResp;
    console.log(
      "after",
      name,
      JSON.stringify(d0.assistants ?? d0.attached_assistants ?? d0.model_ids ?? "none").slice(0, 300),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
