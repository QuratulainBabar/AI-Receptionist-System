import "dotenv/config";
import { env } from "../src/config/env.js";
import { synthflowRequest, updateAgent } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function readLlm(id: string) {
  const j = await synthflowRequest<Json>(
    "GET",
    `/assistants/${encodeURIComponent(id)}?include_actions=true`,
  );
  const r = ((j.response as Json | undefined) ?? j) as Json;
  const row = ((r.assistants as Json[] | undefined) ?? [r])[0] as Json;
  const agent = (row.agent as Json | undefined) ?? {};
  return String(agent.llm || "");
}

async function main() {
  const id = env.SYNTHFLOW_AGENT_ID.trim();
  const candidates = [
    "gpt-4.1-mini",
    "gpt-4.1-Mini",
    "gpt-4.1",
    "gpt-4.1-nano",
    "synthflow-premium",
    "gpt-5-mini",
    "gpt-5.4-mini",
  ];
  for (const llm of candidates) {
    try {
      await updateAgent(id, { agent: { llm } });
      const got = await readLlm(id);
      console.log(JSON.stringify({ tried: llm, got, match: got.toLowerCase() === llm.toLowerCase() || got === llm }));
      if (got !== "synthflow" && got.toLowerCase().includes("gpt")) {
        console.log("LOCKED_IN", got);
        break;
      }
    } catch (e) {
      console.log(JSON.stringify({ tried: llm, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  console.log("final", await readLlm(id));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
