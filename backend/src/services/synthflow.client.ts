import { env, synthflowWebhookUrls } from "../config/env.js";
import { greetingWithOpeningLine } from "./clinic-doctor.service.js";
import { normalizePhone } from "../utils/phone.js";

type SynthflowJson = Record<string, unknown>;

function apiBase() {
  return env.SYNTHFLOW_API_BASE_URL.replace(/\/$/, "");
}

export function isSynthflowConfigured() {
  return Boolean(env.SYNTHFLOW_API_KEY.trim());
}

export async function synthflowRequest<T = SynthflowJson>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  if (!isSynthflowConfigured()) {
    throw new Error("SYNTHFLOW_API_KEY is not configured");
  }

  const url = `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${env.SYNTHFLOW_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    // Without a cap, one stalled Synthflow request hangs the dashboard ("Calling…" forever).
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!response.ok) {
    let message = text || response.statusText;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      const detail = obj.detail;
      if (detail && typeof detail === "object") {
        const d = detail as Record<string, unknown>;
        if (typeof d.description === "string" && d.description.trim()) {
          message = d.description;
        }
      } else if (typeof obj.message === "string") {
        message = obj.message;
      } else if (typeof obj.error === "string") {
        message = obj.error;
      }
    }
    const err = new Error(`Synthflow ${method} ${path} failed (${response.status}): ${message}`);
    (err as Error & { status?: number; payload?: unknown }).status = response.status;
    (err as Error & { status?: number; payload?: unknown }).payload = parsed;
    throw err;
  }

  return parsed as T;
}

export function toSynthflowLanguage(code: string) {
  const c = String(code || "en").toLowerCase();
  const map: Record<string, string> = {
    en: "en-US",
    es: "es-ES",
    fr: "fr-FR",
    de: "de-DE",
    hi: "hi-IN",
    ar: "ar-SA",
    ur: "ur-PK",
  };
  if (c.includes("-")) return c;
  return map[c] || "en-US";
}

export async function listAssistants(opts?: { limit?: number; offset?: number }) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return synthflowRequest("GET", `/assistants?limit=${limit}&offset=${offset}`);
}

export async function createInboundAgent(payload: Record<string, unknown>) {
  return synthflowRequest("POST", "/assistants", {
    type: "inbound",
    voice_engine_version: "2.0",
    is_recording: true,
    ...payload,
  });
}

export async function createOutboundAgent(payload: Record<string, unknown>) {
  return synthflowRequest("POST", "/assistants", {
    type: "outbound",
    voice_engine_version: "2.0",
    is_recording: true,
    ...payload,
  });
}

/**
 * Attach (or clear) phone numbers on an assistant pool.
 * Pass an empty array to detach all numbers — required so competing outbound
 * agents do not share the clinic caller ID (that yields paused / no-ring dials).
 */
export async function attachAssistantPhoneNumbers(modelId: string, phoneNumbers: string[]) {
  const phones = [...new Set(phoneNumbers.map((p) => normalizePhone(p)).filter(Boolean))];
  return synthflowRequest("PUT", `/assistants/${encodeURIComponent(modelId)}/phone_numbers`, {
    phone_numbers: phones,
  });
}

export async function updateAgent(modelId: string, payload: Record<string, unknown>) {
  return synthflowRequest("PUT", `/assistants/${encodeURIComponent(modelId)}`, payload);
}

/** Action IDs currently attached to an assistant (requires include_actions). */
export async function listAssistantActionIds(modelId: string): Promise<string[]> {
  const json = await synthflowRequest<SynthflowJson>(
    "GET",
    `/assistants/${encodeURIComponent(modelId)}?include_actions=true`,
  );
  const response = (json.response as SynthflowJson | undefined) ?? json;
  const assistants = (response.assistants as unknown[]) || [];
  const row = (Array.isArray(assistants) && assistants[0]
    ? (assistants[0] as Record<string, unknown>)
    : (response as Record<string, unknown>)) as Record<string, unknown>;
  const actions = row.actions;
  if (!Array.isArray(actions)) return [];
  return actions.map((id) => String(id || "").trim()).filter(Boolean);
}

export async function detachActions(modelId: string, actionIds: string[]) {
  const ids = [...new Set(actionIds.filter(Boolean))];
  if (!ids.length) return null;
  // Synthflow accepts a batch; chunk to stay under request size limits.
  for (let i = 0; i < ids.length; i += 80) {
    const chunk = ids.slice(i, i + 80);
    await synthflowRequest("POST", "/actions/detach", {
      model_id: modelId,
      actions: chunk,
    });
  }
  return { detached: ids.length };
}

/**
 * Detach every action not in keepIds, then attach keepIds.
 * Stops the agent from drowning in duplicate extractors/custom actions
 * (we have seen 1000+ attachments, which stalls the conversation after the greeting).
 */
export async function reconcileAssistantActions(modelId: string, keepIds: string[]) {
  const keep = [...new Set(keepIds.filter(Boolean))];
  const current = await listAssistantActionIds(modelId).catch(() => [] as string[]);
  const keepSet = new Set(keep);
  const toDetach = current.filter((id) => !keepSet.has(id));
  if (toDetach.length) {
    console.log(
      `[synthflow] Reconciling agent ${modelId}: detaching ${toDetach.length} excess action(s), keeping ${keep.length}`,
    );
    await detachActions(modelId, toDetach);
  }
  if (keep.length) {
    await attachActions(modelId, keep);
  }
  const after = await listAssistantActionIds(modelId).catch(() => [] as string[]);
  return {
    before: current.length,
    detached: toDetach.length,
    keep: keep.length,
    after: after.length,
  };
}

export async function updateAssistantWebhooks(modelId: string) {
  const urls = synthflowWebhookUrls();
  return updateAgent(modelId, {
    inbound_call_webhook_url: urls.inbound,
    external_webhook_url: urls.data,
  });
}

export async function createInformationExtractor(input: {
  kind: "OPEN_QUESTION" | "YES_NO" | "SINGLE_CHOICE";
  identifier: string;
  description: string;
  examples?: string[];
  choices?: string[];
}) {
  const inner: Record<string, unknown> = {
    identifier: input.identifier,
    description: input.description,
  };
  if (input.kind === "OPEN_QUESTION" && input.examples?.length) inner.examples = input.examples;
  if (input.kind === "SINGLE_CHOICE" && input.choices?.length) inner.choices = input.choices;

  invalidateSynthflowActionsCache();
  const json = await synthflowRequest<SynthflowJson>("POST", "/actions", {
    INFORMATION_EXTRACTOR: {
      [input.kind]: inner,
    },
  });

  const response = (json.response as SynthflowJson | undefined) ?? {};
  const actionId =
    (response.action_id as string | undefined) ||
    (json.action_id as string | undefined) ||
    (response.id as string | undefined) ||
    (json.id as string | undefined) ||
    null;

  return { raw: json, action_id: actionId };
}

export async function createCustomAction(input: {
  name: string;
  description: string;
  url: string;
  jsonBody: Record<string, string>;
  variables: { name: string; description: string; example: string }[];
  prompt?: string;
  messageError?: string;
}) {
  invalidateSynthflowActionsCache();
  const json = await synthflowRequest<SynthflowJson>("POST", "/actions", {
    CUSTOM_ACTION: {
      http_mode: "POST",
      url: input.url,
      run_action_before_call_start: false,
      name: input.name,
      description: input.description,
      variables_during_the_call: input.variables.map((variable) => ({
        name: variable.name,
        type: "string",
        description: variable.description,
        example: variable.example,
      })),
      json_body_stringified: JSON.stringify(input.jsonBody),
      prompt: input.prompt,
      message_error: input.messageError,
      // Avoid "Got it… checking" filler while the HTTP tool runs (adds perceived latency).
      agent_speak_naturally: false,
      speech_while_using_the_tool: "",
    },
  });

  const response = (json.response as SynthflowJson | undefined) ?? {};
  const actionId =
    (response.action_id as string | undefined) ||
    (json.action_id as string | undefined) ||
    (response.id as string | undefined) ||
    (json.id as string | undefined) ||
    null;

  return { raw: json, action_id: actionId };
}

type ListedAction = {
  id: string;
  name: string;
  assistants: string[];
};

let actionsCatalogCache: { at: number; rows: ListedAction[] } | null = null;
const ACTIONS_CATALOG_TTL_MS = 45_000;

/** Invalidate cached /actions list after creates/updates/deletes. */
export function invalidateSynthflowActionsCache() {
  actionsCatalogCache = null;
  workspaceActionIdsCache = null;
}

async function loadActionsCatalog(force = false): Promise<ListedAction[]> {
  if (
    !force &&
    actionsCatalogCache &&
    Date.now() - actionsCatalogCache.at < ACTIONS_CATALOG_TTL_MS
  ) {
    return actionsCatalogCache.rows;
  }

  const rows: ListedAction[] = [];
  for (let offset = 0; offset < 500; offset += 100) {
    try {
      const json = await synthflowRequest<SynthflowJson>(
        "GET",
        `/actions?limit=100&offset=${offset}`,
      );
      const response = (json.response as SynthflowJson | undefined) ?? {};
      const actions = (response.actions as unknown[]) || (json.actions as unknown[]) || [];
      if (!Array.isArray(actions) || !actions.length) break;
      for (const raw of actions) {
        const row = raw as Record<string, unknown>;
        const id = String(row.action_id || row.id || "").trim();
        if (!id) continue;
        const name = String(row.name || row.action_name || row.identifier || "")
          .trim()
          .toLowerCase();
        const assistants = Array.isArray(row.assistants)
          ? row.assistants.map((value) => String(value))
          : [];
        rows.push({ id, name, assistants });
      }
      if (actions.length < 100) break;
    } catch (error) {
      console.warn(
        "[synthflow] list actions failed:",
        error instanceof Error ? error.message : error,
      );
      break;
    }
  }

  actionsCatalogCache = { at: Date.now(), rows };
  return rows;
}

async function listActionsByName(name: string): Promise<Array<{ id: string; assistants: string[]; name: string }>> {
  const want = name.trim().toLowerCase();
  if (!want) return [];
  const catalog = await loadActionsCatalog();
  // Synthflow names information extractors "info_extractor_<identifier>".
  // Older code looked up bare identifiers (patient_name) and created a new
  // extractor on every sync — that piled 100+ copies onto the inbound agent.
  const aliases = new Set([want, `info_extractor_${want}`]);
  return catalog
    .filter((row) => aliases.has(row.name))
    .map((row) => ({ id: row.id, assistants: row.assistants, name: row.name }));
}

export async function findActionIdByName(name: string, preferredModelId?: string) {
  const matches = await listActionsByName(name);
  if (!matches.length) return null;
  if (preferredModelId) {
    const attached = matches.find((row) => row.assistants.includes(preferredModelId));
    if (attached) return attached.id;
  }
  // Prefer exact name, then info_extractor_*, then first match.
  const want = name.trim().toLowerCase();
  const exact = matches.find((row) => row.name === want);
  if (exact) return exact.id;
  const extractor = matches.find((row) => row.name === `info_extractor_${want}`);
  if (extractor) return extractor.id;
  return matches[0].id;
}

/** Every action id with this name — duplicates keep stale tunnels unless all are rewritten. */
export async function findAllActionIdsByName(name: string) {
  return (await listActionsByName(name)).map((row) => row.id);
}

export async function getCustomActionUrl(actionId: string) {
  const json = await synthflowRequest<SynthflowJson>(
    "GET",
    `/actions/${encodeURIComponent(actionId)}`,
  );
  const response = (json.response as SynthflowJson | undefined) ?? {};
  const actions = (response.actions as unknown[]) || [];
  const first = (Array.isArray(actions) ? actions[0] : null) as Record<string, unknown> | null;
  const params = (first?.parameters_hard_coded as Record<string, unknown> | undefined) ?? {};
  return typeof params.url === "string" ? params.url : null;
}

/** Update only the webhook URL on an existing custom action. */
export async function updateCustomActionUrl(actionId: string, url: string) {
  return synthflowRequest("PUT", `/actions/${encodeURIComponent(actionId)}`, {
    CUSTOM_ACTION: { url },
  });
}

/**
 * Keep book/availability custom actions pointed at the current PUBLIC_API_URL.
 * Existing actions keep stale ngrok tunnels unless refreshed.
 */
const OPENING_RULE = `OPENING RULE:
The greeting already includes the clinic welcome, the doctor's name, and the consultation fee only when that doctor has a fee.
If the greeting did not already say the doctor's name, say only opening_doctor_line, then ask how you can help.
If the caller asks about the doctor, answer from the latest Clinic doctor profile (specialty, experience, qualifications, certifications, expertise, languages, hospital, location, fee, consultation type/services, about). Never invent missing details.`;

const FAST_RESPONSE_RULE = `FAST RESPONSE RULE (CRITICAL — NO DEAD AIR — HIGHEST PRIORITY):
After your greeting, WAIT silently for the caller. Do NOT say "Sorry, could you say that again?" after the greeting unless the caller already spoke and you truly could not hear them.
When the caller speaks, reply in one short sentence. Never go silent. Never invent filler like "Got it, checking", "one moment", or "just a second" before a tool — call the tool, then speak the tool message.
BOOKING INTENT (booking, schedule, appointment, visit, apartment/misheard book, or "I want to…"):
- Speak IMMEDIATELY — do not call any action first.
- Say EXACTLY: "Which day would you like your appointment?" Then STOP and WAIT.
- Do NOT call check_doctor_availability, check_existing_appointment, book_appointment, verify_booking_otp, or any SMS action on this turn.
Generic booking intent is NOT an availability question. Ask which day first; call tools only after they name a day or ask which days/times are open.`;

const LISTENING_CAPTURE_RULE = `LISTENING & CAPTURE RULE (NAMES, PHONES, OTP — CRITICAL):
- Let the caller finish speaking. Do not interrupt mid-name or mid-number.
- ONE question per turn. Never ask name and phone in the same turn.
- FULL NAME: After they answer, briefly confirm once: "I heard [name]. Is that right?" If they say no or correct it, use their correction. If still unclear, ask once: "Please say your full name slowly." Never store garbage like random words; never invent a name.
- PHONE: Ask them to say digits one by one. Convert spoken digit words (oh/zero, double three) to digits. Confirm once by reading the digits back. Never invent or swap a number.
- OTP: As soon as they say six digits (or one-two-three-four-five-six), call verify_booking_otp immediately with those digits. Do not say "one moment" first.
- If you already captured a clear answer, do not ask the same question again.`;

const AVAILABILITY_SPEAK_RULE = `AVAILABILITY SPEAK RULE (FOLLOW EXACTLY — NEVER REFUSE TO CHECK):
HARD RULE — REAL DATABASE SLOTS ONLY:
- You may speak ONLY dates and times returned by the latest check_doctor_availability message / spoken_summary.
- NEVER invent a date or time. NEVER guess. NEVER use "Usual weekly hours", memory, or any Open slot ids list in the prompt to answer the caller.
- Scope is ONLY today and the current seven days from the tool. If a day is not in the tool response, that day is NOT available — do not mention it.
SPEAKING: Speak clearly at a natural pace. Brief pause only after questions or between listed times — never before your first words.
EXCEPTION TO BREVITY: When answering availability, say the FULL message / spoken_summary from check_doctor_availability word-for-word (word limits do not apply). Then WAIT.
- If the message says "today" or "tomorrow", speak those exact words — do not replace them with a calendar date.
PRIORITY — AVAILABILITY QUESTIONS OVERRIDE BOOKING ORDER:
- TODAY / open times today / what times are free today → do NOT ask which day. Immediately call check_doctor_availability with date "today". Say the returned message exactly, then WAIT.
- This week / weekly schedule / which days available / available days / which days is the doctor in → do NOT ask which day first. Immediately call check_doctor_availability with date empty (""). Say the returned message exactly (open days this week), then WAIT.
BOOKING ORDER (only when they want to book and have NOT already asked for today's times or the weekly list):
1. Reply RIGHT AWAY with ONLY: "Which day would you like your appointment?" Then STOP and WAIT. Do not list dates. Do not call any action yet.
2. If they name a day (today, tomorrow, Friday, October 22…), call check_doctor_availability with that date. Say message / spoken_summary exactly. Ask which time. Then WAIT.
3. Only if they say they do not know, call check_doctor_availability with date empty. Say message / spoken_summary exactly. Ask which date. Then WAIT.
4. After they pick a real open time, you MUST follow DETAILS COLLECTION RULE below (never skip; never jump to OTP).
Never recite open slots from the doctor profile. Bookable times come only from check_doctor_availability.

DETAILS COLLECTION RULE — AFTER TIME IS CHOSEN (one question per turn, then WAIT):
A. Ask exactly: "May I have your full name?" Then STOP and WAIT.
B. After they give their name, ask exactly: "What is the reason for your visit today?" Then STOP and WAIT. Do not ask for the phone yet.
C. After they give the reason, ask exactly: "What phone number should we use for this booking?" Then STOP and WAIT.
D. After they give the phone number, follow PHONE APPOINTMENT RULE (thank-you line → check_existing_appointment → book only if clear → then OTP).
NEVER ask only for the name and then book or ask for a verification code.
NEVER skip the reason. NEVER skip the phone number. NEVER skip the existing-appointment check.`;

const PHONE_APPOINTMENT_RULE = `PHONE APPOINTMENT RULE (FOLLOW BEFORE ANY BOOKING):
When collecting the booking phone: listen for spoken digits (including "plus", "oh", "double"), keep the exact number the caller said, and if unclear ask them to repeat slowly. Never invent or substitute a different number.
Only after you already have: (1) chosen time, (2) full name, (3) visit reason, and (4) booking phone — say exactly: "Thank you. Let me check whether there is already an active appointment associated with this number."
Then IMMEDIATELY call check_existing_appointment with that exact phone the caller spoke (never skip; never call book_appointment first). Do not call check_existing_appointment when they only said their name or only the reason.
If has_active_appointment is true, say the action message exactly and STOP. Do not call book_appointment. Do not ask for a verification code.
If the caller asks "is my appointment confirmed?", say no. The new appointment was not booked. Only the older appointment is still confirmed.
If has_active_appointment is false, or the previous appointment is Completed or Cancelled, you MUST next call book_appointment with doctor_id, slot_id, patient_name, phone, and reason. Do NOT ask for a verification code yet. Do NOT call verify_booking_otp yet.
Never say a new appointment is booked or confirmed unless verify_booking_otp returns appointment_confirmed true.`;

const BOOKING_OTP_RULE = `BOOKING OTP RULE — MANDATORY ORDER (never skip a step):
The appointment is not booked and not confirmed until verify_booking_otp returns appointment_confirmed true.
After the caller picks a real open time, collect details in this exact order (one question, then WAIT — never combine):
1. Ask for full name. WAIT.
2. Ask for the reason for the visit. WAIT. (Required — never skip.)
3. Ask for the booking phone number. WAIT. (Required — never skip.)
4. Say exactly: "Thank you. Let me check whether there is already an active appointment associated with this number."
5. MUST call check_existing_appointment with the exact booking phone the caller spoke (never skip; pass the real digits, never invent a number).
6. If has_active_appointment is true, say the action message exactly and STOP. Do not book. Do not ask for a code.
7. If has_active_appointment is false, you MUST call book_appointment with doctor_id, real slot_id from check_doctor_availability, patient_name, phone, and reason. This only holds the time.
8. ONLY after book_appointment returns success true (and otp_required true): ask exactly "Please say the six-digit verification code." Then WAIT for their reply.
9. As soon as they reply with any digits or digit-words (for testing the code is 123456 / one two three four five six), IMMEDIATELY call verify_booking_otp. Put the digits in the otp field as 123456 when that is what they said. Do NOT say "sorry I did not catch that" before calling the action.
10. Say the verify_booking_otp response message exactly. If appointment_confirmed is true, give the final appointment summary, then follow RECORDS UPLOAD OFFER RULE.
If appointment_confirmed is false, say the message. If it says to call book_appointment first, do that before asking for a code again.
If the action fails or otp was empty, ask once: "Please say the six digits one by one, slowly." Then WAIT and call verify_booking_otp again with what they said.
NEVER ask for a verification code before name, reason, phone, check_existing_appointment, and book_appointment all succeed in this call.
NEVER call verify_booking_otp before book_appointment succeeds in this call.
NEVER call book_appointment before check_existing_appointment succeeds with has_active_appointment false in this call.
NEVER speak OTP digits aloud to the caller. You MAY and MUST pass the digits into verify_booking_otp.otp (testing code 123456).
Never invent a confirmation. Never say the visit is booked before verify_booking_otp returns appointment_confirmed true.`;

const RECORDS_UPLOAD_OFFER_RULE = `RECORDS UPLOAD OFFER RULE:
After verify_booking_otp returns appointment_confirmed true, first say the confirmation message (final appointment summary) exactly.
Then ask exactly in English: Would you like to share your medical records or any relevant files with the doctor?
WAIT for the caller to answer.
If they say yes (or clearly agree), do NOT call any action yet. Ask exactly: "What email address should we use to share your medical records upload link?" WAIT.
Repeat the email back clearly (say "at" for @ and "dot" for .), then ask exactly: "Is that email address correct?" WAIT.
If they say it is wrong, ask for the corrected email, repeat it, and ask "Is that email address correct?" again. Repeat until they confirm.
Only after they confirm, call offer_records_upload with consent yes, email set to the confirmed address (example patient@example.com), email_confirmed yes, the booking phone, and appointment_reference. Say the action message exactly.
Only say the email was sent if offer_records_upload returns records_email_sent true. If records_email_sent is false, say the action message exactly — never claim it was sent.
If they say no (or decline), do not ask for an email. Call offer_records_upload with consent no. Say the action message and continue normally.
NEVER text the upload link: do not call send_records_upload_link or deliver_records_upload_sms for records on an inbound booking call. NEVER place a second outbound call for the upload link. NEVER read the URL aloud.
Do not require an upload. Do not invent an upload link, email address, or phone number.
Do not run this rule before the appointment is confirmed.`;

/** Prefix rules baked into every Sync so Fine-tuner matches live calls. */
export function synthflowPromptRulePrefix() {
  return `${OPENING_RULE}\n\n${FAST_RESPONSE_RULE}\n\n${BOOKING_OTP_RULE}\n\n${RECORDS_UPLOAD_OFFER_RULE}\n\n${AVAILABILITY_SPEAK_RULE}\n\n${PHONE_APPOINTMENT_RULE}`;
}

/**
 * Compact rules for the live phone agent. The workspace LLM is locked to
 * `synthflow` (API cannot switch to GPT). A 24KB duplicated prompt caused the
 * model to greet then go silent instead of following booking intent.
 */
export function synthflowCompactLivePrompt(input: {
  clinicName: string;
  clinicDoctorBlock: string;
}) {
  return `You are the polite, calm, concise AI phone receptionist for ${input.clinicName}. This clinic has ONE doctor. Never invent doctors, fees, dates, or times.

${FAST_RESPONSE_RULE}

${LISTENING_CAPTURE_RULE}

${AVAILABILITY_SPEAK_RULE}

${PHONE_APPOINTMENT_RULE}

${BOOKING_OTP_RULE}

${RECORDS_UPLOAD_OFFER_RULE}

${OPENING_RULE}

SPEECH RULES:
- Keep every reply to 1–2 short sentences except when reading a full availability spoken_summary.
- Ask only one question per turn, then WAIT.
- Never go silent after the caller speaks.
- Never give medical advice.
- Never say "Got it, checking", "one moment", or "just a second" — speak the real next question or the tool message.

${input.clinicDoctorBlock}`;
}

export async function syncCustomActionWebhookUrls(modelId?: string) {
  const urls = synthflowWebhookUrls();
  const pairs = [
    {
      name: "book_appointment",
      url: urls.bookAction,
      prompt:
        "Only call this AFTER check_existing_appointment returned has_active_appointment false. REQUIRED before any verification code. This does not book or confirm the appointment. If success is true, the time is only on hold — then ask the caller to say the six-digit verification code, WAIT, and call verify_booking_otp. Never say OTP digits aloud. Confirm only when appointment_confirmed is true. If success is false, say the message exactly and do not ask for a code.",
      message_error:
        "I could not hold that appointment time. Please say another open time from the schedule, or confirm the booking details.",
      jsonBody: {
        doctor_name: "<doctor_name>",
        doctor_id: "<doctor_id>",
        slot_id: "<slot_id>",
        patient_name: "<patient_name>",
        phone: "<phone>",
        reason: "<reason>",
        caller_phone: "<user_phone_number>",
      },
      create: {
        description:
          "REQUIRED after check_existing_appointment clears (has_active_appointment false). Hold a real open slot_id for OTP verification. Call this before asking for any verification code.",
        jsonBody: {
          doctor_name: "<doctor_name>",
          doctor_id: "<doctor_id>",
          slot_id: "<slot_id>",
          patient_name: "<patient_name>",
          phone: "<phone>",
          reason: "<reason>",
          caller_phone: "<user_phone_number>",
        },
        variables: [
          {
            name: "doctor_name",
            description: "Clinic doctor name",
            example: "Daniel Osei",
          },
          {
            name: "doctor_id",
            description: "doctor_id from the Clinic doctor block",
            example: "cmv4udnmu000074tukvml2t6m",
          },
          {
            name: "slot_id",
            description: "Real open slot id from check_doctor_availability (never invent)",
            example: "cmv96y3ql000y74y1abmfy5fs",
          },
          {
            name: "patient_name",
            description: "Caller full name for the appointment",
            example: "Ali Hamza",
          },
          {
            name: "phone",
            description:
              "Exact booking mobile the caller spoke, as digits with country code when known (convert spoken words like nine two three to 923…). Never invent a number.",
            example: "+12014799258",
          },
          {
            name: "reason",
            description: "Visit reason",
            example: "Follow-up checkup",
          },
          {
            name: "user_phone_number",
            description: "Inbound caller phone; always send as caller_phone",
            example: "+12014799258",
          },
        ],
      },
    },
    {
      name: "check_doctor_availability",
      url: urls.availabilityAction,
      prompt:
        "REQUIRED — say the response message field EXACTLY (same as spoken_summary), then WAIT. Do not add, remove, or invent any date or time. If mode is dates, those are the ONLY open days this week from the doctor dashboard database. If mode is slots, those are the ONLY open times for that day. Call for today's times (date=today), this week's days (date empty), or after they name a day — never on a plain 'I want to book' turn.",
      message_error: "I could not load open times just now. Which day would you like instead?",
      jsonBody: { date: "<date>" },
      create: {
        description:
          "Return live open dates for the current seven days, or open times for one day, from the Doctor Dashboard database only. Call for today's availability (date=today), this week's open days (date empty), or after they name a day. Do NOT call when the caller only says they want to book — ask which day first.",
        jsonBody: { date: "<date>" },
        variables: [
          {
            name: "date",
            description:
              "Use empty for this week's open days. Use today for today's open times. Or pass a chosen day (tomorrow, Wednesday, October 22).",
            example: "today",
          },
        ],
      },
    },
    {
      name: "check_existing_appointment",
      url: urls.checkAppointmentAction,
      prompt:
        "REQUIRED after reason and contact number. First say exactly: Thank you. Let me check whether there is already an active appointment associated with this number. Then call this with the caller's exact booking phone. If has_active_appointment is true, say the message exactly and STOP — do not book and do not ask for a code. If has_active_appointment is false, IMMEDIATELY call book_appointment with doctor_id, slot_id, patient_name, phone, and reason. Do NOT ask for a verification code until book_appointment succeeds.",
      message_error: "Please repeat the phone number so I can check existing appointments.",
      jsonBody: { phone: "<phone>", caller_phone: "<user_phone_number>" },
      create: {
        description:
          "Check whether this phone number already has a Pending or Confirmed appointment. After collecting reason and phone, say the thank-you check line, then call this before book_appointment.",
        jsonBody: { phone: "<phone>", caller_phone: "<user_phone_number>" },
        variables: [
          {
            name: "phone",
            description:
              "Exact booking mobile the caller just spoke, as digits with country code when known (convert spoken digit words to numbers). Never invent or swap in another number.",
            example: "+923129312436",
          },
          {
            name: "user_phone_number",
            description: "Inbound caller phone; always send this as caller_phone fallback",
            example: "+923129312436",
          },
        ],
      },
    },
    {
      name: "verify_booking_otp",
      url: urls.verifyOtpAction,
      prompt:
        "REQUIRED after the caller says the verification code. Call this immediately with otp set to the six digits they spoke (testing code is 123456). Say the response message exactly. If appointment_confirmed is true, give the final appointment summary, then ask about medical records upload. If appointment_confirmed is false, say the message. Never speak OTP digits aloud. Do not invent a confirmation. Do not say you did not catch the code unless this action failed and you must ask them to repeat once.",
      message_error:
        "Please say the six digits one by one, slowly, and I will check the code again.",
      jsonBody: { phone: "<phone>", otp: "<otp>", caller_phone: "<user_phone_number>" },
      create: {
        description:
          "Verify the 6-digit testing code 123456 the caller speaks AFTER book_appointment. Always call this when they say the code. Confirm only when appointment_confirmed is true.",
        jsonBody: { phone: "<phone>", otp: "<otp>", caller_phone: "<user_phone_number>" },
        variables: [
          {
            name: "phone",
            description: "Mobile number used for the booking",
            example: "+923129312436",
          },
          {
            name: "otp",
            description:
              "REQUIRED. Six digits the caller spoke. For testing always pass 123456 when they said one-two-three-four-five-six or 123456. Pass digits only, no spaces.",
            example: "123456",
          },
          {
            name: "user_phone_number",
            description: "Inbound caller phone; always send this as caller_phone",
            example: "+923129312436",
          },
        ],
      },
    },
    {
      name: "offer_records_upload",
      url: urls.offerRecordsUploadAction,
      prompt:
        "Say the response message exactly. If next_action is ask_email, ask for the email and WAIT. If next_action is confirm_email, read the email back and ask if it is correct, then call again with email_confirmed yes only after they confirm. Only say the link was emailed when records_email_sent is true. Never call send_records_upload_link or deliver_records_upload_sms for records. Never invent a URL, email, or phone. Never start another outbound call.",
      message_error:
        "I could not send the upload link just now. Your appointment is still confirmed. Is there anything else I can help you with?",
      jsonBody: {
        consent: "<consent>",
        email: "<email>",
        email_confirmed: "<email_confirmed>",
        phone: "<phone>",
        appointment_reference: "<appointment_reference>",
        caller_phone: "<user_phone_number>",
      },
      create: {
        description:
          "After the confirmed appointment summary, log whether the caller wants to share medical records. If yes, email a secure upload link to the address the caller confirmed. If no, continue without upload.",
        jsonBody: {
          consent: "<consent>",
          email: "<email>",
          email_confirmed: "<email_confirmed>",
          phone: "<phone>",
          appointment_reference: "<appointment_reference>",
          caller_phone: "<user_phone_number>",
        },
        variables: [
          {
            name: "consent",
            description: "Caller answer: yes or no",
            example: "yes",
          },
          {
            name: "email",
            description: "Email address the caller confirmed for the upload link (empty when consent is no)",
            example: "patient@example.com",
          },
          {
            name: "email_confirmed",
            description: "yes only after the caller confirmed the email read back to them",
            example: "yes",
          },
          {
            name: "phone",
            description: "Mobile number used during booking (where the SMS should go)",
            example: "+923129312436",
          },
          {
            name: "appointment_reference",
            description: "Confirmed appointment reference such as APT-8302 when known",
            example: "APT-8302",
          },
          {
            name: "user_phone_number",
            description: "Inbound caller phone; send as caller_phone",
            example: "+923129312436",
          },
        ],
      },
    },
    {
      name: "deliver_records_upload_sms",
      url: urls.recordsSmsAction,
      prompt:
        "Say the message exactly. If success is true, say goodbye and end the call. If success is false, ask out loud for the mobile number as digits where you should text the upload link, then call this action again with phone filled.",
      message_error:
        "Please tell me the mobile number where I should text the upload link so you can share your documents.",
      jsonBody: {
        phone: "<phone>",
        doctor_name: "<doctor_name>",
        appointment_reference: "<appointment_reference>",
        upload_url: "<upload_url>",
        fallback_phone: "<fallback_phone>",
      },
      create: {
        description:
          "After the caller confirms a mobile number, text the medical-records upload link to that number.",
        jsonBody: {
          phone: "<phone>",
          doctor_name: "<doctor_name>",
          appointment_reference: "<appointment_reference>",
          upload_url: "<upload_url>",
          fallback_phone: "<fallback_phone>",
        },
        variables: [
          {
            name: "phone",
            description:
              "Confirmed mobile number as digits (with country code if known). Required.",
            example: "+14245550123",
          },
          {
            name: "doctor_name",
            description: "Doctor name for the records request",
            example: "Daniel Osei",
          },
          {
            name: "appointment_reference",
            description: "Appointment reference such as APT-8302",
            example: "APT-8302",
          },
          {
            name: "upload_url",
            description: "Secure upload link URL — do not read aloud",
            example: "https://example.com/upload/token",
          },
          {
            name: "fallback_phone",
            description: "Patient phone on file if they say same number",
            example: "+14245550123",
          },
        ],
      },
    },
  ] as const;

  const attachIds: string[] = [];
  for (const pair of pairs) {
    let actionIds = await findAllActionIdsByName(pair.name);
    if (!actionIds.length && "create" in pair && pair.create) {
      const created = await createCustomAction({
        name: pair.name,
        description: pair.create.description,
        url: pair.url,
        jsonBody: { ...pair.create.jsonBody },
        variables: pair.create.variables.map((variable) => ({ ...variable })),
        prompt: pair.prompt,
        messageError: pair.message_error,
      });
      if (created.action_id) {
        actionIds = [created.action_id];
        console.log(`[synthflow] Created action ${pair.name}`);
      }
    }
    if (!actionIds.length) {
      console.warn(`[synthflow] Action ${pair.name} not found — skip URL sync`);
      continue;
    }

    const preferredId =
      (await findActionIdByName(pair.name, modelId)) || actionIds[0];
    attachIds.push(preferredId);

    const body: Record<string, unknown> = {
      url: pair.url,
      // Silence tool-fillers ("Got it checking") that inflate perceived latency.
      agent_speak_naturally: false,
      speech_while_using_the_tool: "",
    };
    if ("prompt" in pair && pair.prompt) body.prompt = pair.prompt;
    if ("message_error" in pair && pair.message_error) body.message_error = pair.message_error;
    if ("jsonBody" in pair && pair.jsonBody) body.json_body_stringified = JSON.stringify(pair.jsonBody);

    // Rewrite every duplicate with this name — a stale copy still attached to the
    // agent would otherwise keep returning 502 "try again" during live calls.
    for (const actionId of actionIds) {
      await synthflowRequest("PUT", `/actions/${encodeURIComponent(actionId)}`, {
        CUSTOM_ACTION: body,
      });
    }
    const extra =
      actionIds.length > 1 ? ` (${actionIds.length} copies)` : "";
    console.log(`[synthflow] Action ${pair.name} synced → ${pair.url}${extra}`);
  }

  const smsActionId = await ensureBookingOtpSmsAction().catch((error) => {
    console.warn(
      "[synthflow] Could not prepare in-call OTP SMS:",
      error instanceof Error ? error.message : error,
    );
    return null;
  });
  if (smsActionId) attachIds.push(smsActionId);

  // Records upload links go by email on the inbound agent (offer_records_upload);
  // send_records_upload_link stays outbound-records only and is not attached here.

  if (modelId && attachIds.length) {
    const currentCount = await listAssistantActionIds(modelId)
      .then((ids) => ids.length)
      .catch(() => 0);
    // Never keep piling attachments — when the agent is already bloated, replace
    // the whole set with the canonical booking tools from this sync.
    const apply =
      currentCount > 40
        ? reconcileAssistantActions(modelId, attachIds)
        : attachActions(modelId, attachIds);
    await apply.catch((error) => {
      console.warn(
        "[synthflow] Could not attach booking actions:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (modelId && smsActionId) {
    await attachBookingOtpSms(modelId, smsActionId).catch((error) => {
      console.warn(
        "[synthflow] Could not map the OTP SMS recipient:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (modelId) {
    await attachDeliverRecordsSms(modelId).catch((error) => {
      console.warn(
        "[synthflow] Could not map deliver_records_upload_sms variables:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (modelId) {
    await attachVerifyOtpCallerPhone(modelId).catch((error) => {
      console.warn(
        "[synthflow] Could not map the caller phone on verify_booking_otp:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (modelId) {
    await attachOfferRecordsUpload(modelId).catch((error) => {
      console.warn(
        "[synthflow] Could not map offer_records_upload variables:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (modelId) {
    await attachBookCallerPhone(modelId).catch((error) => {
      console.warn(
        "[synthflow] Could not map the caller phone on book_appointment:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (modelId) {
    await attachCheckExistingPhone(modelId).catch((error) => {
      console.warn(
        "[synthflow] Could not map the booking phone on check_existing_appointment:",
        error instanceof Error ? error.message : error,
      );
    });
  }
}

const OTP_SMS_BODY =
  "Your Qubetech appointment code is <otp>. Testing code 123456 may be reused. Do not share it.";

/** Text the one-time code to the inbound caller during the live call. */
async function ensureBookingOtpSmsAction() {
  const fromNumber = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  // Do NOT set to_phone_number. In Synthflow that system field is the clinic number
  // that was dialed. INCALL_SMS already delivers to user_phone_number (the caller).
  const body = {
    name: "send_booking_otp",
    message_body: OTP_SMS_BODY,
    from_phone_number: fromNumber,
    message_before_action:
      "I am texting a 6-digit code to the phone you are calling from. Please read those digits back to me.",
    wait_for_reply: false,
  };

  const matches = await listActionsByName("send_booking_otp");
  let actionId = matches[0]?.id || null;

  for (const match of matches) {
    await synthflowRequest("PUT", `/actions/${encodeURIComponent(match.id)}`, {
      INCALL_SMS: {
        ...body,
        name: "send_booking_otp",
      },
    });
  }

  if (!actionId) {
    const json = await synthflowRequest<SynthflowJson>("POST", "/actions", { INCALL_SMS: body });
    const response = (json.response as SynthflowJson | undefined) ?? {};
    actionId =
      (typeof response.action_id === "string" && response.action_id) ||
      (typeof json.action_id === "string" && json.action_id) ||
      null;
    console.log(`[synthflow] Created in-call SMS action send_booking_otp from ${fromNumber}`);
  } else {
    console.log(
      `[synthflow] In-call SMS action send_booking_otp updated for inbound caller (${matches.length} copies)`,
    );
  }

  return actionId;
}

/** Drop legacy multi-doctor blocks so boot-time rule patching cannot revive them. */
function stripStaleMultiDoctorPrompt(prompt: string) {
  let next = prompt.replace(/\r\n/g, "\n");
  // Remove any leading rule-prefix block (including RECORDS / MANDATORY ORDER titles).
  next = next.replace(
    /^(?:OPENING RULE:|FAST RESPONSE RULE(?:[^\n]*):|BOOKING OTP RULE(?:[^\n]*):|RECORDS UPLOAD OFFER RULE:|AVAILABILITY SPEAK RULE(?:[^\n]*):|PHONE APPOINTMENT RULE(?:[^\n]*):)[\s\S]*?(?=\nYou are |\nPRIMARY MISSION:)/,
    "",
  );
  next = next.replace(
    /\n## (Availability answers|Live openings|Doctor profiles|Current roster|Live doctor directory)[\s\S]*$/g,
    "",
  );
  next = next.replace(/\n## Specialties[\s\S]*?(?=\n## Fast Booking Protocol|\n## Clinic doctor|$)/g, "\n");
  next = next.replace(/\n## Doctors \(quote exact fee\)[\s\S]*?(?=\n## Fast Booking Protocol|\n## Clinic doctor|$)/g, "\n");
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

function isLegacyMultiDoctorPrompt(prompt: string) {
  return (
    /## (Live openings|Current roster|Live doctor directory)/.test(prompt) ||
    /STRICT SPECIALTY BOUNDARIES/.test(prompt) ||
    /Doctor profiles \(say these on the call\)/.test(prompt)
  );
}

async function ensurePhoneAppointmentRule(modelId: string) {
  const json = await synthflowRequest<SynthflowJson>(
    "GET",
    `/assistants/${encodeURIComponent(modelId)}`,
  );
  const response = (json.response as SynthflowJson | undefined) ?? {};
  const assistants = (response.assistants as unknown[]) || [];
  const agentRow = (Array.isArray(assistants) ? assistants[0] : null) as Record<string, unknown> | null;
  const agent = (agentRow?.agent as Record<string, unknown> | undefined) ?? {};
  let prompt = typeof agent.prompt === "string" ? agent.prompt : "";

  // Never rewrite a legacy multi-doctor prompt in place — that is what made the
  // Synthflow Fine-tuner keep showing old rosters after Sync. Full sync replaces it.
  if (isLegacyMultiDoctorPrompt(prompt)) {
    console.warn(
      "[synthflow] Live prompt still has a multi-doctor roster. Skipping rule patch — run Super Admin → Sync doctor profile.",
    );
    return;
  }

  const bodyPrompt = stripStaleMultiDoctorPrompt(prompt);
  const nextPrefix = synthflowPromptRulePrefix();
  let nextPrompt = `${nextPrefix}\n\n${bodyPrompt}`.trim();
  let changed = nextPrompt !== prompt.trim();
  if (nextPrompt.includes("unless book_appointment returns success true")) {
    nextPrompt = nextPrompt.replaceAll(
      "unless book_appointment returns success true",
      "unless verify_booking_otp returns appointment_confirmed true",
    );
    changed = true;
  }
  prompt = nextPrompt;
  const greetingMessage = greetingWithOpeningLine(
    typeof agent.greeting_message === "string" ? agent.greeting_message : "",
  );
  if (greetingMessage !== agent.greeting_message) changed = true;
  if (agent.greeting_message_mode !== "agent_static") changed = true;
  const voiceSpeed = Number(agent.voice_speed);
  // Natural pace (1.0) — avoids the slow / stalled feel of sub-1.0 speeds.
  if (voiceSpeed !== 1.0) changed = true;
  const naturalVoicePrompt =
    "Speak clearly at a natural pace. Start speaking immediately when you have a reply. Brief pause only after questions. Do not rush dates, times, or phone numbers.";
  if (String(agent.voice_prompt || "") !== naturalVoicePrompt) changed = true;
  if (!changed) {
    console.log("[synthflow] System prompt already includes the opening, fast-response, phone, availability, OTP rules, and natural voice");
    return;
  }
  await updateAgent(modelId, {
    agent: {
      ...agent,
      prompt,
      greeting_message: greetingMessage,
      greeting_message_mode: "agent_static",
      // Synthflow allows 0.7–1.2 (1.0 = natural). Prefer natural for snappy turn-taking.
      voice_speed: 1.0,
      voice_prompt: naturalVoicePrompt,
    },
  });
  console.log("[synthflow] Opening, fast-response, phone, availability, OTP rules, and natural voice added to the live system prompt");
}

let workspaceActionIdsCache: { at: number; ids: Set<string> } | null = null;

/** All action ids currently present in the Synthflow workspace (cached briefly). */
export async function listWorkspaceActionIds(): Promise<Set<string>> {
  if (
    workspaceActionIdsCache &&
    Date.now() - workspaceActionIdsCache.at < ACTIONS_CATALOG_TTL_MS
  ) {
    return workspaceActionIdsCache.ids;
  }
  const catalog = await loadActionsCatalog();
  const ids = new Set(catalog.map((row) => row.id));
  workspaceActionIdsCache = { at: Date.now(), ids };
  return ids;
}

/** Keep only action ids that still exist in Synthflow (drops deleted extractors). */
export async function pruneStaleActionIds(actionIds: string[]): Promise<{
  living: string[];
  dropped: string[];
}> {
  const unique = [...new Set(actionIds.filter(Boolean))];
  if (!unique.length) return { living: [], dropped: [] };
  const workspace = await listWorkspaceActionIds();
  const living = unique.filter((id) => workspace.has(id));
  const dropped = unique.filter((id) => !workspace.has(id));
  if (dropped.length) {
    console.warn(
      `[synthflow] Dropping ${dropped.length} stale action id(s) (deleted in Synthflow): ${dropped.join(", ")}`,
    );
  }
  return { living, dropped };
}

export async function attachActions(modelId: string, actionIds: string[]) {
  let ids = [...new Set(actionIds.filter(Boolean))];
  if (!ids.length) return null;

  const pruned = await pruneStaleActionIds(ids);
  ids = pruned.living;
  if (!ids.length) {
    console.warn("[synthflow] attachActions: no living action ids left after prune");
    return null;
  }

  // Retry without any slug Synthflow still rejects (race / partial list).
  for (let attempt = 0; attempt < 8 && ids.length; attempt += 1) {
    try {
      return await synthflowRequest("POST", "/actions/attach", {
        model_id: modelId,
        actions: ids,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const match = message.match(/Action with slug\s+([a-f0-9-]{36})\s+not found/i);
      if (!match?.[1]) throw error;
      const missing = match[1];
      console.warn(`[synthflow] attachActions: skipping missing action ${missing}`);
      ids = ids.filter((id) => id !== missing);
      if (!ids.length) return null;
    }
  }
  return null;
}

/** Fill check_existing_appointment.phone from the number the caller spoke. */
async function attachCheckExistingPhone(modelId: string) {
  const actionId = await findActionIdByName("check_existing_appointment");
  if (!actionId) return null;
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        input_variables_mapping: [
          {
            variable_name: "phone",
            source: "llm",
            llm_config: {
              description:
                "Exact booking mobile the caller just spoke for this appointment, as digits with country code when known. Convert spoken digit words (nine two three…) to numbers. Prefer the contact number they gave for booking over guessing. Never invent or substitute a different number.",
              example: "+923129312436",
              required: true,
            },
          },
          {
            variable_name: "user_phone_number",
            source: "system_vars",
          },
        ],
      },
    ],
  });
}

/** Fill book_appointment.caller_phone from the inbound caller, not a number the caller speaks. */
async function attachBookCallerPhone(modelId: string) {
  const actionId = await findActionIdByName("book_appointment");
  if (!actionId) return null;
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        input_variables_mapping: [
          {
            variable_name: "doctor_name",
            source: "llm",
            llm_config: { description: "Doctor being booked", example: "Dr. Michael Torres" },
          },
          {
            variable_name: "doctor_id",
            source: "llm",
            llm_config: { description: "doctor_id from the live directory", example: "cmus8rdjz001cvgzgivbectzd" },
          },
          {
            variable_name: "slot_id",
            source: "llm",
            llm_config: { description: "slot_id from the live openings", example: "cmus8rdk9001mvgzg8ulus78q" },
          },
          {
            variable_name: "patient_name",
            source: "llm",
            llm_config: { description: "Patient full name", example: "Amna Ali" },
          },
          {
            variable_name: "phone",
            source: "llm",
            llm_config: {
              description:
                "Exact booking mobile the caller spoke for this appointment, as digits with country code when known. Convert spoken digit words to numbers. Never invent a number.",
              example: "+923708321774",
            },
          },
          {
            variable_name: "reason",
            source: "llm",
            llm_config: { description: "Visit reason", example: "knee pain" },
          },
          {
            variable_name: "user_phone_number",
            source: "system_vars",
          },
        ],
      },
    ],
  });
}

/** Fill verify_booking_otp.caller_phone from the inbound caller. */
async function attachVerifyOtpCallerPhone(modelId: string) {
  const actionId = await findActionIdByName("verify_booking_otp", modelId);
  if (!actionId) return null;
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        input_variables_mapping: [
          {
            variable_name: "phone",
            source: "llm",
            llm_config: {
              description: "Mobile number the verification code was texted to",
              example: "+923129312436",
            },
          },
          {
            variable_name: "otp",
            source: "llm",
            llm_config: {
              description:
                "REQUIRED. Six digits the caller just spoke for verification. Testing code is 123456. If they said one two three four five six, pass 123456. Digits only, no spaces. Never leave empty.",
              example: "123456",
              required: true,
            },
          },
          {
            variable_name: "user_phone_number",
            source: "system_vars",
          },
        ],
      },
    ],
  });
}

/** Map offer_records_upload: consent + booking phone from the live call. */
async function attachOfferRecordsUpload(modelId: string) {
  const actionId = await findActionIdByName("offer_records_upload", modelId);
  if (!actionId) return null;
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        input_variables_mapping: [
          {
            variable_name: "consent",
            source: "llm",
            llm_config: {
              description: "Caller answer after the medical-records offer: yes or no",
              example: "yes",
              required: true,
            },
          },
          {
            variable_name: "email",
            source: "llm",
            llm_config: {
              description:
                "Email address the caller gave and confirmed for the records upload link, written as an address (patient@example.com). Leave empty when consent is no. Never invent one.",
              example: "patient@example.com",
              required: false,
            },
          },
          {
            variable_name: "email_confirmed",
            source: "llm",
            llm_config: {
              description:
                "yes only after you read the email back and the caller said it is correct; otherwise no",
              example: "yes",
              required: false,
            },
          },
          {
            variable_name: "phone",
            source: "llm",
            llm_config: {
              description:
                "Mobile number used for the booking (used to find the appointment). Can be any E.164 patient number such as +12014799258 — not only the inbound caller line, and never the clinic line.",
              example: "+12014799258",
              required: true,
            },
          },
          {
            variable_name: "appointment_reference",
            source: "llm",
            llm_config: {
              description: "Confirmed appointment reference when known",
              example: "APT-8302",
              required: false,
            },
          },
          {
            variable_name: "user_phone_number",
            source: "system_vars",
          },
        ],
      },
    ],
  });
}

/** Keep the in-call SMS body fields bound to book_appointment. Recipient stays the inbound caller. */
async function attachBookingOtpSms(modelId: string, actionId: string) {
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        input_variables_mapping: [
          {
            variable_name: "otp",
            source: "llm",
            llm_config: {
              description: "The otp value returned by book_appointment. Do not read it aloud.",
              example: "482913",
              required: true,
            },
          },
          {
            variable_name: "expires_seconds",
            source: "llm",
            llm_config: {
              description: "The expires_seconds value returned by book_appointment.",
              example: "120",
              required: true,
            },
          },
        ],
      },
    ],
  });
}

// Full SMS text is filled from offer_records_upload.records_sms_body (any booking phone).
const RECORDS_UPLOAD_SMS_BODY = "<records_sms_body>";

function recordsSmsDeliveryPrompt(input: {
  doctorName: string;
  appointmentReference: string;
  uploadUrl: string;
  toPhone: string;
}) {
  return `You are on a short outbound clinic call to collect and confirm a mobile number, then text a medical-records upload link. Speak at a calm natural pace. Do not book appointments. Never go silent.

Follow this exact flow (same every time):
1. Ask: "What mobile number should I text the upload link to, so you can share your documents with Doctor ${input.doctorName}?"
2. Listen for the number.
3. Confirm: "Just to confirm, I will text the secure upload link to [repeat their number]. Is that correct?"
4. If they say no or correct a digit, ask again and re-confirm.
5. If they say "this number", "same number", or "the number you called", use ${input.toPhone} and confirm that.
6. Only after they say yes, immediately call deliver_records_upload_sms with ALL fields:
phone: digits only for the confirmed number (example ${input.toPhone})
doctor_name: ${input.doctorName}
appointment_reference: ${input.appointmentReference}
upload_url: ${input.uploadUrl}
7. Say the action message, then end politely.

Never invent a phone. Never send to the clinic number. Do not read the upload URL aloud.`;
}

async function findRecordsUploadSmsActionIds(preferredModelId?: string) {
  const json = await synthflowRequest<SynthflowJson>("GET", "/actions?limit=100");
  const response = (json.response as SynthflowJson | undefined) ?? {};
  const actions = (response.actions as unknown[]) || [];
  const matches: Array<{ id: string; name: string; assistants: string[] }> = [];
  for (const raw of actions) {
    const row = raw as Record<string, unknown>;
    const name = String(row.name || "").trim();
    if (
      name !== "send_records_upload_link" &&
      !/^send_records_upload_link_\d+$/.test(name)
    ) {
      continue;
    }
    const id = String(row.action_id || row.id || "").trim();
    if (!id) continue;
    const assistants = Array.isArray(row.assistants) ? row.assistants.map((value) => String(value)) : [];
    matches.push({ id, name, assistants });
  }

  matches.sort((a, b) => {
    const aAttached = preferredModelId && a.assistants.includes(preferredModelId) ? 1 : 0;
    const bAttached = preferredModelId && b.assistants.includes(preferredModelId) ? 1 : 0;
    if (aAttached !== bAttached) return bAttached - aAttached;
    const aExact = a.name === "send_records_upload_link" ? 1 : 0;
    const bExact = b.name === "send_records_upload_link" ? 1 : 0;
    return bExact - aExact;
  });

  return matches;
}

/** Create/update the voice-agent INCALL_SMS action used for medical-records upload links. */
export async function ensureRecordsUploadSmsAction(preferredModelId?: string) {
  const fromNumber = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  // Body + destination are filled at call time (like OTP). to_phone_number overrides
  // the inbound caller so SMS can go to any booking mobile the patient gave.
  const body = {
    name: "send_records_upload_link",
    message_body: RECORDS_UPLOAD_SMS_BODY,
    to_phone_number: "<to_phone_number>",
    from_phone_number: fromNumber,
    message_before_action:
      "I am texting the secure upload link to the mobile number from your booking. Please check your messages.",
    wait_for_reply: false,
  };

  const matches = await findRecordsUploadSmsActionIds(preferredModelId).catch(() => []);
  let actionId = matches[0]?.id || null;

  // Keep every duplicate copy in sync so whichever Synthflow runs uses the fixed config.
  for (const match of matches) {
    await synthflowRequest("PUT", `/actions/${encodeURIComponent(match.id)}`, {
      INCALL_SMS: {
        ...body,
        name: match.name,
      },
    });
  }

  if (!actionId) {
    const json = await synthflowRequest<SynthflowJson>("POST", "/actions", { INCALL_SMS: body });
    const response = (json.response as SynthflowJson | undefined) ?? {};
    actionId =
      (typeof response.action_id === "string" && response.action_id) ||
      (typeof json.action_id === "string" && json.action_id) ||
      null;
    console.log(`[synthflow] Created in-call SMS action send_records_upload_link from ${fromNumber}`);
  } else {
    console.log(
      `[synthflow] In-call SMS action send_records_upload_link updated for ${fromNumber} (${matches.length} copies)`,
    );
  }

  return actionId;
}

/** Doctor outbound / reminder-style dial: body from pre-call variables; SMS goes to dialed party. */
async function attachRecordsUploadSmsOutbound(modelId: string, actionId: string) {
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        trigger_condition:
          "Call this after the patient confirms the mobile number for the records upload link.",
        input_variables_mapping: [
          {
            variable_name: "records_sms_body",
            source: "prompt_variables",
            source_key: "records_sms_body",
          },
        ],
      },
    ],
  });
}

/**
 * Send a plain SMS via POST /chat/outbound (chat agents only).
 * The AI Receptionist voice agent cannot use this — Synthflow returns
 * "Omnichannel chat is only supported for chat agents."
 * For the live booking call, use INCALL_SMS (`send_records_upload_link`) instead.
 * Never place an outbound voice call from this helper.
 */
export async function sendDirectSms(input: {
  toPhone: string;
  body: string;
}): Promise<{ ok: true; mode: "chat_outbound" } | { ok: false; error: string }> {
  const fromNumber = normalizePhone(env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053");
  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  const toPhone = normalizePhone(input.toPhone);
  const body = input.body.trim();

  if (!isSynthflowConfigured() || !agentId || !fromNumber) {
    return { ok: false, error: "The clinic messaging number is not configured" };
  }
  if (!toPhone) return { ok: false, error: "Patient phone number is invalid" };
  if (toPhone === fromNumber) return { ok: false, error: "Patient phone cannot be the clinic number" };
  if (!body) return { ok: false, error: "SMS body is empty" };

  console.log(`[synthflow] Direct SMS (no call) → ${toPhone} from=${fromNumber} body_len=${body.length}`);

  try {
    const result = await synthflowRequest<SynthflowJson>("POST", "/chat/outbound", {
      agent_id: agentId,
      channel: "sms",
      to_number: toPhone,
      from_number: fromNumber,
      initial_message: body,
    });
    console.log(
      `[synthflow] Direct SMS accepted → ${toPhone} response=${JSON.stringify(result).slice(0, 320)}`,
    );
    return { ok: true, mode: "chat_outbound" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[synthflow] Direct SMS failed → ${toPhone}:`, message);
    return {
      ok: false,
      error: message.includes("chat") || message.includes("Omnichannel") || message.includes("404") || message.includes("400")
        ? `SMS channel unavailable (${message}). /chat/outbound requires a Synthflow chat agent; the clinic voice agent must send SMS via INCALL_SMS on a call.`
        : message,
    };
  }
}

