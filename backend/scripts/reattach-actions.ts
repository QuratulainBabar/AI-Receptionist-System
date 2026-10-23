import "dotenv/config";
import { env } from "../src/config/env.js";
import {
  attachActions,
  findAllActionIdsByName,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

async function main() {
  const id = env.SYNTHFLOW_AGENT_ID.trim();
  const names = [
    "check_doctor_availability",
    "book_appointment",
    "check_existing_appointment",
    "verify_booking_otp",
    "offer_records_upload",
    "send_booking_otp",
    "deliver_records_upload_sms",
    "send_records_upload_link",
  ];
  const ids: string[] = [];
  for (const name of names) {
    const found = await findAllActionIdsByName(name);
    console.log(name, found.slice(0, 3));
    if (found[0]) ids.push(found[0]);
  }
  console.log("attaching", ids.length, ids);
  try {
    const result = await attachActions(id, ids);
    console.log("attach_result", JSON.stringify(result).slice(0, 800));
  } catch (error) {
    console.log("attach_err", error instanceof Error ? error.message : error);
  }

  const assistant = await synthflowRequest<Record<string, unknown>>(
    "GET",
    `/assistants/${encodeURIComponent(id)}`,
  );
  const resp = (assistant.response as Record<string, unknown> | undefined) ?? assistant;
  const assistants = (resp.assistants as Record<string, unknown>[] | undefined) ?? [];
  const row = assistants[0] ?? resp;
  const actions = row.actions;
  console.log(
    "actions_after",
    Array.isArray(actions) ? actions.length : actions,
    Array.isArray(actions)
      ? actions.map((a) => {
          const row = a as Record<string, unknown>;
          return row.name || row.action_name || row.action_id || row.id;
        })
      : null,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
