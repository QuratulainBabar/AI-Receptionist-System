import "dotenv/config";

const base = (process.env.SYNTHFLOW_API_BASE_URL || "").replace(/\/$/, "");
const key = process.env.SYNTHFLOW_API_KEY || "";

async function api(path) {
  const res = await fetch(`${base}${path}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
  });
  return res.json();
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseMaybe(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }
  return asRecord(value);
}

const ids = [
  "1c79b476-b73d-4517-975d-be8bda7b4bd2",
  "32dd68cb-2b7c-4d2e-9078-bcd375c61877",
  "7e8a93a6-6c45-4318-a0f0-0d3f651805d1",
];

for (const id of ids) {
  const payload = await api(`/calls/${encodeURIComponent(id)}`);
  const response = asRecord(payload.response);
  const callRow = asRecord(
    response.call || (Array.isArray(response.calls) ? response.calls[0] : undefined) || payload,
  );
  const executed = asRecord(callRow.executed_actions);
  console.log("\nCALL", id, callRow.type_of_call, callRow.phone_number_from, "->", callRow.phone_number_to);
  for (const [name, raw] of Object.entries(executed)) {
    const action = asRecord(raw);
    if (!/sms|otp|record/i.test(name + String(action.name || "") + String(action.action_type || ""))) continue;
    const hard = parseMaybe(action.parameters_hard_coded);
    const llm = parseMaybe(action.parameters_from_llm);
    console.log(
      JSON.stringify(
        {
          key: name,
          type: action.action_type,
          error: String(action.error_message || action.error || "").slice(0, 400),
          hard_to: hard.to_phone_number,
          hard_from: hard.from_phone_number,
          llm,
        },
        null,
        2,
      ),
    );
  }
}