/**
 * Deliver a prepared clinic SMS without placing an automated voice call.
 * Tries Synthflow `/chat/outbound` first. On voice-agent workspaces that reject
 * omnichannel chat, returns ok:false so the live-call INCALL_SMS action can send.
 */
export async function deliverSmsWithoutCall(input: {
  toPhone: string;
  body: string;
  purpose?: "records_upload" | "other";
}): Promise<{ ok: true; mode: "chat_outbound" } | { ok: false; error: string }> {
  const result = await sendDirectSms({ toPhone: input.toPhone, body: input.body });
  if (result.ok) {
    console.log(
      `[synthflow] SMS delivered (no call) purpose=${input.purpose || "other"} → ${normalizePhone(input.toPhone)}`,
    );
    return result;
  }
  console.warn(
    `[synthflow] SMS not delivered via no-call channel purpose=${input.purpose || "other"} → ${normalizePhone(input.toPhone)}: ${result.error}`,
  );
  return result;
}

/** Map deliver_records_upload_sms: phone from what the caller said; link fields from call vars. */
async function attachDeliverRecordsSms(modelId: string) {
  const actionId = await findActionIdByName("deliver_records_upload_sms", modelId);
  if (!actionId) return null;
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        input_variables_mapping: [
          {
            variable_name: "phone",
            source: "llm",
            llm_config: {
              description:
                "Mobile number the caller confirmed for the upload-link SMS, as digits with country code when possible",
              example: "+14245550123",
              required: true,
            },
          },
          {
            variable_name: "doctor_name",
            source: "prompt_variables",
          },
          {
            variable_name: "appointment_reference",
            source: "prompt_variables",
          },
          {
            variable_name: "upload_url",
            source: "prompt_variables",
          },
          {
            variable_name: "fallback_phone",
            source: "prompt_variables",
          },
        ],
      },
    ],
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function extractCallId(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const root = payload as SynthflowJson;
  const response = (root.response as SynthflowJson | undefined) ?? {};
  const candidates = [root.call_id, root._id, response.call_id, response._id];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function asJsonRecord(value: unknown): SynthflowJson {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as SynthflowJson)
    : {};
}

