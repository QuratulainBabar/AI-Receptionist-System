/**
 * Verify call-health + test-call validation (does not dial a live number unless argv phone is passed).
 * Run: npx tsx scripts/verify-clinic-test-call.ts
 * Live dial: npx tsx scripts/verify-clinic-test-call.ts +1...
 */
import "dotenv/config";
import {
  getClinicCallHealth,
  getClinicReceptionistTestCall,
  startClinicReceptionistTestCall,
} from "../src/services/clinic-synthflow.service.js";

async function main() {
  console.log("--- call health ---");
  const health = await getClinicCallHealth();
  console.log(JSON.stringify(health, null, 2));

  console.log("\n--- validation: reject clinic line ---");
  try {
    await startClinicReceptionistTestCall({ phone: health.clinicPhone || "+14244849053" });
    console.log("UNEXPECTED: clinic line was accepted");
  } catch (error) {
    console.log("OK rejected:", error instanceof Error ? error.message : error);
  }

  const phone = (process.argv[2] || "").trim();
  if (!phone) {
    console.log("\nPass a personal mobile as argv to place a live test call.");
    return;
  }

  console.log("\n--- live test call ---", phone);
  const started = await startClinicReceptionistTestCall({ phone });
  console.log(started);

  for (let i = 0; i < 8; i += 1) {
    await new Promise((r) => setTimeout(r, 4000));
    const status = await getClinicReceptionistTestCall(started.callId);
    console.log(`poll ${i + 1}`, status);
    if (status.finished) break;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
