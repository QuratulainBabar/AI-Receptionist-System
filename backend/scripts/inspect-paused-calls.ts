import "dotenv/config";
import { getPhoneCall, synthflowRequest } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

const IDS = [
  "bfab7ba7-efc0-4fd5-b648-30f444c57de2",
  "dd944167-1719-4016-9f6e-b64424b6a285",
  "add9ebf8-b8f0-4d89-ae8d-9fa3c0a434d5",
  "45cd8698-e9a8-4a28-9f8a-89eb379e08a4",
];

async function main() {
  for (const id of IDS) {
    const detail = await getPhoneCall(id);
    const root = detail as Json;
    const resp = (root.response as Json | undefined) ?? {};
    const list = (resp.calls as Json[] | undefined) ?? [];
    const call = (list[0] as Json | undefined) ?? (resp.call as Json | undefined) ?? resp;
    console.log(
      JSON.stringify(
        {
          id,
          status: call.status,
          type_of_call: call.type_of_call,
          name: call.name,
          phone_number: call.phone_number ?? call.to ?? call.phone,
          from_phone_number: call.from_phone_number,
          model_id: call.model_id,
          duration: call.duration,
          end_call_reason: call.end_call_reason,
          created_at: call.created_at ?? call.timestamp,
          error: call.error || call.error_message || call.failure_reason || null,
          raw_keys: Object.keys(call).slice(0, 40),
        },
        null,
        2,
      ),
    );
  }

  // Also dump list row fields for outbound agent latest
  const outId = "b05f8ab5-c7d8-48f0-bbf2-387cae58684f";
  const json = await synthflowRequest<Json>(
    "GET",
    `/calls?model_id=${encodeURIComponent(outId)}&limit=5`,
  );
  const resp = ((json.response as Json | undefined) ?? json) as Json;
  const calls = (resp.calls as Json[] | undefined) ?? [];
  console.log("\n--- outbound agent recent raw ---");
  console.log(JSON.stringify(calls.slice(0, 3), null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
