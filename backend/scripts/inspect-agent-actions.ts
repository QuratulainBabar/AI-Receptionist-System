import "dotenv/config";
import { env } from "../src/config/env.js";
import { synthflowRequest } from "../src/services/synthflow.client.js";

async function main() {
  const id = env.SYNTHFLOW_AGENT_ID.trim();
  const assistant = await synthflowRequest<Record<string, unknown>>(
    "GET",
    `/assistants/${encodeURIComponent(id)}`,
  );
  const resp = (assistant.response as Record<string, unknown> | undefined) ?? assistant;
  const assistants = (resp.assistants as Record<string, unknown>[] | undefined) ?? [];
  const row = assistants[0] ?? resp;
  console.log("actions", JSON.stringify(row.actions).slice(0, 500));
  console.log("input_variables", JSON.stringify(row.input_variables).slice(0, 2000));
  const iv = Array.isArray(row.input_variables) ? row.input_variables : [];
  console.log(
    "attached_action_ids",
    iv.map((x) => {
      const row = x as Record<string, unknown>;
      return {
        action_id: row.action_id,
        attachment_type: row.attachment_type,
        trigger: row.trigger_condition,
      };
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
