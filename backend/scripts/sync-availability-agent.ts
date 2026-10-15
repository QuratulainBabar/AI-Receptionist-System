import "dotenv/config";
import { syncAgentWebhooksOnBoot } from "../src/services/synthflow.client.js";
import { syncClinicDirectoryToSynthflow } from "../src/services/clinic-synthflow.service.js";

async function main() {
  console.log("Syncing Synthflow webhooks + availability action + prompt rules…");
  await syncAgentWebhooksOnBoot();
  const clinic = await syncClinicDirectoryToSynthflow();
  console.log("clinic sync", clinic);
  console.log("DONE");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
