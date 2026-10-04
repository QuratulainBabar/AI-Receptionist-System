import dotenv from "dotenv";
dotenv.config();

async function main() {
  const base = (process.env.SYNTHFLOW_API_BASE_URL || "").replace(/\/$/, "");
  const id = "217bad9f-a259-4a1c-b96d-07b8f8f97102";
  const response = await fetch(`${base}/calls/${id}`, {
    headers: {
      Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}`,
      Accept: "application/json",
    },
  });
  const json = (await response.json()) as any;
  const call = json?.response?.calls?.[0] || {};
  console.log(
    JSON.stringify(
      {
        status: response.status,
        call_id: call.call_id,
        duration: call.duration,
        recording_url: call.recording_url ?? null,
        recording_sid: call.recording_sid ?? null,
        keys: Object.keys(call),
      },
      null,
      2,
    ),
  );

  // Also list recent calls and print ones with recordings
  const list = await fetch(`${base}/calls?limit=10`, {
    headers: {
      Authorization: `Bearer ${process.env.SYNTHFLOW_API_KEY}`,
      Accept: "application/json",
    },
  });
  const listJson = (await list.json()) as any;
  const calls = listJson?.response?.calls || [];
  console.log("recent calls with recording:");
  for (const c of calls) {
    console.log(
      JSON.stringify({
        call_id: c.call_id,
        duration: c.duration,
        recording_url: c.recording_url || null,
        status: c.status,
      }),
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
