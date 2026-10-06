import { env, synthflowWebhookUrls } from "../config/env.js";
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

export async function updateAgent(modelId: string, payload: Record<string, unknown>) {
  return synthflowRequest("PUT", `/assistants/${encodeURIComponent(modelId)}`, payload);
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
      agent_speak_naturally: true,
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

async function listActionsByName(name: string) {
  const want = name.trim().toLowerCase();
  if (!want) return [] as Array<{ id: string; assistants: string[] }>;
  try {
    const json = await synthflowRequest<SynthflowJson>("GET", "/actions?limit=100");
    const response = (json.response as SynthflowJson | undefined) ?? {};
    const actions = (response.actions as unknown[]) || (json.actions as unknown[]) || [];
    if (!Array.isArray(actions)) return [];

    const matches: Array<{ id: string; assistants: string[] }> = [];
    for (const raw of actions) {
      const row = raw as Record<string, unknown>;
      const actionName = String(row.name || row.action_name || "").trim().toLowerCase();
      if (actionName !== want) continue;
      const id = String(row.action_id || row.id || "").trim();
      if (!id) continue;
      const assistants = Array.isArray(row.assistants)
        ? row.assistants.map((value) => String(value))
        : [];
      matches.push({ id, assistants });
    }
    return matches;
  } catch (error) {
    console.warn(
      "[synthflow] list actions failed:",
      error instanceof Error ? error.message : error,
    );
    return [];
  }
}

export async function findActionIdByName(name: string, preferredModelId?: string) {
  const matches = await listActionsByName(name);
  if (!matches.length) return null;
  if (preferredModelId) {
    const attached = matches.find((row) => row.assistants.includes(preferredModelId));
    if (attached) return attached.id;
  }
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
const AVAILABILITY_SPEAK_RULE = `AVAILABILITY SPEAK RULE:
This clinic has one doctor. When the caller asks for a time or wants to book, call check_doctor_availability.
Say spoken_summary exactly. It is synced from the Doctor Dashboard. Include the fee and both open times.
Do not invent a time or another doctor. Do not offer only one time when two are listed. Then ask which of those times they want, and wait.`;

const PHONE_APPOINTMENT_RULE = `PHONE APPOINTMENT RULE (FOLLOW BEFORE ANY BOOKING):
Call check_existing_appointment only after the caller says a phone number. Do not call it when they say their name.
If has_active_appointment is true, say exactly: I did not book a new appointment. This number already has an active appointment. Please complete or cancel that one first.
If the caller asks "is my appointment confirmed?", say no. The new appointment was not booked. Only the older appointment is still confirmed.
If has_active_appointment is false, or the previous appointment is Completed or Cancelled, continue and book.
Never say a new appointment is confirmed unless verify_booking_otp returns appointment_confirmed true.`;

const BOOKING_OTP_RULE = `BOOKING OTP RULE:
After the caller picks a time with the clinic doctor, and you have their name, phone, and reason, call book_appointment.
Do not read the otp value aloud. Immediately call send_booking_otp with otp and expires_seconds from that response.
Do not pass to_phone_number. send_booking_otp always texts the phone the caller is calling from on this live call.
If send_booking_otp fails, say the text was not delivered. Do not ask for a code.
Then ask the caller to read the six digits. Call verify_booking_otp with the booking phone and the digits they speak.
Say the appointment is confirmed only when appointment_confirmed is true.
If the code is wrong, expired, or already used, say the appointment is not confirmed and that time was released. Never invent a code.`;

/** Prefix rules baked into every Sync so Fine-tuner matches live calls. */
export function synthflowPromptRulePrefix() {
  return `${BOOKING_OTP_RULE}\n\n${AVAILABILITY_SPEAK_RULE}\n\n${PHONE_APPOINTMENT_RULE}`;
}

export async function syncCustomActionWebhookUrls(modelId?: string) {
  const urls = synthflowWebhookUrls();
  const pairs = [
    {
      name: "book_appointment",
      url: urls.bookAction,
      prompt:
        "This does not confirm the appointment. If success is true, do not read otp aloud. Call send_booking_otp immediately with otp and expires_seconds from this response. Do not set the SMS recipient. The code is texted to the phone the caller is calling from. Then ask the caller to read the six digits and call verify_booking_otp. If success is false, say the message exactly and do not say the appointment is booked.",
      message_error: "Say the response message if one is present. Otherwise say the booking could not be saved.",
      jsonBody: {
        doctor_name: "<doctor_name>",
        doctor_id: "<doctor_id>",
        slot_id: "<slot_id>",
        patient_name: "<patient_name>",
        phone: "<phone>",
        reason: "<reason>",
        caller_phone: "<user_phone_number>",
      },
    },
    {
      name: "check_doctor_availability",
      url: urls.availabilityAction,
      prompt:
        "Say spoken_summary exactly, including the fee and both open times. Do not invent a time and do not mention only one time when two are listed. Then ask which of those times they want and wait.",
      message_error: "Let me read the open times from the clinic schedule.",
    },
    {
      name: "check_existing_appointment",
      url: urls.checkAppointmentAction,
      prompt:
        "Call this only after the caller has said a phone number. If has_active_appointment is true, say the message exactly and stop. The new appointment is NOT booked. If the caller asks 'is my appointment confirmed?', say no, the new one was not booked, and repeat the existing appointment. If has_active_appointment is false, continue and book.",
      message_error: "Please repeat the phone number so I can check existing appointments.",
      create: {
        description:
          "Check whether this phone number already has a Pending or Confirmed appointment. Call this as soon as the caller gives a phone number, before booking.",
        jsonBody: { phone: "<phone>" },
        variables: [
          {
            name: "phone",
            description: "Phone number the caller just gave",
            example: "+923129312436",
          },
        ],
      },
    },
    {
      name: "verify_booking_otp",
      url: urls.verifyOtpAction,
      prompt:
        "Say the message exactly. If appointment_confirmed is true, tell the caller the appointment is confirmed and read the reference, doctor, date, and time. If appointment_confirmed is false, say the appointment is not confirmed. Do not invent a confirmation.",
      message_error: "I could not check that code. The appointment is not confirmed.",
      jsonBody: { phone: "<phone>", otp: "<otp>", caller_phone: "<user_phone_number>" },
      create: {
        description:
          "Verify the 6-digit code the caller reads from the SMS. Confirm the appointment only when this returns appointment_confirmed true.",
        jsonBody: { phone: "<phone>", otp: "<otp>", caller_phone: "<user_phone_number>" },
        variables: [
          {
            name: "phone",
            description: "Mobile number the code was sent to",
            example: "+923129312436",
          },
          {
            name: "otp",
            description: "The six digits the caller reads from the text message",
            example: "482913",
          },
          {
            name: "user_phone_number",
            description: "Inbound caller phone; always send this as caller_phone",
            example: "+923129312436",
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

    const body: Record<string, unknown> = { url: pair.url };
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

  const recordsSmsActionId = await ensureRecordsUploadSmsAction(modelId).catch((error) => {
    console.warn(
      "[synthflow] Could not prepare records upload SMS:",
      error instanceof Error ? error.message : error,
    );
    return null;
  });
  if (recordsSmsActionId) attachIds.push(recordsSmsActionId);

  if (modelId && attachIds.length) {
    await attachActions(modelId, attachIds).catch((error) => {
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
  if (modelId && recordsSmsActionId) {
    await attachRecordsUploadSms(modelId, recordsSmsActionId).catch((error) => {
      console.warn(
        "[synthflow] Could not map the records upload SMS action:",
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
    await attachBookCallerPhone(modelId).catch((error) => {
      console.warn(
        "[synthflow] Could not map the caller phone on book_appointment:",
        error instanceof Error ? error.message : error,
      );
    });
  }
}

const OTP_SMS_BODY =
  "Your Qubetech appointment code is <otp>. It expires in <expires_seconds> seconds and can be used once. Do not share it.";

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
  next = next.replace(
    /^(BOOKING OTP RULE:|AVAILABILITY SPEAK RULE:|PHONE APPOINTMENT RULE)[\s\S]*?(?=\nYou are |\nPRIMARY MISSION:)/,
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

  prompt = stripStaleMultiDoctorPrompt(prompt);
  let changed = false;
  if (!prompt.includes("I did not book a new appointment")) {
    prompt = prompt
      .replace(/PHONE APPOINTMENT RULE[\s\S]*?(?=\n\n|\nYou are|\nPRIMARY|\nCRITICAL|$)/, "")
      .trim();
    prompt = `${PHONE_APPOINTMENT_RULE}\n\n${prompt}`.trim();
    changed = true;
  }
  if (prompt.includes("AVAILABILITY SPEAK RULE")) {
    const refreshed = prompt.replace(
      /AVAILABILITY SPEAK RULE:[\s\S]*?(?=\n\n[A-Z]|\n\nYou are|$)/,
      AVAILABILITY_SPEAK_RULE,
    );
    if (refreshed !== prompt) {
      prompt = refreshed;
      changed = true;
    }
  } else {
    prompt = `${AVAILABILITY_SPEAK_RULE}\n\n${prompt}`.trim();
    changed = true;
  }
  if (prompt.includes("BOOKING OTP RULE")) {
    const refreshed = prompt.replace(
      /BOOKING OTP RULE:[\s\S]*?(?=\n\n[A-Z]|\n\nYou are|$)/,
      BOOKING_OTP_RULE,
    );
    if (refreshed !== prompt) {
      prompt = refreshed;
      changed = true;
    }
  } else {
    prompt = `${BOOKING_OTP_RULE}\n\n${prompt}`.trim();
    changed = true;
  }
  if (prompt.includes("unless book_appointment returns success true")) {
    prompt = prompt.replaceAll(
      "unless book_appointment returns success true",
      "unless verify_booking_otp returns appointment_confirmed true",
    );
    changed = true;
  }
  if (!changed) {
    console.log("[synthflow] System prompt already includes the phone, availability, and OTP rules");
    return;
  }
  await updateAgent(modelId, {
    agent: {
      ...agent,
      prompt,
    },
  });
  console.log("[synthflow] Phone appointment rule added to the live system prompt");
}

export async function attachActions(modelId: string, actionIds: string[]) {
  const ids = actionIds.filter(Boolean);
  if (!ids.length) return null;
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    actions: ids,
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
            llm_config: { description: "Contact phone the caller gave for the appointment", example: "+923708321774" },
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
              description: "The six digits the caller reads from the text message",
              example: "482913",
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

const RECORDS_UPLOAD_SMS_BODY =
  "Qubetech clinic: Dr. <doctor_name> requested your medical records for appointment <appointment_reference>. Upload securely here (expires in 7 days): <upload_url>. Sent to <to_phone_number>.";

function recordsSmsDeliveryPrompt(input: {
  doctorName: string;
  appointmentReference: string;
  uploadUrl: string;
  toPhone: string;
}) {
  return `You are delivering one SMS for Qubetech clinic. Do not book appointments and do not ask questions.
Immediately call send_records_upload_link with these exact values:
doctor_name: ${input.doctorName}
appointment_reference: ${input.appointmentReference}
upload_url: ${input.uploadUrl}
to_phone_number: ${input.toPhone}
Pass to_phone_number exactly as ${input.toPhone}. That value is only for the message body. The SMS recipient must stay the patient on this call (${input.toPhone}), never the clinic number.
Do not say the SMS was sent until after send_records_upload_link finishes successfully.
If send_records_upload_link fails or errors, say exactly: "The text was not delivered." Do not claim the SMS was sent.
If it succeeds with no error, say only: "I have texted your secure upload link. Goodbye." Then end the call.`;
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
  // Do NOT set to_phone_number here. On outbound calls that override was resolving to the
  // clinic number and blocking delivery. Default recipient is user_phone_number (the patient).
  const body = {
    name: "send_records_upload_link",
    message_body: RECORDS_UPLOAD_SMS_BODY,
    from_phone_number: fromNumber,
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

async function attachRecordsUploadSms(modelId: string, actionId: string) {
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        input_variables_mapping: [
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
            // Message-body only. Destination uses default user_phone_number (patient).
            variable_name: "to_phone_number",
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

function extractCallId(payload: unknown): string {
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

function readRecordsSmsExecution(callPayload: unknown): {
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

/**
 * Send the medical-records upload link through the voice agent's INCALL_SMS action
 * from the clinic number (+14244849053). Uses a short outbound call so the same
 * Synthflow voice SMS path as OTP can deliver the text to the patient's registered phone.
 * Does not use /chat/outbound (chat-agent API).
 */
export async function sendClinicSms(payload: ClinicRecordsSmsPayload) {
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

  const actionId = await ensureRecordsUploadSmsAction(agentId);
  if (!actionId) {
    throw new Error("Could not prepare the clinic records SMS action");
  }
  await attachRecordsUploadSms(agentId, actionId);

  const doctorName = payload.doctorName.replace(/^Dr\.?\s*/i, "").trim() || "your doctor";
  const prompt = recordsSmsDeliveryPrompt({
    doctorName,
    appointmentReference: payload.appointmentReference,
    uploadUrl: payload.uploadUrl,
    toPhone,
  });

  const started = await synthflowRequest<SynthflowJson>("POST", "/calls", {
    model_id: agentId,
    phone: toPhone,
    name: payload.patientName?.trim() || "Patient",
    from_phone_number: fromNumber,
    custom_variables: [
      { key: "doctor_name", value: doctorName },
      { key: "appointment_reference", value: payload.appointmentReference },
      { key: "upload_url", value: payload.uploadUrl },
      { key: "to_phone_number", value: toPhone },
    ],
    greeting: "Hello, this is Qubetech clinic calling about a medical records request.",
    prompt,
  });

  const callId = extractCallId(started);
  if (!callId) {
    throw new Error("Synthflow started a call but did not return a call id");
  }

  // Wait for the INCALL_SMS action result before telling the doctor it was sent.
  let sawCompletedCall = false;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    await sleep(3000);
    const call = await getPhoneCall(callId);
    const callRoot = asJsonRecord(call);
    const response = asJsonRecord(callRoot.response);
    const callRow = asJsonRecord(
      response.call ||
        (Array.isArray(response.calls) ? response.calls[0] : undefined) ||
        callRoot,
    );
    const status = String(callRow.status || "").toLowerCase();
    if (status && status !== "in-progress" && status !== "ringing" && status !== "queued") {
      sawCompletedCall = true;
    }

    const execution = readRecordsSmsExecution(call);
    if (!execution.ran) {
      if (sawCompletedCall && attempt >= 2) break;
      continue;
    }

    const sentTo = normalizePhone(execution.toPhone);
    if (execution.error) {
      throw new Error(
        `SMS provider failed while sending to ${sentTo || toPhone}: ${execution.error}`,
      );
    }
    if (sentTo && sentTo === normalizePhone(fromNumber)) {
      throw new Error(
        `SMS was addressed to the clinic number ${sentTo} instead of the patient number ${toPhone}`,
      );
    }
    if (sentTo && sentTo !== toPhone) {
      throw new Error(
        `SMS was addressed to ${sentTo} instead of the patient number ${toPhone}`,
      );
    }
    return { callId, toPhone, fromNumber, actionName: execution.actionName };
  }

  throw new Error(
    `SMS action did not finish for ${toPhone}. The patient may need to answer the clinic call, or you can share the upload link manually.`,
  );
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
 * This workspace agent is a voice agent, so SMS is sent with the in-call SMS action
 * on a short outbound call to that same number.
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
  if (!message) throw new Error("Reminder message is empty");

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

  throw new Error(
    `Reminder SMS action did not finish for ${toPhone}. The patient may need to answer the clinic call.`,
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
