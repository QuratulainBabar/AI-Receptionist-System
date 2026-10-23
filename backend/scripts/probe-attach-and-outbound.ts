import "dotenv/config";
import { env } from "../src/config/env.js";
import { synthflowRequest, listAssistants } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function getAssistant(id: string) {
  const assistant = await synthflowRequest<Json>("GET", `/assistants/${encodeURIComponent(id)}`);
  const resp = (assistant.response as Json | undefined) ?? assistant;
  const assistants = (resp.assistants as Json[] | undefined) ?? [];
  return (assistants[0] as Json | undefined) ?? resp;
}

async function main() {
  const inboundId = env.SYNTHFLOW_AGENT_ID.trim();
  const phone = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";

  console.log("=== list assistants (type/phone) ===");
  const listed = await listAssistants({ limit: 50 });
  const listResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (listResp.assistants as Json[] | undefined) ?? [];
  for (const row of rows) {
    console.log(
      JSON.stringify({
        model_id: row.model_id || row.id,
        name: row.name,
        type: row.type,
        phone_number: row.phone_number,
        attached: row.attached_phone_numbers,
      }),
    );
  }

  console.log("\n=== inbound assistant keys ===");
  const inbound = await getAssistant(inboundId);
  console.log(Object.keys(inbound));
  console.log("type", inbound.type);
  console.log("input_variables", inbound.input_variables);
  console.log("actions", inbound.actions);
  const agent = (inbound.agent as Json | undefined) ?? {};
  console.log("agent keys sample", {
    patience_level: agent.patience_level,
    allowed_idle_time_seconds: agent.allowed_idle_time_seconds,
    greeting_message_mode: agent.greeting_message_mode,
    prompt_len: String(agent.prompt || "").length,
    prompt_head: String(agent.prompt || "").slice(0, 180).replace(/\n/g, " "),
  });

  // List actions filtered by assistant if API supports it
  console.log("\n=== GET /actions (workspace) sample names ===");
  const actionsJson = await synthflowRequest<Json>("GET", "/actions?limit=30");
  const aResp = (actionsJson.response as Json | undefined) ?? actionsJson;
  const actions = (aResp.actions as Json[] | undefined) ?? [];
  console.log(
    "count",
    actions.length,
    "names",
    actions.map((a) => a.name || a.action_name).slice(0, 20),
  );

  // Try attach one known action and re-fetch
  const avail = actions.find((a) => String(a.name || "") === "check_doctor_availability");
  const actionId = String(avail?.action_id || avail?.id || "");
  console.log("\n=== attach check_doctor_availability ===", actionId);
  if (actionId) {
    const attach = await synthflowRequest("POST", "/actions/attach", {
      model_id: inboundId,
      actions: [actionId],
    });
    console.log("attach result", JSON.stringify(attach).slice(0, 300));
    const after = await getAssistant(inboundId);
    console.log("after actions", after.actions);
    console.log("after input_variables", after.input_variables);

    // Also try GET action detail for assistants list
    const detail = await synthflowRequest<Json>(
      "GET",
      `/actions/${encodeURIComponent(actionId)}`,
    );
    const dResp = (detail.response as Json | undefined) ?? detail;
    const dActions = (dResp.actions as Json[] | undefined) ?? [];
    const d0 = dActions[0] ?? dResp;
    console.log(
      "action assistants field",
      JSON.stringify((d0 as Json).assistants ?? (d0 as Json).model_ids ?? null).slice(0, 500),
    );
  }

  // Probe creating a temp outbound agent WITHOUT stealing inbound phone first
  console.log("\n=== create probe outbound agent (no phone) ===");
  try {
    const created = await synthflowRequest<Json>("POST", "/assistants", {
      type: "outbound",
      name: "Clinic Test Call Probe (temp)",
      is_recording: true,
      voice_engine_version: "2.0",
      agent: {
        prompt: "You are a short clinic test-call agent. Confirm the caller can hear you. Keep replies under two sentences.",
        greeting_message: "Hi, this is a clinic test call. Can you hear me?",
        greeting_message_mode: "agent_static",
        llm: "gpt-4.1-Mini",
        language: "en-US",
        patience_level: "medium",
        allowed_idle_time_seconds: 60,
        send_user_idle_reminders: true,
        reminder_after_idle_time_seconds: 8,
        reminder_after_idle_message: "I'm still here — can you hear me?",
      },
    });
    console.log("created", JSON.stringify(created).slice(0, 500));
    const cResp = (created.response as Json | undefined) ?? created;
    const outboundId = String(cResp.model_id || created.model_id || "");
    console.log("outboundId", outboundId);

    if (outboundId) {
      // Try attaching clinic phone to outbound (may fail if exclusive to inbound)
      console.log("\n=== try PUT phone_numbers on outbound ===", phone);
      try {
        const put = await synthflowRequest(
          "PUT",
          `/assistants/${encodeURIComponent(outboundId)}/phone_numbers`,
          { phone_numbers: [phone] },
        );
        console.log("put phones ok", JSON.stringify(put).slice(0, 300));
      } catch (e) {
        console.log("put phones FAILED", e instanceof Error ? e.message : e);
      }

      const outbound = await getAssistant(outboundId);
      console.log(
        "outbound after phone attach",
        JSON.stringify({
          type: outbound.type,
          phone_number: outbound.phone_number,
          attached_phone_numbers: outbound.attached_phone_numbers,
        }),
      );

      // Check if inbound still has the phone
      const inboundAfter = await getAssistant(inboundId);
      console.log(
        "inbound after outbound phone attach",
        JSON.stringify({
          type: inboundAfter.type,
          phone_number: inboundAfter.phone_number,
          attached_phone_numbers: inboundAfter.attached_phone_numbers,
        }),
      );
    }
  } catch (e) {
    console.log("create outbound FAILED", e instanceof Error ? e.message : e);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
