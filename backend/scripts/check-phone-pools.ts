import "dotenv/config";
import { env } from "../src/config/env.js";
import { getPhoneCall, listAssistants, readCallStatus } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const listed = await listAssistants({ limit: 50 });
  const aResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];
  for (const r of rows) {
    const id = String(r.model_id || r.id || "");
    if (!id) continue;
    const name = String(r.name || "");
    if (
      !/outbound|receptionist|probe|ace/i.test(name) &&
      id !== env.SYNTHFLOW_AGENT_ID.trim()
    ) {
      continue;
    }
    console.log(
      JSON.stringify({
        id,
        name,
        type: r.type,
        phone_number: r.phone_number,
        attached_phone_numbers: r.attached_phone_numbers,
      }),
    );
  }

  const callId = process.argv[2];
  if (callId) {
    const d = await getPhoneCall(callId);
    const root = d as Json;
    const resp = (root.response as Json | undefined) ?? {};
    const list = (resp.calls as Json[] | undefined) ?? [];
    const call = (list[0] as Json | undefined) ?? (resp.call as Json | undefined) ?? resp;
    console.log(
      "\ncall",
      JSON.stringify(
        {
          status: readCallStatus(d),
          duration: call.duration,
          telephony_duration: call.telephony_duration,
          telephony_ringing_duration: call.telephony_ringing_duration,
          telephony_hangup: call.telephony_hangup,
          telephony_disconnect_reason: call.telephony_disconnect_reason,
          end: call.end_call_reason,
          to: call.phone_number_to || call.lead_phone_number,
          transcript_len: String(call.transcript || "").length,
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
