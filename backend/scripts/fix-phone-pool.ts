import "dotenv/config";
import {
  attachAssistantPhoneNumbers,
  listAssistants,
  synthflowRequest,
} from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  const temp = "bf9557d6-f636-41ca-afa4-d2f0a78b46db";
  const out = "b05f8ab5-c7d8-48f0-bbf2-387cae58684f";
  const inbound = "ae627ca8-b2c2-42d8-9513-0ee5a3bd4ce0";
  const phone = "+14244849053";

  // Temp probe agent steals the clinic Twilio SID — delete it so dials can ring.
  try {
    const deleted = await synthflowRequest("DELETE", `/assistants/${encodeURIComponent(temp)}`);
    console.log("deleted_temp_probe", JSON.stringify(deleted).slice(0, 300));
  } catch (error) {
    console.warn(
      "delete_temp_failed",
      error instanceof Error ? error.message : error,
    );
    // Fallback: try slug detach
    try {
      const cleared = await synthflowRequest(
        "PUT",
        `/assistants/${encodeURIComponent(temp)}/phone_numbers`,
        { phone_number_slugs: [] },
      );
      console.log("cleared_via_slugs", JSON.stringify(cleared).slice(0, 300));
    } catch (e2) {
      console.warn("slug_clear_failed", e2 instanceof Error ? e2.message : e2);
    }
  }

  console.log("attach_out", JSON.stringify(await attachAssistantPhoneNumbers(out, [phone])).slice(0, 300));
  console.log(
    "attach_inbound",
    JSON.stringify(await attachAssistantPhoneNumbers(inbound, [phone])).slice(0, 300),
  );

  const listed = await listAssistants({ limit: 50 });
  const aResp = ((listed as Json).response as Json | undefined) ?? (listed as Json);
  const rows = (aResp.assistants as Json[] | undefined) ?? [];
  for (const r of rows) {
    const id = String(r.model_id || r.id || "");
    const name = String(r.name || "");
    if (!/outbound|receptionist|probe/i.test(name) && id !== inbound) continue;
    console.log(
      JSON.stringify({
        id,
        name,
        type: r.type,
        phone: r.phone_number,
        attached: r.attached_phone_numbers,
      }),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
