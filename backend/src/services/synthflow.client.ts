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
const OPENING_RULE = `OPENING RULE:
The greeting already includes the clinic welcome, the doctor's name, and the consultation fee only when that doctor has a fee.
If the greeting did not already say the doctor's name, say only opening_doctor_line, then ask how you can help.
If the caller asks about the doctor, answer from the latest Clinic doctor profile (specialty, experience, qualifications, certifications, expertise, languages, hospital, location, fee, consultation type/services, about). Never invent missing details.`;

const AVAILABILITY_SPEAK_RULE = `AVAILABILITY SPEAK RULE (FOLLOW EXACTLY — NEVER REFUSE TO CHECK):
SPEAKING: Speak clearly at a calm natural pace. Short pause after questions.
EXCEPTION TO BREVITY: When answering availability, say the full message / spoken_summary from check_doctor_availability (word limits do not apply to that list).
IMMEDIATE AVAILABILITY QUESTIONS (do these first — do not stall):
- If the caller asks about TODAY's availability / open times today → immediately call check_doctor_availability with date "today". Say the returned message (or spoken_summary) exactly, then WAIT.
- If the caller asks about the weekly schedule / this week / which days are available → immediately call check_doctor_availability with date empty. Say the returned message (or spoken_summary) exactly, then WAIT.
BOOKING ORDER (when they want to book but have not asked for a list yet):
1. Say ONLY: "Which day would you like your appointment?" Then STOP and WAIT. Do not list dates yet.
2. If they name a day (for example Friday, today, or October 17), call check_doctor_availability with that date. Say message / spoken_summary exactly (open times for that date). Ask which time. Then WAIT.
3. Only if they say they do not know, call check_doctor_availability with date empty. Say message / spoken_summary exactly (open dates for the next seven days). Ask which date. Then WAIT.
4. Only after they pick a time, collect booking details (reason, name, phone), then follow BOOKING OTP RULE step by step (check_existing_appointment → book_appointment → OTP → verify_booking_otp).
Never recite open slots from the doctor profile. Never invent a date or time.
Bookable times come only from check_doctor_availability message / spoken_summary.`;

const PHONE_APPOINTMENT_RULE = `PHONE APPOINTMENT RULE (FOLLOW BEFORE ANY BOOKING):
Call check_existing_appointment only after the caller says a phone number. Do not call it when they say their name.
If has_active_appointment is true, say exactly: I did not book a new appointment. This number already has an active appointment. Please complete or cancel that one first.
If the caller asks "is my appointment confirmed?", say no. The new appointment was not booked. Only the older appointment is still confirmed.
If has_active_appointment is false, or the previous appointment is Completed or Cancelled, you MUST next call book_appointment with doctor_id, slot_id, patient_name, phone, and reason. Do NOT ask for a verification code yet. Do NOT call verify_booking_otp yet.
Never say a new appointment is booked or confirmed unless verify_booking_otp returns appointment_confirmed true.`;

const BOOKING_OTP_RULE = `BOOKING OTP RULE — MANDATORY ORDER (never skip a step):
The appointment is not booked and not confirmed until verify_booking_otp returns appointment_confirmed true.
Required sequence after the caller picks a real open time and gives name, phone, and reason:
1. Call check_existing_appointment with the booking phone.
2. If has_active_appointment is true, stop. Do not book. Do not ask for a code.
3. If has_active_appointment is false, you MUST call book_appointment with doctor_id, real slot_id from check_doctor_availability, patient_name, phone, and reason. This only holds the time.
4. ONLY after book_appointment returns success true (and otp_required true): ask exactly "Please say the six-digit verification code." Then WAIT.
5. Call verify_booking_otp with the booking phone and the digits they speak.
If you did not catch the digits, say: Sorry, I did not catch that. Please say the six digits slowly. Then WAIT and call verify_booking_otp again.
If appointment_confirmed is false, say the message. If it says to call book_appointment first, do that before asking for a code again.
NEVER ask for a verification code before book_appointment succeeds in this call.
NEVER call verify_booking_otp before book_appointment succeeds in this call.
NEVER say, read, or hint any OTP digits (not 123456, not one two three…). Do not speak the otp field if present.
Never invent a confirmation. Never say the visit is booked before verify_booking_otp returns appointment_confirmed true.`;

