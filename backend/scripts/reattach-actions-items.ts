import "dotenv/config";
import { env } from "../src/config/env.js";
import { findAllActionIdsByName, synthflowRequest } from "../src/services/synthflow.client.js";

async function main() {
  const modelId = env.SYNTHFLOW_AGENT_ID.trim();
  const names = [
    "check_doctor_availability",
    "book_appointment",
    "check_existing_appointment",
    "verify_booking_otp",
    "offer_records_upload",
    "send_booking_otp",
    "send_records_upload_link",
  ];

  const items: Array<Record<string, unknown>> = [];
  for (const name of names) {
    const ids = await findAllActionIdsByName(name);
    const actionId = ids[0];
    if (!actionId) {
      console.log("missing", name);
      continue;
    }
    items.push({
      action_id: actionId,
      attachment_type: "during",
    });
    console.log("queue", name, actionId);
  }

  console.log("POST items attach", items.length);
  try {
    const result = await synthflowRequest("POST", "/actions/attach", {
      model_id: modelId,
      items,
    });
    console.log("items_attach_result", JSON.stringify(result).slice(0, 1000));
  } catch (error) {
    console.log("items_attach_err", error instanceof Error ? error.message : error);
  }

  // Also try legacy actions key one-by-one
  for (const item of items.slice(0, 2)) {
    try {
      const result = await synthflowRequest("POST", "/actions/attach", {
        model_id: modelId,
        actions: [item.action_id],
      });
      console.log("single_attach", item.action_id, JSON.stringify(result).slice(0, 200));
    } catch (error) {
      console.log(
        "single_attach_err",
        item.action_id,
        error instanceof Error ? error.message : error,
      );
    }
  }

  const assistant = await synthflowRequest<Record<string, unknown>>(
    "GET",
    `/assistants/${encodeURIComponent(modelId)}`,
  );
  const resp = (assistant.response as Record<string, unknown> | undefined) ?? assistant;
  const assistants = (resp.assistants as Record<string, unknown>[] | undefined) ?? [];
  const row = assistants[0] ?? resp;
  console.log("raw_action_field", JSON.stringify(row.actions).slice(0, 500));
  console.log(
    "keys_with_action",
    Object.keys(row).filter((k) => k.toLowerCase().includes("action")),
  );

  // Dump first action object from workspace to see assistants[] membership
  const actionId = String(items[0]?.action_id || "");
  if (actionId) {
    const action = await synthflowRequest<Record<string, unknown>>(
      "GET",
      `/actions/${encodeURIComponent(actionId)}`,
    );
    console.log("action_detail", JSON.stringify(action).slice(0, 1200));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