function parseMaybeJson(value: unknown): SynthflowJson {
  if (typeof value === "string") {
    try {
      return asJsonRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return asJsonRecord(value);
}

function findExecutedActions(payload: unknown): SynthflowJson {
  const root = asJsonRecord(payload);
  const response = asJsonRecord(root.response);
  const call = asJsonRecord(
    response.call ||
      (Array.isArray(response.calls) ? response.calls[0] : undefined) ||
      root.call ||
      (Array.isArray(root.calls) ? root.calls[0] : undefined) ||
      response,
  );
  return asJsonRecord(call.executed_actions || root.executed_actions || response.executed_actions);
}

export function readRecordsUploadSmsExecution(callPayload: unknown): {
  ran: boolean;
  toPhone: string;
  error: string;
  actionName: string;
} {
  const executed = findExecutedActions(callPayload);
  const entries = Object.entries(executed);
  const match = entries.find(([key, row]) => {
    const name = String(asJsonRecord(row).name || key || "");
    return (
      name === "deliver_records_upload_sms" ||
      name.startsWith("deliver_records_upload_sms_") ||
      key === "deliver_records_upload_sms" ||
      key.startsWith("deliver_records_upload_sms_") ||
      name === "send_records_upload_link" ||
      name.startsWith("send_records_upload_link_") ||
      key === "send_records_upload_link" ||
      key.startsWith("send_records_upload_link_")
    );
  });

  if (!match) return { ran: false, toPhone: "", error: "", actionName: "" };

  const action = asJsonRecord(match[1]);
  const hardCoded = parseMaybeJson(action.parameters_hard_coded);
  const fromLlm = parseMaybeJson(action.parameters_from_llm);
  const toPhone =
    (typeof hardCoded.to_phone_number === "string" && hardCoded.to_phone_number) ||
    (typeof fromLlm.to_phone_number === "string" && fromLlm.to_phone_number) ||
    "";

  return {
    ran: true,
    toPhone,
    error: typeof action.error_message === "string" ? action.error_message.trim() : "",
    actionName: String(action.name || match[0] || ""),
  };
}

export type ClinicRecordsSmsPayload = {
  toPhone: string;
  patientName?: string;
  doctorName: string;
  appointmentReference: string;
  uploadUrl: string;
};

/** Prevent rapid duplicate outbound dials (carrier marks them as spam). */
const recordsCallCooldownMs = 90_000;
const recentRecordsCalls = new Map<string, { at: number; callId: string }>();

export function readCallStatus(callPayload: unknown): string {
  const callRoot = asJsonRecord(callPayload);
  const response = asJsonRecord(callRoot.response);
  const fromList = Array.isArray(response.calls) ? asJsonRecord(response.calls[0]) : {};
  const callRow = asJsonRecord(response.call || fromList || callRoot);
  return String(callRow.status || fromList.status || callRoot.status || "").toLowerCase();
}

/** Place a short outbound voice call with the clinic receptionist agent. */
export async function startOutboundVoiceCall(input: {
  modelId: string;
  toPhone: string;
  fromPhone: string;
  name?: string;
  greeting?: string;
  prompt?: string;
}) {
  const from = input.fromPhone?.trim();
  const started = await synthflowRequest<SynthflowJson>("POST", "/calls", {
    model_id: input.modelId,
    phone: input.toPhone,
    name: input.name?.trim() || "Clinic test",
    // Omit when empty so Synthflow uses the outbound agent's default caller ID.
    ...(from ? { from_phone_number: from } : {}),
    ...(input.greeting ? { greeting: input.greeting } : {}),
    ...(input.prompt ? { prompt: input.prompt } : {}),
  });
  const callId = extractCallId(started);
  if (!callId) {
    throw new Error(`Synthflow started a call but did not return a call id: ${JSON.stringify(started).slice(0, 400)}`);
  }
  return { callId, raw: started };
}

/**
 * Send the medical-records upload link through the voice agent's INCALL_SMS action
 * from the clinic number (+14244849053). Uses a short outbound call so the same
 * Synthflow voice SMS path as OTP can deliver the text to the patient's registered phone.
 * Does not use /chat/outbound (chat-agent API).
 */
export type ClinicSmsDialResult = {
  callId: string;
  toPhone: string;
  fromNumber: string;
  actionName: string;
  status: "calling" | "spam" | "failed";
  warning?: string;
};

export async function sendClinicSms(payload: ClinicRecordsSmsPayload): Promise<ClinicSmsDialResult> {
  const fromNumber = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  if (!isSynthflowConfigured() || !agentId) {
    throw new Error("The clinic messaging number is not configured");
  }

  const toPhone = normalizePhone(payload.toPhone);
  if (!toPhone) {
    throw new Error("Patient phone number is invalid");
  }
  if (toPhone === normalizePhone(fromNumber)) {
    throw new Error("Patient phone cannot be the clinic number");
  }

  const cooldownKey = `${payload.appointmentReference}:${toPhone}`;
  const recent = recentRecordsCalls.get(cooldownKey);
  if (recent && Date.now() - recent.at < recordsCallCooldownMs) {
    throw new Error(
      `A records call to ${toPhone} was already started less than 90 seconds ago (call ${recent.callId}). Wait a moment before retrying — rapid retries get blocked as spam.`,
    );
  }

  // Keep this path fast — no full webhook sync and no mass action PUTs
  // (those blocked the doctor UI on "Calling…" for a long time).
  const recordsMatches = await findRecordsUploadSmsActionIds(agentId).catch(() => []);
  const actionId = recordsMatches[0]?.id || (await ensureRecordsUploadSmsAction(agentId));
  if (!actionId) {
    throw new Error("Could not prepare the clinic records SMS action");
  }
  const doctorName = payload.doctorName.replace(/^Dr\.?\s*/i, "").trim() || "your doctor";
  const recordsSmsBody = `Qubetech clinic: Dr. ${doctorName} requested your medical records for appointment ${payload.appointmentReference}. Upload securely here (expires in 7 days): ${payload.uploadUrl}`;

  await Promise.all([
    attachRecordsUploadSmsOutbound(agentId, actionId).catch((error) => {
      console.warn(
        "[synthflow] Could not attach records INCALL SMS before outbound call:",
        error instanceof Error ? error.message : error,
      );
    }),
    attachDeliverRecordsSms(agentId).catch((error) => {
      console.warn(
        "[synthflow] Could not attach deliver_records_upload_sms before outbound call:",
        error instanceof Error ? error.message : error,
      );
    }),
  ]);

  const prompt = recordsSmsDeliveryPrompt({
    doctorName,
    appointmentReference: payload.appointmentReference,
    uploadUrl: payload.uploadUrl,
    toPhone,
  });

  console.log(
    `[synthflow] Starting records call → ${toPhone} from ${fromNumber} (appt ${payload.appointmentReference})`,
  );

  // Only documented /calls fields — extra keys can confuse telephony routing.
  const started = await synthflowRequest<SynthflowJson>("POST", "/calls", {
    model_id: agentId,
    phone: toPhone,
    name: payload.patientName?.trim() || "Patient",
    from_phone_number: fromNumber,
    custom_variables: [
      { key: "doctor_name", value: doctorName },
      { key: "appointment_reference", value: payload.appointmentReference },
      { key: "upload_url", value: payload.uploadUrl },
      { key: "records_sms_body", value: recordsSmsBody },
      { key: "fallback_phone", value: toPhone },
    ],
    greeting: `Hello, this is Qubetech clinic calling on behalf of Doctor ${doctorName}. What mobile number should I text the upload link to, so you can share your documents with the doctor?`,
    prompt,
  });

  const callId = extractCallId(started);
  if (!callId) {
    console.warn("[synthflow] Records call start response missing call id:", JSON.stringify(started).slice(0, 500));
    throw new Error("Synthflow started a call but did not return a call id");
  }
  recentRecordsCalls.set(cooldownKey, { at: Date.now(), callId });
  console.log(`[synthflow] Records call dialing call_id=${callId} → ${toPhone}`);

  // Quick spam check (one peek) — do not hold the doctor UI for many seconds.
  let dialStatus: ClinicSmsDialResult["status"] = "calling";
  let warning: string | undefined;
  await sleep(2500);
  const early = await getPhoneCall(callId).catch(() => null);
  if (early) {
    const status = readCallStatus(early);
    if (["ringing", "in-progress", "completed"].includes(status)) {
      console.log(`[synthflow] Records call ${callId} is live (${status})`);
    } else if (["spam", "failed", "canceled", "user-canceled"].includes(status)) {
      dialStatus = status === "spam" ? "spam" : "failed";
      warning =
        status === "spam"
          ? `Carrier blocked the call to ${toPhone} as spam (US clinic number → international). Wait 1–2 minutes before retrying, or share this link manually: ${payload.uploadUrl}`
          : `Call to ${toPhone} ended with status "${status}". Share this link if needed: ${payload.uploadUrl}`;
      console.warn(`[synthflow] Records call ${callId} blocked/ended early (${status})`);
      // Allow a manual retry sooner after a hard spam/fail.
      recentRecordsCalls.delete(cooldownKey);
    }
  }

  // Background: watch for live connect / SMS action / final status.
  void (async () => {
    try {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await sleep(4000);
        const call = await getPhoneCall(callId);
        const status = readCallStatus(call);
        if (["spam", "failed", "canceled", "user-canceled"].includes(status)) {
          console.warn(`[synthflow] Records call ${callId} ended (${status})`);
          return;
        }
        const execution = readRecordsUploadSmsExecution(call);
        if (execution.ran && !execution.error) {
          console.log(
            `[synthflow] Records upload SMS completed on call ${callId} → ${execution.toPhone || toPhone}`,
          );
          return;
        }
        if (execution.ran && execution.error) {
          console.warn(`[synthflow] Records SMS failed on call ${callId}:`, execution.error);
          return;
        }
        if (status && !["in-progress", "ringing", "queued", "pending", "registered"].includes(status) && attempt >= 2) {
          console.warn(`[synthflow] Records call ${callId} ended without confirmed SMS (${status})`);
          return;
        }
      }
    } catch (error) {
      console.warn(
        `[synthflow] Records call monitor failed for ${callId}:`,
        error instanceof Error ? error.message : error,
      );
    }
  })();

  return {
    callId,
    toPhone,
    fromNumber,
    actionName: "deliver_records_upload_sms",
    status: dialStatus,
    warning,
  };
}

const REMINDER_SMS_ACTION = "send_appointment_reminder";

async function ensureAppointmentReminderSmsAction(agentId: string) {
  const fromNumber = env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053";
  // Do not set to_phone_number. On outbound calls that field is the clinic number.
  // INCALL_SMS delivers to user_phone_number, which is the patient being called.
  const body = {
    name: REMINDER_SMS_ACTION,
    message_body: "<reminder_message>",
    from_phone_number: fromNumber,
    wait_for_reply: false,
    message_before_action: "I am texting your appointment reminder to this phone number.",
  };

  const json = await synthflowRequest<SynthflowJson>("GET", "/actions?limit=100");
  const response = (json.response as SynthflowJson | undefined) ?? {};
  const actions = (response.actions as unknown[]) || [];
  const match = actions
    .map((raw) => raw as Record<string, unknown>)
    .find((row) => String(row.name || "").trim() === REMINDER_SMS_ACTION);
  const existingId = match ? String(match.action_id || match.id || "").trim() : "";

  if (existingId) {
    await synthflowRequest("PUT", `/actions/${encodeURIComponent(existingId)}`, { INCALL_SMS: body });
    return existingId;
  }

  const created = await synthflowRequest<SynthflowJson>("POST", "/actions", { INCALL_SMS: body });
  const createdResponse = (created.response as SynthflowJson | undefined) ?? {};
  const actionId =
    (typeof createdResponse.action_id === "string" && createdResponse.action_id) ||
    (typeof created.action_id === "string" && created.action_id) ||
    "";
  if (!actionId) throw new Error("Could not prepare the appointment reminder SMS action");
  console.log(`[synthflow] Created in-call SMS action ${REMINDER_SMS_ACTION} for agent ${agentId}`);
  return actionId;
}

/**
 * Text the booking number from the clinic voice agent.
 *
 * The configured AI Receptionist is a voice agent. POST /chat/outbound only
 * works for chat agents ("Omnichannel chat is only supported for chat agents"),
 * so invoices, reminders, and confirmations all use a short outbound call +
 * INCALL_SMS — the same Synthflow SMS path as OTP and records upload links.
 * Success is returned only after the in-call SMS action executes without error.
 */
export async function sendPatientReminderSms(input: {
  toPhone: string;
  body: string;
  purpose?: "reminder" | "invoice" | "confirmation";
}) {
  const fromNumber = normalizePhone(env.SYNTHFLOW_PHONE_NUMBER.trim() || "+14244849053");
  const agentId = env.SYNTHFLOW_AGENT_ID.trim();
  if (!isSynthflowConfigured() || !agentId || !fromNumber) {
    throw new Error("The clinic messaging number is not configured");
  }

  const toPhone = normalizePhone(input.toPhone);
  if (!toPhone) throw new Error("Patient phone number is invalid");
  if (toPhone === fromNumber) throw new Error("Patient phone cannot be the clinic number");

  const message = input.body.trim();
  if (!message) throw new Error("SMS message is empty");

  const actionId = await ensureAppointmentReminderSmsAction(agentId);
  await synthflowRequest("POST", "/actions/attach", {
    model_id: agentId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        input_variables_mapping: [
          {
            variable_name: "reminder_message",
            source: "prompt_variables",
          },
        ],
      },
    ],
  });

  const invoice = input.purpose === "invoice";
  const confirmation = input.purpose === "confirmation";
  const started = await synthflowRequest<SynthflowJson>("POST", "/calls", {
    model_id: agentId,
    phone: toPhone,
    name: "Patient",
    from_phone_number: fromNumber,
    custom_variables: [{ key: "reminder_message", value: message }],
    greeting: invoice
      ? "Hello, this is Qubetech clinic with an invoice for your visit."
      : confirmation
        ? "Hello, this is Qubetech clinic confirming your next visit."
        : "Hello, this is Qubetech clinic with an appointment reminder.",
    prompt: invoice
      ? `You are delivering one payment-link SMS for Qubetech clinic. Do not book anything and do not ask questions.
Immediately call ${REMINDER_SMS_ACTION}. Pass reminder_message exactly as this text:
${message}
Do not set a recipient. The text must go to the person you called (${toPhone}), never the clinic number.
If the action returns an error, say exactly: "The text was not delivered."
If it succeeds, say only: "I have texted your invoice payment link. Goodbye." Then end the call.`
      : confirmation
        ? `You are delivering one appointment confirmation SMS for Qubetech clinic. Do not book anything and do not ask questions.
Immediately call ${REMINDER_SMS_ACTION}. Pass reminder_message exactly as this text:
${message}
Do not set a recipient. The text must go to the person you called (${toPhone}), never the clinic number.
If the action returns an error, say exactly: "The text was not delivered."
If it succeeds, say only: "I have texted your appointment confirmation. Goodbye." Then end the call.`
        : `You are delivering one appointment reminder SMS for Qubetech clinic. Do not book anything and do not ask questions.
Immediately call ${REMINDER_SMS_ACTION}. Pass reminder_message exactly as this text:
${message}
Do not set a recipient. The text must go to the person you called (${toPhone}), never the clinic number.
If the action returns an error, say exactly: "The text was not delivered."
If it succeeds, say only: "I have texted your appointment reminder. Goodbye." Then end the call.`,
  });

  const callId = extractCallId(started);
  if (!callId) throw new Error("Synthflow started a call but did not return a call id");

  let sawCompletedCall = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(3000);
    const call = await getPhoneCall(callId);
    const callRoot = asJsonRecord(call);
    const response = asJsonRecord(callRoot.response);
    const callRow = asJsonRecord(
      response.call || (Array.isArray(response.calls) ? response.calls[0] : undefined) || callRoot,
    );
    const status = String(callRow.status || "").toLowerCase();
    if (status && status !== "in-progress" && status !== "ringing" && status !== "queued") {
      sawCompletedCall = true;
    }

    const executed = findExecutedActions(call);
    const entry = Object.entries(executed).find(([key, row]) => {
      const name = String(asJsonRecord(row).name || key || "");
      return name === REMINDER_SMS_ACTION || key === REMINDER_SMS_ACTION;
    });
    if (!entry) {
      if (sawCompletedCall && attempt >= 2) break;
      continue;
    }

    const action = asJsonRecord(entry[1]);
    const error = typeof action.error_message === "string" ? action.error_message.trim() : "";
    if (error) throw new Error(`SMS provider failed while sending to ${toPhone}: ${error}`);
    return { toPhone, fromNumber, callId };
  }

  const label =
    input.purpose === "invoice"
      ? "Invoice"
      : input.purpose === "confirmation"
        ? "Confirmation"
        : "Reminder";
  throw new Error(
    `${label} SMS action did not finish for ${toPhone}. The patient may need to answer the clinic call so the voice agent can text the message.`,
  );
}