const RECORDS_UPLOAD_OFFER_RULE = `RECORDS UPLOAD OFFER RULE:
After verify_booking_otp returns appointment_confirmed true, first say the confirmation message (final appointment summary) exactly.
Then ask exactly in English: Would you like to share your medical records or any relevant files with the doctor?
WAIT for the caller to answer.
If they say yes (or clearly agree), call offer_records_upload with consent yes, the booking phone (any mobile they gave for the booking — e.g. +12014799258), and appointment_reference.
Then IMMEDIATELY call send_records_upload_link (same live call, like OTP SMS). Fields are auto-filled from offer_records_upload — do not invent a phone or URL. Then say you texted the secure upload link to the booking mobile.
If they say no (or decline), call offer_records_upload with consent no. Say the action message and continue normally.
NEVER call deliver_records_upload_sms on an inbound booking call. NEVER place a second outbound call for the upload link. NEVER read the URL aloud.
Do not require an upload. Do not invent an upload link.
Do not run this rule before the appointment is confirmed.`;

/** Prefix rules baked into every Sync so Fine-tuner matches live calls. */
export function synthflowPromptRulePrefix() {
  return `${OPENING_RULE}\n\n${BOOKING_OTP_RULE}\n\n${RECORDS_UPLOAD_OFFER_RULE}\n\n${AVAILABILITY_SPEAK_RULE}\n\n${PHONE_APPOINTMENT_RULE}`;
}

