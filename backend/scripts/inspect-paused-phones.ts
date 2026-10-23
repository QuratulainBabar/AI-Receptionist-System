import "dotenv/config";
import { getPhoneCall } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

const IDS = [
  "bfab7ba7-efc0-4fd5-b648-30f444c57de2",
  "dd944167-1719-4016-9f6e-b64424b6a285",
  "add9ebf8-b8f0-4d89-ae8d-9fa3c0a434d5",
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
          name: call.name,
          model_id: call.model_id,
          phone_number_to: call.phone_number_to,
          phone_number_from: call.phone_number_from,
          start_time: call.start_time,
          campaign_type: call.campaign_type,
          error_message: call.error_message,
          type_of_call: call.type_of_call,
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
