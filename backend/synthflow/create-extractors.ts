/**
 * Creates clinic Information Extractor actions in Synthflow (workspace-level).
 * After running, reopen Attach Action → After Conversation and search for these names.
 *
 * Usage (from backend/):
 *   npx tsx synthflow/create-extractors.ts
 */
import "dotenv/config";

const apiKey = process.env.SYNTHFLOW_API_KEY?.trim();
const baseUrl = (process.env.SYNTHFLOW_API_BASE_URL || "https://api.us.synthflow.ai/v2").replace(
  /\/$/,
  "",
);

if (!apiKey) {
  console.error("Missing SYNTHFLOW_API_KEY in backend/.env");
  process.exit(1);
}

type Extractor = {
  identifier: string;
  description: string;
  examples: string[];
};

const extractors: Extractor[] = [
  {
    identifier: "patient_name",
    description: "What is the patient's full name?",
    examples: ["Maya Okonkwo", "Qurat ul Ain", "Zain Ali"],
  },
  {
    identifier: "phone",
    description:
      "What contact phone number did the patient give? If they said same number, use the calling number. Answer none if unknown.",
    examples: ["+14155550148", "+12202205898", "none"],
  },
  {
    identifier: "patient_id",
    description: "What is the patient id if mentioned? Answer none if not mentioned.",
    examples: ["cmu16ks980000vgiskmz82f6v", "none"],
  },
  {
    identifier: "doctor_name",
    description: "Which doctor did the patient book with? Answer none if no doctor was chosen.",
    examples: ["Dr. Daniel Osei", "Dr. Priya Raman", "none"],
  },
  {
    identifier: "doctor_id",
    description: "What is the doctor_id if mentioned? Answer none if not mentioned.",
    examples: ["cmu16ksa00001vgis6s1oq1m9", "none"],
  },
  {
    identifier: "slot_id",
    description: "What is the appointment slot_id if mentioned? Answer none if not mentioned.",
    examples: ["cmu2awlf40008vgfsoulh0ck4", "none"],
  },
  {
    identifier: "appointment_datetime",
    description:
      "What appointment date and time did the patient confirm? Answer none if not confirmed.",
    examples: ["Thursday Sep 17 at 10:30 AM", "Tomorrow at 2 PM", "none"],
  },
  {
    identifier: "specialty",
    description: "Which specialty did the patient need? Answer none if unclear.",
    examples: ["Cardiology", "Dermatology", "General Medicine", "none"],
  },
  {
    identifier: "reason",
    description: "What is the brief reason for the visit? Answer none if not given.",
    examples: ["Chest pain follow-up", "Skin rash", "Routine checkup", "none"],
  },
  {
    identifier: "email",
    description: "What email did the patient give for confirmation? Answer none if declined or missing.",
    examples: ["patient@example.com", "none"],
  },
];

async function createOpenQuestionExtractor(extractor: Extractor) {
  const response = await fetch(`${baseUrl}/actions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      INFORMATION_EXTRACTOR: {
        OPEN_QUESTION: {
          identifier: extractor.identifier,
          description: extractor.description,
          examples: extractor.examples,
        },
      },
    }),
  });

  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    // keep raw text
  }

  if (!response.ok) {
    throw new Error(
      `${extractor.identifier} failed (${response.status}): ${typeof parsed === "string" ? parsed : JSON.stringify(parsed)}`,
    );
  }

  return parsed;
}

async function main() {
  console.log(`Creating ${extractors.length} extractors via ${baseUrl}/actions ...`);
  for (const extractor of extractors) {
    try {
      const result = await createOpenQuestionExtractor(extractor);
      console.log(`OK  ${extractor.identifier}`, result);
    } catch (error) {
      console.error(`ERR ${extractor.identifier}:`, error instanceof Error ? error.message : error);
    }
  }
  console.log("\nNext: In Synthflow → Actions → After Conversation → + Add");
  console.log("Search for: patient_name, phone, doctor_id, slot_id, reason, ... and attach them.");
}

void main();