export async function syncCustomActionWebhookUrls(modelId?: string) {
  const urls = synthflowWebhookUrls();
  const pairs = [
    {
      name: "book_appointment",
      url: urls.bookAction,
      prompt:
        "REQUIRED before any verification code. This does not book or confirm the appointment. If success is true, the time is only on hold — then ask the caller to say the six-digit verification code, WAIT, and call verify_booking_otp. Never say OTP digits aloud. Confirm only when appointment_confirmed is true. If success is false, say the message exactly and do not ask for a code.",
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
      create: {
        description:
          "REQUIRED after check_existing_appointment clears. Hold a real open slot_id for OTP verification. Call this before asking for any verification code.",
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
            description: "Booking mobile number the caller provided",
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
        "REQUIRED: Say the response message field exactly (same text as spoken_summary), then WAIT. If mode is dates, those are open dates for the next seven days — pause between dates, ask which date. If mode is slots, those are open times for the chosen date — pause between times, ask which time. Never invent a date or time. Call this immediately when the caller asks about today's times or the weekly schedule.",
      message_error: "Let me check the clinic schedule for open dates in the next seven days.",
      jsonBody: { date: "<date>" },
      create: {
        description:
          "Return live open dates for the next seven days, or open times for one day from the Doctor Dashboard. Call immediately when the caller asks about today's availability (date=today), the weekly schedule (date empty), or after they name a day.",
        jsonBody: { date: "<date>" },
        variables: [
          {
            name: "date",
            description:
              "Use empty for weekly open dates. Use today for today's open times. Or pass a chosen day (tomorrow, Wednesday, October 15).",
            example: "today",
          },
        ],
      },
    },
    {
      name: "check_existing_appointment",
      url: urls.checkAppointmentAction,
      prompt:
        "Call this only after the caller has said a phone number. If has_active_appointment is true, say the message exactly and stop. The new appointment is NOT booked. If the caller asks 'is my appointment confirmed?', say no, the new one was not booked, and repeat the existing appointment. If has_active_appointment is false, say we can continue, then IMMEDIATELY call book_appointment with doctor_id, slot_id, patient_name, phone, and reason. Do NOT ask for a verification code until book_appointment succeeds.",
      message_error: "Please repeat the phone number so I can check existing appointments.",
      create: {
        description:
          "Check whether this phone number already has a Pending or Confirmed appointment. Call this as soon as the caller gives a phone number, before book_appointment.",
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
        "Only call this AFTER book_appointment succeeded in this call. Say the message exactly. If appointment_confirmed is true, give the final appointment summary from the message (reference, doctor, date, time). Then ask exactly: Would you like to share your medical records or any relevant files with the doctor? Wait for yes or no, then call offer_records_upload. If appointment_confirmed is false, say the message — if it says to call book_appointment first, call book_appointment before asking for a code again. Never say OTP digits aloud. If you did not catch the digits, ask them to say the six digits slowly, then call this action again. Do not invent a confirmation.",
      message_error:
        "Sorry, I did not catch that. Please say the six digits slowly.",
      jsonBody: { phone: "<phone>", otp: "<otp>", caller_phone: "<user_phone_number>" },
      create: {
        description:
          "Verify the 6-digit testing code 123456 the caller speaks AFTER book_appointment. Confirm the appointment only when this returns appointment_confirmed true.",
        jsonBody: { phone: "<phone>", otp: "<otp>", caller_phone: "<user_phone_number>" },
        variables: [
          {
            name: "phone",
            description: "Mobile number used for the booking",
            example: "+923129312436",
          },
          {
            name: "otp",
            description: "The six digits the caller spoke. Testing code is always 123456.",
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
        "If next_action is send_records_upload_link (or consent was yes with records_sms_body), immediately call send_records_upload_link — do not collect fields, they are filled from this action — then say you texted the secure upload link to the booking mobile. If they said no, continue normally. Never invent a URL. Never call deliver_records_upload_sms. Never start another outbound call.",
      message_error:
        "Would you like to share your medical records or any relevant files with the doctor?",
      jsonBody: {
        consent: "<consent>",
        phone: "<phone>",
        appointment_reference: "<appointment_reference>",
        caller_phone: "<user_phone_number>",
      },
      create: {
        description:
          "After the confirmed appointment summary, log whether the caller wants to share medical records. If yes, text a secure upload link to the booking phone. If no, continue without upload.",
        jsonBody: {
          consent: "<consent>",
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
    /^(?:OPENING RULE:|BOOKING OTP RULE(?:[^\n]*):|RECORDS UPLOAD OFFER RULE:|AVAILABILITY SPEAK RULE(?:[^\n]*):|PHONE APPOINTMENT RULE(?:[^\n]*):)[\s\S]*?(?=\nYou are |\nPRIMARY MISSION:)/,
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
  // Calm pace — not the minimum 0.7 (that sounds too slow / stalled).
  if (voiceSpeed !== 0.85) changed = true;
  const calmVoicePrompt =
    "Speak clearly at a calm, natural pace. Short pause after questions. Do not rush dates, times, or phone numbers.";
  if (String(agent.voice_prompt || "") !== calmVoicePrompt) changed = true;
  if (!changed) {
    console.log("[synthflow] System prompt already includes the opening, phone, availability, OTP rules, and calm voice");
    return;
  }
  await updateAgent(modelId, {
    agent: {
      ...agent,
      prompt,
      greeting_message: greetingMessage,
      greeting_message_mode: "agent_static",
      // Synthflow allows 0.7–1.2 (1.0 = natural). 0.85 is calm without dragging.
      voice_speed: 0.85,
      voice_prompt: calmVoicePrompt,
    },
  });
  console.log("[synthflow] Opening, phone, availability, OTP rules, and calm voice added to the live system prompt");
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
              description: "The six digits the caller spoke. Testing code is always 123456.",
              example: "123456",
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
            variable_name: "phone",
            source: "llm",
            llm_config: {
              description:
                "Mobile number used for the booking (SMS destination). Can be any E.164 patient number such as +12014799258 — not only the inbound caller line, and never the clinic line.",
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
  // Recipient is set at attach time via to_phone_number (booking mobile from offer_records_upload).
  // That can be any patient SIM — not only the inbound caller line.
  const body = {
    name: "send_records_upload_link",
    message_body: RECORDS_UPLOAD_SMS_BODY,
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

/** Inbound booking: auto-fill SMS body + booking phone from offer_records_upload output. */
async function attachRecordsUploadSms(modelId: string, actionId: string) {
  return synthflowRequest("POST", "/actions/attach", {
    model_id: modelId,
    items: [
      {
        action_id: actionId,
        attachment_type: "during",
        trigger_condition:
          "Call this immediately after offer_records_upload returns success true with records_consent yes (or next_action send_records_upload_link). Do not ask the caller for fields — they come from offer_records_upload. Never call this before offer_records_upload succeeds.",
        input_variables_mapping: [
          {
            variable_name: "records_sms_body",
            source: "action_results",
            source_key: "offer_records_upload_records_sms_body",
          },
          {
            variable_name: "to_phone_number",
            source: "action_results",
            source_key: "offer_records_upload_to_phone_number",
          },
        ],
      },
    ],
  });
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
 * Send a plain SMS without placing a voice call (Synthflow chat outbound).
 * Falls back gracefully when the workspace has no SMS chat channel configured.
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

  try {
    const result = await synthflowRequest<SynthflowJson>("POST", "/chat/outbound", {
      agent_id: agentId,
      channel: "sms",
      to_number: toPhone,
      from_number: fromNumber,
      initial_message: body,
    });
    console.log(
      `[synthflow] Direct SMS accepted → ${toPhone} body_len=${body.length} response=${JSON.stringify(result).slice(0, 240)}`,
    );
    return { ok: true, mode: "chat_outbound" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[synthflow] Direct SMS failed → ${toPhone}:`, message);
    return { ok: false, error: message };
  }
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

function readCallStatus(callPayload: unknown): string {
  const callRoot = asJsonRecord(callPayload);
  const response = asJsonRecord(callRoot.response);
  const fromList = Array.isArray(response.calls) ? asJsonRecord(response.calls[0]) : {};
  const callRow = asJsonRecord(response.call || fromList || callRoot);
  return String(callRow.status || fromList.status || callRoot.status || "").toLowerCase();
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
        const execution = readRecordsSmsExecution(call);
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
