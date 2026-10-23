import "dotenv/config";
import { getPhoneCall, readCallStatus } from "../src/services/synthflow.client.js";

const id = process.argv[2] || "f655b686-cf24-465a-8e7b-aaad223c8d42";

async function main() {
  const d = await getPhoneCall(id);
  const root = d as Record<string, unknown>;
  const resp = (root.response as Record<string, unknown> | undefined) ?? {};
  const list = (resp.calls as Record<string, unknown>[] | undefined) ?? [];
  const call = (list[0] as Record<string, unknown> | undefined) ?? (resp.call as Record<string, unknown> | undefined) ?? resp;
  console.log(
    JSON.stringify(
      {
        status: readCallStatus(d),
        model: call.model_id,
        type: call.type_of_call,
        to: call.phone_number_to || call.lead_phone_number,
        from: call.phone_number_from,
        duration: call.duration,
        end: call.end_call_reason,
        err: call.error_message,
        transcript: String(call.transcript || "").slice(0, 600),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
