import "dotenv/config";
import { env } from "../src/config/env.js";
import { synthflowRequest } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function getAssistant(id: string) {
  const assistant = await synthflowRequest<Json>("GET", `/assistants/${encodeURIComponent(id)}`);
  const resp = (assistant.response as Json | undefined) ?? assistant;
  const assistants = (resp.assistants as Json[] | undefined) ?? [];
  return (assistants[0] as Json | undefined) ?? resp;
}

async function main() {
  const modelId = env.SYNTHFLOW_AGENT_ID.trim();
  const actionId = "d0255f73-b81c-4efc-8cd6-ba01b08c6818"; // check_doctor_availability

  const variants: { label: string; body: Record<string, unknown> }[] = [
    { label: "actions array", body: { model_id: modelId, actions: [actionId] } },
    { label: "action_ids", body: { model_id: modelId, action_ids: [actionId] } },
    { label: "assistant_id", body: { assistant_id: modelId, actions: [actionId] } },
    {
      label: "items with slug",
      body: {
        model_id: modelId,
        items: [{ action_id: actionId, attachment_type: "during" }],
      },
    },
  ];

  for (const v of variants) {
    try {
      const res = await synthflowRequest("POST", "/actions/attach", v.body);
      console.log(v.label, "OK", JSON.stringify(res).slice(0, 180));
    } catch (e) {
      console.log(v.label, "FAIL", e instanceof Error ? e.message : e);
    }
  }

  // Try updating assistant with actions list
  try {
    const put = await synthflowRequest("PUT", `/assistants/${encodeURIComponent(modelId)}`, {
      actions: [actionId],
    });
    console.log("PUT assistant actions", JSON.stringify(put).slice(0, 200));
  } catch (e) {
    console.log("PUT assistant actions FAIL", e instanceof Error ? e.message : e);
  }

  try {
    const put2 = await synthflowRequest("PUT", `/assistants/${encodeURIComponent(modelId)}`, {
      agent: { actions: [actionId] },
    });
    console.log("PUT agent.actions", JSON.stringify(put2).slice(0, 200));
  } catch (e) {
    console.log("PUT agent.actions FAIL", e instanceof Error ? e.message : e);
  }

  const after = await getAssistant(modelId);
  console.log(
    "final",
    JSON.stringify({
      actions: after.actions,
      input_variables: after.input_variables,
      type: after.type,
      model_id: after.model_id || after.id,
    }).slice(0, 500),
  );

  // Compare with outbound probe agent attach
  const outboundId = "bf9557d6-f636-41ca-afa4-d2f0a78b46db";
  try {
    const res = await synthflowRequest("POST", "/actions/attach", {
      model_id: outboundId,
      actions: [actionId],
    });
    console.log("outbound attach", JSON.stringify(res).slice(0, 180));
    const o = await getAssistant(outboundId);
    console.log("outbound actions", o.actions, "iv", o.input_variables);
  } catch (e) {
    console.log("outbound attach FAIL", e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
