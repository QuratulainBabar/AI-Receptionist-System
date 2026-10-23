import "dotenv/config";
import { listAssistants } from "../src/services/synthflow.client.js";

type Json = Record<string, unknown>;

async function main() {
  for (let page = 0; page < 3; page += 1) {
    const json = await listAssistants({ limit: 50, offset: page * 50 });
    const resp = ((json as Json).response as Json | undefined) ?? (json as Json);
    const assistants = (resp.assistants as Json[] | undefined) ?? [];
    if (!assistants.length) break;
    for (const row of assistants) {
      console.log(
        JSON.stringify({
          model_id: row.model_id ?? row.id,
          name: row.name,
          type: row.type,
          phone_number: row.phone_number,
          caller_id_number: row.caller_id_number,
        }),
      );
    }
    if (assistants.length < 50) break;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
