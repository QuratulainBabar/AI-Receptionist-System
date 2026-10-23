/**
 * Fresh doctor test-call path (same as UI) — no reuse of prior probes.
 * Usage: npx tsx scripts/fresh-test-call.ts +923708321774
 */
import "dotenv/config";
import {
  getClinicReceptionistTestCall,
  startClinicReceptionistTestCall,
} from "../src/services/clinic-synthflow.service.js";
import { getPhoneCall, listAssistants } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const phone = (process.argv[2] || "").trim();
  if (!phone) {
    console.error("Usage: npx tsx scripts/fresh-test-call.ts <+E164 mobile>");
    process.exit(1);
  }

  const listed = await listAssistants({ limit: 50 });
  const aResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];
  console.log(
    "preflight_outbound",
    rows
      .filter((r) => String(r.type || "").toLowerCase() === "outbound")
      .map((r) => ({
        id: String(r.model_id || r.id || ""),
        name: String(r.name || ""),
        phone: String(r.phone_number || ""),
        attached: r.attached_phone_numbers,
      })),
  );

  console.log("starting_test_call", phone);
  const started = await startClinicReceptionistTestCall({ phone });
  console.log("started", JSON.stringify(started, null, 2));

  const detail = await getPhoneCall(started.callId);
  const root = detail as Json;
  const resp = (root.response as Json | undefined) ?? {};
  const list = (resp.calls as Json[] | undefined) ?? [];
  const call = (list[0] as Json | undefined) ?? (resp.call as Json | undefined) ?? resp;
  console.log(
    "immediate_detail",
    JSON.stringify(
      {
        callId: started.callId,
        status: call.status,
        model_id: call.model_id,
        type_of_call: call.type_of_call,
        name: call.name,
        to: call.phone_number_to ?? call.lead_phone_number,
        from: call.phone_number_from,
        error_message: call.error_message,
      },
      null,
      2,
    ),
  );

  for (let i = 0; i < 10; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const status = await getClinicReceptionistTestCall(started.callId);
    console.log(`poll_${i + 1}`, JSON.stringify(status));
    if (status.finished) break;
  }
}

main().catch((e) => {
  console.error("FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});