/** Fetch a single phone call from Synthflow (includes recording_url when available). */
export async function getPhoneCall(callId: string) {
  const id = callId.trim();
  if (!id) return null;
  return synthflowRequest<SynthflowJson>("GET", `/calls/${encodeURIComponent(id)}`);
}

export function extractRecordingUrlFromCallPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";

  const asRecord = (value: unknown): SynthflowJson =>
    value && typeof value === "object" && !Array.isArray(value) ? (value as SynthflowJson) : {};

  const asString = (value: unknown) => {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" || typeof value === "boolean") return String(value).trim();
    return "";
  };

  const pick = (obj: SynthflowJson, keys: string[]) => {
    for (const key of keys) {
      const value = asString(obj[key]);
      if (value && /^https?:\/\//i.test(value)) return value;
    }
    return "";
  };

  const root = asRecord(payload);
  const response = asRecord(root.response);
  const call = asRecord(root.call);
  const calls = Array.isArray(response.calls)
    ? response.calls
    : Array.isArray(root.calls)
      ? root.calls
      : [];

  const firstCall = calls.length ? asRecord(calls[0]) : {};

  return (
    pick(call, ["recording_url", "recordingUrl", "recording"]) ||
    pick(firstCall, ["recording_url", "recordingUrl", "recording"]) ||
    pick(response, ["recording_url", "recordingUrl", "recording"]) ||
    pick(root, ["recording_url", "recordingUrl", "recording"]) ||
    ""
  );
}

