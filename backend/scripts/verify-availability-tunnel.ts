import "dotenv/config";
import {
  findAllActionIdsByName,
  getCustomActionUrl,
  syncCustomActionWebhookUrls,
  synthflowRequest,
} from "../src/services/synthflow.client.js";
import { env, synthflowWebhookUrls } from "../src/config/env.js";

async function main() {
  const urls = synthflowWebhookUrls();
  console.log("[verify] PUBLIC_API_URL =", env.PUBLIC_API_URL);
  console.log("[verify] expected availability =", urls.availabilityAction);

  const health = await fetch(`${env.PUBLIC_API_URL.replace(/\/$/, "")}/api/health`, {
    headers: { "ngrok-skip-browser-warning": "true" },
  });
  console.log("[verify] tunnel health", health.status, await health.text());

  await syncCustomActionWebhookUrls();
  const ids = await findAllActionIdsByName("check_doctor_availability");
  for (const id of ids) {
    const url = await getCustomActionUrl(id);
    console.log("[verify] Synthflow action", id, "→", url);
  }

  const avail = await fetch(urls.availabilityAction, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({ date: "today" }),
  });
  const body = await avail.json();
  console.log("[verify] availability response mode=", body.mode);
  console.log("[verify] message=", body.message);

  // Short outbound test call that only asks for today's schedule.
  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  const to = (process.argv[2] || env.SYNTHFLOW_PHONE_NUMBER || "").trim();
  if (!agentId || !to) {
    console.log("[verify] skip live call (no agent/phone)");
    return;
  }
  // Call a known test mobile if provided; otherwise skip dialing clinic number.
  const phone = process.argv[2];
  if (!phone) {
    console.log("[verify] pass a phone as argv to place a live test call, e.g. npx tsx scripts/verify-availability-tunnel.ts +92...");
    return;
  }

  console.log("[verify] placing test call →", phone);
  const started = await synthflowRequest("POST", "/calls", {
    model_id: agentId,
    phone,
    name: "Schedule Test",
    from_phone_number: env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053",
    greeting: "Hello, this is a short clinic schedule check.",
    prompt:
      "You are testing schedule lookup only. Immediately call check_doctor_availability with date today. Then say the returned message exactly. Do not book. Then say goodbye and end the call.",
  });
  console.log("[verify] call started", JSON.stringify(started).slice(0, 400));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