export async function fetchCallRecordingUrl(callId: string): Promise<string | null> {
  try {
    const payload = await getPhoneCall(callId);
    const url = extractRecordingUrlFromCallPayload(payload);
    return url || null;
  } catch (error) {
    console.warn(
      "[synthflow] Could not fetch call recording:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

export async function findAssistantByPhone(phoneE164: string) {
  const want = phoneE164.trim();
  if (!want) return null;

  for (let page = 0; page < 5; page += 1) {
    const json = await listAssistants({ limit: 50, offset: page * 50 });
    const assistants =
      (json as { response?: { assistants?: unknown[] }; assistants?: unknown[] }).response
        ?.assistants ||
      (json as { assistants?: unknown[] }).assistants ||
      (Array.isArray(json) ? json : []);

    if (!Array.isArray(assistants) || !assistants.length) break;

    for (const raw of assistants) {
      const a = raw as Record<string, unknown>;
      const id = String(a.model_id || a.id || "");
      const direct = String(a.phone_number || "").trim();
      const attached = Array.isArray(a.attached_phone_numbers)
        ? a.attached_phone_numbers
            .map((p) => {
              if (typeof p === "string") return p.trim();
              if (p && typeof p === "object") {
                const row = p as Record<string, unknown>;
                return String(row.phone_number || row.number || "").trim();
              }
              return "";
            })
            .filter(Boolean)
        : [];
      const candidates = [direct, ...attached].filter(Boolean);
      if (candidates.some((n) => n === want || n.replace(/\s/g, "") === want)) {
        return { model_id: id || null, raw: a };
      }
    }

    if (assistants.length < 50) break;
  }

  return null;
}

/**
 * Push inbound + data webhook URLs to the configured Synthflow agent when possible.
 * Prefer DB clinic settings agent id, then env SYNTHFLOW_AGENT_ID.
 */
export async function syncAgentWebhooksOnBoot(agentId?: string | null) {
  if (!env.SYNTHFLOW_SYNC_WEBHOOKS) return;
  if (!isSynthflowConfigured()) {
    console.warn("[synthflow] API key missing — skip webhook sync");
    return;
  }

  const modelId = (agentId || env.SYNTHFLOW_AGENT_ID).trim();
  if (!modelId) {
    console.warn(
      "[synthflow] No agent id — create one in Admin → Synthflow, or set SYNTHFLOW_AGENT_ID",
    );
    return;
  }

  const urls = synthflowWebhookUrls();
  try {
    await updateAssistantWebhooks(modelId);
    console.log("[synthflow] Agent webhooks synced:");
    console.log(`  inbound: ${urls.inbound}`);
    console.log(`  data:    ${urls.data}`);
  } catch (error) {
    console.warn(
      "[synthflow] Could not sync agent webhooks automatically:",
      error instanceof Error ? error.message : error,
    );
    console.warn("[synthflow] Set these URLs manually in Synthflow Deployment Settings → Phone:");
    console.warn(`  Inbound Webhook URL: ${urls.inbound}`);
    console.warn(`  Data Webhook URL:    ${urls.data}`);
  }

  try {
    await syncCustomActionWebhookUrls(modelId);
    await ensurePhoneAppointmentRule(modelId);
  } catch (error) {
    console.warn(
      "[synthflow] Could not sync custom action URLs:",
      error instanceof Error ? error.message : error,
    );
    console.warn(`  book:         ${urls.bookAction}`);
    console.warn(`  availability: ${urls.availabilityAction}`);
  }
}
