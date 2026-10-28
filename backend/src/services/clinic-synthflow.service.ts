import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { env, synthflowWebhookUrls } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { normalizePhone } from "../utils/phone.js";
import {
  attachActions,
  attachAssistantPhoneNumbers,
  createCustomAction,
  createInboundAgent,
  createOutboundAgent,
  createInformationExtractor,
  findActionIdByName,
  findAssistantByPhone,
  getCustomActionUrl,
  getPhoneCall,
  isSynthflowConfigured,
  listAssistants,
  listAssistantActionIds,
  pruneStaleActionIds,
  readCallStatus,
  reconcileAssistantActions,
  startOutboundVoiceCall,
  synthflowRequest,
  toSynthflowLanguage,
  synthflowCompactLivePrompt,
  updateAgent,
  updateCustomActionUrl,
} from "./synthflow.client.js";
import {
  clinicDoctorProfileBlock,
  consultationFeeToSpeak,
  formatOpenSlotLabels,
  getClinicDoctor,
  greetingWithOpeningLine,
} from "./clinic-doctor.service.js";
import { generateSlotsFromWeeklyHours } from "./doctor-availability.service.js";
import { buildLiveAvailabilityPromptBlock } from "./synthflow.webhooks.service.js";

const SETTINGS_ID = "default";

const APPOINTMENT_EXTRACTORS = [
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "patient_name",
    description: "What is the patient's full name?",
    examples: ["Maya Okonkwo", "Qurat ul Ain"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "phone",
    description:
      "What exact contact phone number did the patient speak for booking? Convert spoken digit words to digits with country code when known. If they said same number, use the calling number. Answer none if unknown. Never invent a number.",
    examples: ["+14155550148", "none"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "doctor_id",
    description: "What is the clinic doctor_id if mentioned? Answer none if not mentioned.",
    examples: ["cmu16ksa00001vgis6s1oq1m9", "none"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "doctor_name",
    description: "What is the clinic doctor's name if mentioned? Answer none if not mentioned.",
    examples: ["Dr. Ahmed Khan", "none"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "slot_id",
    description: "What is the appointment slot_id if mentioned? Answer none if not mentioned.",
    examples: ["cmu2awlf40008vgfsoulh0ck4", "none"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "reason",
    description: "What is the brief reason for the visit? Answer none if not given.",
    examples: ["Chest pain follow-up", "Routine checkup", "none"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "email",
    description: "What email did the patient give for confirmation? Answer none if declined or missing.",
    examples: ["patient@example.com", "none"],
  },
];

function defaultGreeting(clinicName: string) {
  return `Hi, you've reached ${clinicName}. How may I help you today?`;
}

function loadDefaultPromptFromFile() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const promptPath = path.resolve(here, "../../synthflow/agent-prompt.md");
    const raw = fs.readFileSync(promptPath, "utf8");
    const match = raw.match(/## System Prompt\s*```([\s\S]*?)```/);
    return match?.[1]?.trim() || "";
  } catch {
    return "";
  }
}

function fallbackPrompt(clinicName: string) {
  return `You are the polite, calm, direct, and concise AI phone receptionist for ${clinicName}.

PRIMARY MISSION:
This clinic has one doctor. The greeting already says that doctor's name and the consultation fee when one is set. When the caller wants to book, offer only real open slots, collect name and phone, and confirm only after the verification code succeeds.

CRITICAL RULES:
- Keep every response to 1-2 short sentences. Ask only one question per turn, then wait.
- When they want to book, reply immediately with only "Which day would you like your appointment?" — do not call any action first.
- Never give medical advice or diagnoses.
- Never invent another doctor, specialty list, or time.
- Use only the latest Clinic doctor profile block for specialty, experience, qualifications, certifications, expertise, languages, hospital, location, fee, and consultation type.
- Never invent or reuse outdated profile details that are not in the Clinic doctor block.
- Availability and bookable times come ONLY from check_doctor_availability (live DB slots for today / current week). Never invent times. Never speak usual weekly hours.
- One active appointment per mobile: if has_active_appointment is true, say the check_existing_appointment message and do not book again.
- If asked about the doctor, answer from the Clinic doctor profile (specialty, experience, qualifications, clinic, fee, languages, and other listed details).
- After the caller picks a time: ask full name → WAIT → ask reason for visit → WAIT → ask phone number → WAIT → say "Thank you. Let me check whether there is already an active appointment associated with this number." → check_existing_appointment → only if clear, book_appointment → ask for code → verify_booking_otp. Never ask only for the name. Never skip reason, phone, or the phone check.
- Do not say the appointment is booked until verify_booking_otp returns appointment_confirmed true.

Use the Clinic doctor profile and open slots injected on sync and on each call.`;
}

const CLINIC_DOCTOR_HEADING = "## Clinic doctor";

export function stripOutdatedDoctorLists(prompt: string) {
  let next = prompt.replace(/\r\n/g, "\n");
  // Drop boot-time rule prefixes — Sync re-adds the current one-doctor versions.
  next = next.replace(
    /^(?:OPENING RULE:|FAST RESPONSE RULE(?:[^\n]*):|BOOKING OTP RULE(?:[^\n]*):|RECORDS UPLOAD OFFER RULE:|AVAILABILITY SPEAK RULE(?:[^\n]*):|PHONE APPOINTMENT RULE(?:[^\n]*):)[\s\S]*?(?=\nYou are |\nPRIMARY MISSION:)/,
    "",
  );
  next = next.replace(/\n## Specialties[\s\S]*?(?=\n## Fast Booking Protocol|\n## Current roster|\n## Live doctor directory|\n## Clinic doctor|$)/, "\n");
  next = next.replace(/\n## Doctors \(quote exact fee\)[\s\S]*?(?=\n## Fast Booking Protocol|\n## Current roster|\n## Live doctor directory|\n## Clinic doctor|$)/, "\n");
  next = next.replace(
    /\n## (Availability answers|Live openings|Doctor profiles|Current roster|Live doctor directory|Clinic doctor)[\s\S]*$/g,
    "",
  );
  next = next.replace(/^\s*- (Cardiology|Dermatology|Neurology|Pediatrics|Orthopedics|General Medicine): ONLY .+$/gm, "");
  next = next.replace(
    /If caller asks generally "What specialties do you have\?", say: "We offer .+ Which one do you need\?"/,
    "This clinic has one doctor. Introduce that doctor and specialty; do not list other specialties.",
  );
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

export function mergeDirectoryIntoPrompt(basePrompt: string, knowledge: string) {
  const cleaned = stripOutdatedDoctorLists(basePrompt);
  return `${cleaned}\n\n${knowledge}`;
}

export async function buildDoctorsDirectoryKnowledge() {
  let doctor = await getClinicDoctor({ openSlotsTake: 16 });
  if (!doctor) {
    return {
      doctorsCount: 0,
      clinicDoctorName: null as string | null,
      clinicDoctorId: null as string | null,
      openSlotsSummary: "none",
      knowledge: [
        `${CLINIC_DOCTOR_HEADING} (source of truth)`,
        "No active doctor profile is configured in the Doctor Dashboard yet.",
        "Do not invent a doctor. Ask the caller to try again after the clinic finishes setup.",
      ].join("\n"),
    };
  }

  // Weekly hours alone are not enough — auto-materialize open slots so the agent has real times.
  if (doctor.availability.length === 0) {
    try {
      await generateSlotsFromWeeklyHours(doctor.userId, { weeks: 1, allowEmpty: true });
      doctor = (await getClinicDoctor({ openSlotsTake: 16 })) ?? doctor;
    } catch (error) {
      console.warn(
        "[synthflow] Could not auto-generate open slots for prompt sync:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const profile = clinicDoctorProfileBlock(doctor);
  const fee = consultationFeeToSpeak(profile.fee);
  const feeSpoken = fee
    ? `${fee}${profile.feeCurrency ? ` ${profile.feeCurrency}` : ""}`.trim()
    : "";
  const openingLabels = formatOpenSlotLabels(doctor.availability, {
    withIds: true,
    limit: 16,
  });
  const openSlotsSummary = openingLabels.length ? openingLabels.join("; ") : "none";
  const list = (items: string[]) =>
    items.map((item) => item.trim()).filter(Boolean).join(", ") || "none";

  return {
    doctorsCount: 1,
    clinicDoctorName: profile.doctorName,
    clinicDoctorId: profile.doctorId,
    openSlotsSummary,
    knowledge: [
      `${CLINIC_DOCTOR_HEADING} (source of truth — use only these details)`,
      "This clinic has exactly ONE doctor. Never mention any other doctor.",
      "IGNORE any older doctor names or profile details elsewhere in this prompt if they conflict with this Clinic doctor block.",
      "This block is refreshed whenever the doctor saves My Profile or Availability. Never invent missing fields.",
      `Doctor name: ${profile.doctorName}`,
      `doctor_id (for actions only — never speak this id): ${profile.doctorId}`,
      `Specialty: ${profile.specialty || "none"}`,
      `Years of experience: ${profile.experienceYears}`,
      `Hospital / clinic: ${profile.hospital}`,
      `Clinic location: ${profile.location || "none"}`,
      `Consultation fee: ${feeSpoken || "none"}`,
      `Consultation type: ${profile.consultationType}`,
      `Consultation services: ${list(profile.consultationServices)}`,
      `Qualifications: ${list(profile.qualifications)}`,
      `Certifications: ${list(profile.certifications)}`,
      `Areas of expertise: ${list(profile.areasOfExpertise)}`,
      `Languages: ${list(profile.languages)}`,
      `About: ${profile.bio}`,
      // Do NOT put usual weekly hours here — the model invents Mondays/extra days from them.
      "Usual weekly hours: DO NOT SPEAK. DO NOT use for availability. Bookable times come only from check_doctor_availability (live database slots the doctor added).",
      `Action slot ids (INTERNAL ONLY — NEVER read aloud, NEVER list to the caller): ${openSlotsSummary}`,
      "",
      "## How to use this profile",
      "- On the opening, say the doctor name and the consultation fee when one is set.",
      "- If the caller asks about the doctor, answer from this block (specialty, experience, qualifications, certifications, expertise, languages, hospital, location, fee, consultation type/services, about).",
      "- When they say they want to book: reply immediately with only \"Which day would you like your appointment?\" Do not call any action yet.",
      "- Availability HARD RULE: speak ONLY what check_doctor_availability returns. Today → call with date today, say message exactly. This week / which days → call with date empty, say message exactly. Named day → call with that date, say message exactly. Never invent Oct 26 or any day/time not in the tool response.",
      "- After the caller picks a time: ask \"May I have your full name?\" WAIT. Then ask \"What is the reason for your visit today?\" WAIT. Then ask \"What phone number should we use for this booking?\" WAIT. Then say exactly \"Thank you. Let me check whether there is already an active appointment associated with this number.\" Then MUST call check_existing_appointment with that exact number. If has_active_appointment is true, say the message and stop — do not book and do not ask for a code. If clear (or prior visit Completed/Cancelled), call book_appointment with a real slot_id from check_doctor_availability. Only then ask for the six-digit verification code and call verify_booking_otp.",
      "- Order after an open time: full name → visit reason → phone → check_existing_appointment → book_appointment → OTP. Never skip. Never go silent after the greeting when they say they want to book — say exactly \"Which day would you like your appointment?\"",
      "- Never ask only for the name and skip reason/phone/check. Never say OTP digits aloud. Never ask for a verification code before book_appointment succeeds. Do not say the appointment is booked until verify_booking_otp returns appointment_confirmed true.",
    ].join("\n"),
  };
}

function normalizeActionIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  return [];
}

async function ensureAppointmentExtractors(existingIds: string[]) {
  // DB may still hold extractor ids that were deleted in Synthflow → attach 404.
  const { living } = await pruneStaleActionIds(existingIds);
  const ids: string[] = [...living];

  for (const spec of APPOINTMENT_EXTRACTORS) {
    try {
      // Prefer an existing workspace extractor with this identifier/name.
      // findActionIdByName also matches info_extractor_<identifier>.
      let actionId = await findActionIdByName(spec.identifier);
      if (!actionId) {
        const created = await createInformationExtractor(spec);
        actionId = created.action_id;
      }
      if (actionId && !ids.includes(actionId)) ids.push(actionId);
    } catch (error) {
      console.warn(
        "[synthflow] extractor ensure failed:",
        spec.identifier,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return [...new Set(ids)];
}

/**
 * Conversational booking tools only. Do NOT attach information extractors or
 * send_appointment_reminder to the live inbound agent — extractors run at call
 * end and reminder SMS is outbound-only; keeping them on the inbound agent
 * distracts the LLM after the greeting (observed: greeting → silence).
 */
async function buildCanonicalActionKeepList(preferredIds: string[]): Promise<string[]> {
  const names = [
    AVAILABILITY_ACTION_NAME,
    BOOK_ACTION_NAME,
    "check_existing_appointment",
    "verify_booking_otp",
    "send_booking_otp",
    "offer_records_upload",
    // Records links are emailed via offer_records_upload; send_records_upload_link and
    // deliver_records_upload_sms are outbound-records only — keep off inbound.
  ];
  const preferred = new Set(preferredIds.filter(Boolean));
  const keep: string[] = [];
  for (const name of names) {
    const found = await findActionIdByName(name);
    if (!found) continue;
    const preferredHit = preferredIds.find((id) => preferred.has(id) && id === found) || found;
    if (!keep.includes(preferredHit)) keep.push(preferredHit);
  }
  return keep;
}

const AVAILABILITY_ACTION_NAME = "check_doctor_availability";

async function ensureAvailabilityCustomAction(existingIds: string[]) {
  const urls = synthflowWebhookUrls();
  const availabilityBody = {
    date: "<date>",
  };
  const availabilityPrompt =
    "REQUIRED: Say the response message field exactly (same as spoken_summary), then WAIT. If mode is dates, list those open dates for the next seven days and ask which date. If mode is slots, list those open times and ask which time. Call for today's availability (date=today), weekly schedule (date empty), or after they name a day. Never call when they only say they want to book — ask which day first. Never invent a date or time.";
  let actionId = await findActionIdByName(AVAILABILITY_ACTION_NAME);
  if (actionId) {
    await synthflowRequest("PUT", `/actions/${encodeURIComponent(actionId)}`, {
      CUSTOM_ACTION: {
        url: urls.availabilityAction,
        description:
          "Live Doctor Dashboard availability. Call when the caller asks about today's times (date=today), the weekly schedule (date empty), or after they name a day. Do NOT call for plain 'I want to book' — ask which day first.",
        json_body_stringified: JSON.stringify(availabilityBody),
        variables_during_the_call: [
          {
            name: "date",
            type: "string",
            description:
              "Empty for weekly open dates. today for today's open times. Or a chosen day (tomorrow, Wednesday, October 15).",
            example: "today",
          },
        ],
        prompt: availabilityPrompt,
        message_error: "I could not load open times just now. Which day would you like instead?",
      },
    }).catch((error) => {
      console.warn(
        "[synthflow] availability action refresh failed:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (!actionId) {
    try {
      const created = await createCustomAction({
        name: AVAILABILITY_ACTION_NAME,
        description:
          "Live Doctor Dashboard availability. Call for today's times (date=today), weekly schedule (date empty), or a named day. Do NOT call for plain 'I want to book' — ask which day first.",
        url: urls.availabilityAction,
        jsonBody: availabilityBody,
        variables: [
          {
            name: "date",
            description:
              "Empty for weekly open dates. today for today's open times. Or a chosen day (tomorrow, Wednesday, October 15).",
            example: "today",
          },
        ],
        prompt: availabilityPrompt,
        messageError: "I could not load open times just now. Which day would you like instead?",
      });
      actionId = created.action_id;
    } catch (error) {
      console.warn(
        "[synthflow] availability action create failed:",
        error instanceof Error ? error.message : error,
      );
      actionId = await findActionIdByName(AVAILABILITY_ACTION_NAME);
    }
  }
  if (actionId && !existingIds.includes(actionId)) return [...existingIds, actionId];
  return existingIds;
}

const BOOK_ACTION_NAME = "book_appointment";

async function ensureBookCustomAction(existingIds: string[]) {
  const urls = synthflowWebhookUrls();
  let actionId = await findActionIdByName(BOOK_ACTION_NAME);
  if (actionId) {
    const current = await getCustomActionUrl(actionId).catch(() => null);
    if (current !== urls.bookAction) {
      await updateCustomActionUrl(actionId, urls.bookAction).catch((error) => {
        console.warn(
          "[synthflow] book action URL refresh failed:",
          error instanceof Error ? error.message : error,
        );
      });
    }
    await synthflowRequest("PUT", `/actions/${encodeURIComponent(actionId)}`, {
      CUSTOM_ACTION: {
        json_body_stringified: JSON.stringify({
          doctor_name: "<doctor_name>",
          doctor_id: "<doctor_id>",
          slot_id: "<slot_id>",
          patient_name: "<patient_name>",
          phone: "<phone>",
          reason: "<reason>",
          caller_phone: "<user_phone_number>",
        }),
      },
    }).catch((error) => {
      console.warn(
        "[synthflow] book action caller phone refresh failed:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (!actionId) {
    try {
      const created = await createCustomAction({
        name: BOOK_ACTION_NAME,
        description:
          "Create the clinic appointment with the clinic's one doctor after the caller confirms a time. Send doctor_id/doctor_name plus slot_id from bookable open slots when possible.",
        url: urls.bookAction,
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
            description: "Doctor being booked",
            example: "Sameer",
          },
          {
            name: "doctor_id",
            description: "doctor_id from the live directory if known",
            example: "cmutp5e630002t9fof4ngfahs",
          },
          {
            name: "slot_id",
            description: "Exact slot_id from Live openings / next_slots",
            example: "cmutnug7m0007t91wys0y0ozs",
          },
          {
            name: "patient_name",
            description: "Patient full name",
            example: "Ibrar Khan",
          },
          {
            name: "phone",
            description: "Patient contact phone",
            example: "+923129312436",
          },
          {
            name: "reason",
            description: "Visit reason",
            example: "General checkup",
          },
        ],
        prompt:
          "This does not book or confirm the appointment. If success is true, the time is only on hold. Do not say the appointment is booked or confirmed. Never say OTP digits aloud. Ask the caller to say the six-digit verification code, then call verify_booking_otp. If you did not catch the digits, ask them to repeat slowly. Confirm only when appointment_confirmed is true. If success is false, speak the response message and do not say the appointment is booked.",
        messageError:
          "I could not hold that appointment time. Please say another open time from the schedule, or confirm the booking details.",
      });
      actionId = created.action_id;
    } catch (error) {
      console.warn(
        "[synthflow] book action create failed:",
        error instanceof Error ? error.message : error,
      );
      actionId = await findActionIdByName(BOOK_ACTION_NAME);
    }
  }
  if (actionId && !existingIds.includes(actionId)) return [...existingIds, actionId];
  return existingIds;
}

function isPhoneAlreadyAttachedError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return /already attached|already assigned|phone number already/i.test(msg);
}

export type PublicClinicVoiceSettings = {
  id: string;
  clinicName: string;
  phoneNumber: string;
  synthflowAgentId: string | null;
  agentLanguage: string;
  agentVoiceId: string;
  agentFirstMessage: string;
  agentSystemPrompt: string;
  voiceProvider: string;
  synthflowSyncedAt: string | null;
  synthflowConfigured: boolean;
  webhookUrls: ReturnType<typeof synthflowWebhookUrls>;
  doctorsCount: number;
  clinicDoctorName: string | null;
  clinicDoctorId: string | null;
};

async function getOrCreateSettings() {
  const existing = await prisma.clinicVoiceSettings.findUnique({ where: { id: SETTINGS_ID } });
  if (existing) return existing;

  const filePrompt = loadDefaultPromptFromFile();
  return prisma.clinicVoiceSettings.create({
    data: {
      id: SETTINGS_ID,
      clinicName: "Qubetech AI Receptionist Clinic",
      phoneNumber: env.SYNTHFLOW_PHONE_NUMBER || "",
      synthflowAgentId: env.SYNTHFLOW_AGENT_ID || null,
      agentFirstMessage: defaultGreeting("Qubetech AI Receptionist Clinic"),
      agentSystemPrompt: filePrompt || fallbackPrompt("Qubetech AI Receptionist Clinic"),
    },
  });
}

export async function getClinicVoiceSettings(): Promise<PublicClinicVoiceSettings> {
  const row = await getOrCreateSettings();
  const { doctorsCount, clinicDoctorName, clinicDoctorId } =
    await buildDoctorsDirectoryKnowledge();
  return {
    id: row.id,
    clinicName: row.clinicName,
    phoneNumber: row.phoneNumber || env.SYNTHFLOW_PHONE_NUMBER || "",
    synthflowAgentId: row.synthflowAgentId,
    agentLanguage: row.agentLanguage,
    agentVoiceId: row.agentVoiceId,
    agentFirstMessage: row.agentFirstMessage || defaultGreeting(row.clinicName),
    agentSystemPrompt: row.agentSystemPrompt || loadDefaultPromptFromFile() || fallbackPrompt(row.clinicName),
    voiceProvider: row.voiceProvider,
    synthflowSyncedAt: row.synthflowSyncedAt?.toISOString() ?? null,
    synthflowConfigured: isSynthflowConfigured(),
    webhookUrls: synthflowWebhookUrls(),
    doctorsCount,
    clinicDoctorName: clinicDoctorName ?? null,
    clinicDoctorId: clinicDoctorId ?? null,
  };
}

export async function updateClinicVoiceSettings(input: {
  clinicName?: string;
  phoneNumber?: string;
  synthflowAgentId?: string | null;
  agentLanguage?: string;
  agentVoiceId?: string;
  agentFirstMessage?: string;
  agentSystemPrompt?: string;
}) {
  await getOrCreateSettings();
  const data: Prisma.ClinicVoiceSettingsUpdateInput = {};
  if (input.clinicName !== undefined) data.clinicName = input.clinicName.trim() || "Qubetech AI Receptionist Clinic";
  if (input.phoneNumber !== undefined) data.phoneNumber = normalizePhone(input.phoneNumber);
  if (input.synthflowAgentId !== undefined) {
    data.synthflowAgentId = input.synthflowAgentId?.trim() || null;
  }
  if (input.agentLanguage !== undefined) data.agentLanguage = input.agentLanguage.trim() || "en";
  if (input.agentVoiceId !== undefined) data.agentVoiceId = input.agentVoiceId.trim();
  if (input.agentFirstMessage !== undefined) data.agentFirstMessage = input.agentFirstMessage.trim();
  if (input.agentSystemPrompt !== undefined) data.agentSystemPrompt = input.agentSystemPrompt.trim();

  await prisma.clinicVoiceSettings.update({ where: { id: SETTINGS_ID }, data });
  return getClinicVoiceSettings();
}

export async function createOrUpdateClinicSynthflowAgent(input?: {
  firstMessage?: string;
  systemPrompt?: string;
  phoneNumber?: string;
  language?: string;
  voiceId?: string;
  synthflowAgentId?: string;
  /**
   * When true (default for Sync availability & profile), only push the live
   * prompt/greeting/slots. Skips slow extractor/action create+attach loops.
   * Pass false for first-time Create / full Update AI receptionist.
   */
  promptOnly?: boolean;
}) {
  if (!isSynthflowConfigured()) {
    throw new AppError(400, "SYNTHFLOW_API_KEY is not configured in backend/.env");
  }

  const settings = await getOrCreateSettings();
  const clinicName = settings.clinicName;
  const greeting = greetingWithOpeningLine(
    input?.firstMessage?.trim() || settings.agentFirstMessage.trim() || defaultGreeting(clinicName),
  );
  const { knowledge, doctorsCount, clinicDoctorName, clinicDoctorId, openSlotsSummary } =
    await buildDoctorsDirectoryKnowledge();
  console.log(
    `[synthflow] Syncing clinic doctor → ${clinicDoctorName || "none"} (${clinicDoctorId || "n/a"})`,
  );
  console.log(`[synthflow] Open slots pushed to prompt → ${openSlotsSummary}`);
  // Compact live prompt: workspace LLM is locked to `synthflow` and previously
  // failed (greet → silence) under a ~24KB duplicated rule+template prompt.
  // Keep canonical booking rules + live Clinic doctor block only.
  const fullPrompt = synthflowCompactLivePrompt({
    clinicName,
    clinicDoctorBlock: knowledge,
  });
  console.log(`[synthflow] Live prompt length → ${fullPrompt.length} chars`);

  const phone = normalizePhone(
    input?.phoneNumber || settings.phoneNumber || env.SYNTHFLOW_PHONE_NUMBER || "",
  );
  const urls = synthflowWebhookUrls();
  const lang = toSynthflowLanguage(input?.language || settings.agentLanguage || "en");
  const voiceId = (input?.voiceId || settings.agentVoiceId || "").trim() || undefined;

  const agentConfig = {
    prompt: fullPrompt,
    greeting_message: greeting,
    greeting_message_mode: "agent_static",
    // Enum is lowercase `gpt-4.1-mini`. `gpt-4.1-Mini` was rejected and the live
    // agent silently fell back to weak `synthflow`, which stayed silent after the greeting.
    llm: "gpt-4.1-mini",
    language: lang,
    // Synthflow allows 0.7–1.2 (1.0 = natural). Natural pace keeps turn-taking snappy.
    voice_speed: 1.0,
    voice_prompt:
      "Speak clearly at a natural pace. Start speaking immediately when you have a reply. Brief pause only after questions. Never rush dates, times, or phone numbers. After the greeting, always answer the caller's next utterance — never go silent.",
    // medium = snappier replies than high; still enough wait for international audio.
    patience_level: "medium",
    allowed_idle_time_seconds: 90,
    send_user_idle_reminders: true,
    reminder_after_idle_time_seconds: 8,
    reminder_after_idle_message:
      "I'm still here. Would you like to book an appointment, or something else?",
    // 1 caused cutting off names/numbers mid-speech (transcript: bot overlaps human).
    min_words_to_interrupt: 3,
    noise_cancellation: "standard",
    suppression_level: 0.2,
    // deepgram-nova-3 + high_accuracy: better for names/digits than synthflow-stt/faster.
    transcriber_provider: "deepgram-nova-3",
    transcriber_speech_recognition: "high_accuracy",
    transcriber_keywords: [
      "appointment",
      "book",
      "booking",
      "schedule",
      "availability",
      "today",
      "tomorrow",
      "doctor",
      "verification",
      "code",
      "OTP",
      "zero",
      "one",
      "two",
      "three",
      "four",
      "five",
      "six",
      "seven",
      "eight",
      "nine",
    ],
    ...(voiceId ? { voice_id: voiceId } : {}),
  };

  const agentPayload: Record<string, unknown> = {
    name: `${clinicName} Receptionist`,
    ...(phone ? { phone_number: phone } : {}),
    inbound_call_webhook_url: urls.inbound,
    external_webhook_url: urls.data,
    // Top-level: disable leave-voicemail so answered inbound calls are not ended as voicemail.
    voicemail_message: { enabled: false },
    agent: agentConfig,
  };

  let modelId =
    input?.synthflowAgentId?.trim() || settings.synthflowAgentId || env.SYNTHFLOW_AGENT_ID.trim() || null;
  let action: "created" | "updated" | "linked_existing" = modelId ? "updated" : "created";
  const warnings: string[] = [];

  if (!urls.inbound.includes("https://") && !urls.data.includes("https://")) {
    warnings.push(
      "PUBLIC_API_URL is not HTTPS. Synthflow may not reach localhost — use a tunnel (Cloudflare/ngrok) for live calls.",
    );
  }
  // Live phone actions always hit PUBLIC_API_URL. Local dashboard slots are useless
  // for calls if PUBLIC_API_URL still points at a different host (e.g. production).
  const publicHost = (() => {
    try {
      return new URL(env.PUBLIC_API_URL).hostname;
    } catch {
      return "";
    }
  })();
  const looksLikeLocalTunnel =
    publicHost === "localhost" ||
    publicHost === "127.0.0.1" ||
    publicHost.endsWith(".trycloudflare.com") ||
    publicHost.endsWith(".loca.lt") ||
    publicHost.includes("ngrok");
  if (env.NODE_ENV === "development" && publicHost && !looksLikeLocalTunnel) {
    warnings.push(
      `Live phone availability reads ${publicHost}, not this local database. Set PUBLIC_API_URL to a tunnel of localhost:4000 (or add the same open slots on that host) so check_doctor_availability can list your calendar times.`,
    );
  }
  if (!openSlotsSummary || openSlotsSummary === "none") {
    warnings.push(
      "No open appointment slots in this database. Add slots in Availability (or save weekly hours) before callers can book by phone.",
    );
  }

  if (modelId) {
    // Never re-send phone_number on update — Synthflow returns 400 when it is already attached.
    const { phone_number: _omitPhone, ...updatePayload } = agentPayload;
    await updateAgent(modelId, updatePayload);
    action = "updated";
  } else {
    try {
      const created = await createInboundAgent(agentPayload);
      const response = (created as { response?: Record<string, unknown> }).response || {};
      modelId = String(
        response.model_id ||
          (created as { model_id?: string }).model_id ||
          response.id ||
          (created as { id?: string }).id ||
          "",
      );
      if (!modelId) {
        throw new AppError(502, `Synthflow did not return model_id: ${JSON.stringify(created)}`);
      }
    } catch (error) {
      if (!isPhoneAlreadyAttachedError(error) || !phone) throw error;
      const existing = await findAssistantByPhone(phone);
      if (!existing?.model_id) {
        // Fall back to the agent id from env/UI if phone lookup fails
        const fallbackId =
          input?.synthflowAgentId?.trim() || env.SYNTHFLOW_AGENT_ID.trim() || null;
        if (!fallbackId) throw error;
        modelId = fallbackId;
      } else {
        modelId = existing.model_id;
      }
      const { phone_number: _omitPhone, ...updatePayload } = agentPayload;
      await updateAgent(modelId, updatePayload);
      action = "linked_existing";
      warnings.push(`Phone ${phone} is already on an inbound agent — updated agent ${modelId} without re-attaching the number.`);
    }
  }

  let actionIds = normalizeActionIds(settings.synthflowActionIds);
  // Fast by default when the agent already has actions — Sync/Update only need the
  // live prompt + open slots. Full extractor/action ensure runs on first create
  // or when promptOnly is explicitly false.
  // EXCEPTION: if the live agent has a bloated attachment list (duplicate extractors),
  // force a reconcile even on prompt-only sync — otherwise inbound calls hang after greeting.
  let attachedCount = 0;
  if (modelId) {
    attachedCount = await listAssistantActionIds(modelId)
      .then((ids) => ids.length)
      .catch(() => 0);
  }
  const actionsBloated = attachedCount > 40;
  const promptOnly =
    !actionsBloated &&
    (input?.promptOnly === true ||
      (input?.promptOnly !== false && action === "updated" && actionIds.length > 0));

  if (promptOnly) {
    console.log(
      `[synthflow] Fast prompt sync (skipped action ensure/attach) → ${clinicDoctorName || "clinic"} (${attachedCount} actions attached)`,
    );
  } else {
    try {
      if (actionsBloated) {
        console.warn(
          `[synthflow] Agent has ${attachedCount} attached actions (expected <40) — forcing reconcile so the receptionist can speak after the greeting`,
        );
        warnings.push(
          `Cleared ${attachedCount} duplicate Synthflow tools from the receptionist (they were blocking conversation after the greeting).`,
        );
      }
      // Drop deleted Synthflow actions first so Availability sync does not 404.
      const pruned = await pruneStaleActionIds(actionIds);
      actionIds = pruned.living;
      if (pruned.dropped.length) {
        console.warn(
          `[synthflow] Cleared ${pruned.dropped.length} stale synthflowActionIds from clinic settings`,
        );
      }

      // Do NOT ensure/attach information extractors on the inbound agent — they
      // inflate the tool list, slow the LLM turn, and are not needed mid-call
      // (fields come from custom-action JSON bodies). Keep list stays booking tools only.
      actionIds = await ensureAvailabilityCustomAction(actionIds);
      actionIds = await ensureBookCustomAction(actionIds);
      // Final prune in case create/find returned a bad id.
      actionIds = (await pruneStaleActionIds(actionIds)).living;

      // Keep ONE of each booking tool (+ one of each extractor). Never attach every
      // historical duplicate — that is what produced 1000+ tools on the live agent.
      const keepIds = await buildCanonicalActionKeepList(actionIds);
      actionIds = keepIds;

      try {
        const reconciled = await reconcileAssistantActions(modelId!, keepIds);
        console.log(
          `[synthflow] Action reconcile → before=${reconciled.before} detached=${reconciled.detached} after=${reconciled.after}`,
        );
      } catch (error) {
        warnings.push(
          `Agent saved but reconciling actions failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        try {
          await attachActions(modelId!, keepIds);
        } catch (attachError) {
          warnings.push(
            `Attaching actions also failed: ${attachError instanceof Error ? attachError.message : String(attachError)}`,
          );
        }
      }
    } catch (error) {
      warnings.push(
        `Agent saved but extractors failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  await prisma.clinicVoiceSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      phoneNumber: phone || settings.phoneNumber,
      synthflowAgentId: modelId,
      synthflowActionIds: actionIds,
      agentLanguage: input?.language || settings.agentLanguage || "en",
      agentVoiceId: voiceId || settings.agentVoiceId,
      agentFirstMessage: greeting,
      // Store the compact live prompt that was actually pushed to Synthflow.
      agentSystemPrompt: fullPrompt,
      voiceProvider: "synthflow",
      synthflowSyncedAt: new Date(),
    },
  });

  return {
    success: true,
    action,
    synthflowAgentId: modelId,
    phoneNumber: phone || null,
    doctorsCount,
    clinicDoctorName: clinicDoctorName ?? null,
    clinicDoctorId: clinicDoctorId ?? null,
    openSlotsSummary,
    webhookUrls: urls,
    warning: warnings.length ? warnings.join(" ") : null,
    settings: await getClinicVoiceSettings(),
  };
}

export async function syncClinicDirectoryToSynthflow(opts?: { promptOnly?: boolean }) {
  const settings = await getOrCreateSettings();
  if (!settings.synthflowAgentId) {
    throw new AppError(400, "Create a Synthflow agent first");
  }
  // Do not pass the previous full prompt (it may still name an old doctor).
  // createOrUpdateClinicSynthflowAgent reloads agent-prompt.md + live Clinic doctor.
  // Never reuse a stored systemPrompt — it can keep yesterday's open slots.
  // Default promptOnly=true so Sync buttons stay fast (prompt + open slots only).
  return createOrUpdateClinicSynthflowAgent({
    firstMessage: settings.agentFirstMessage,
    phoneNumber: settings.phoneNumber,
    language: settings.agentLanguage,
    voiceId: settings.agentVoiceId,
    synthflowAgentId: settings.synthflowAgentId,
    promptOnly: opts?.promptOnly !== false,
  });
}

/**
 * Push the live clinic doctor + open slots into the Synthflow system prompt.
 * Used after Availability / profile changes so the phone agent stays current.
 */
export async function syncPromptAfterAvailabilityChange(reason: string): Promise<{
  synced: boolean;
  openSlotsSummary: string | null;
  warning: string | null;
}> {
  const settings = await getOrCreateSettings();
  if (!settings.synthflowAgentId) {
    console.warn(`[synthflow] Skip prompt sync (${reason}) — no Synthflow agent yet.`);
    return { synced: false, openSlotsSummary: null, warning: "Create a Synthflow agent first." };
  }
  try {
    const result = await syncClinicDirectoryToSynthflow();
    console.log(`[synthflow] Prompt synced after ${reason}`);
    return {
      synced: true,
      openSlotsSummary: result.openSlotsSummary ?? null,
      warning: result.warning,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[synthflow] auto prompt sync failed (${reason}):`, message);
    return { synced: false, openSlotsSummary: null, warning: message };
  }
}

export function queueDirectorySync(reason: string) {
  void syncPromptAfterAvailabilityChange(reason);
}

export async function resolveBootAgentId() {
  const settings = await prisma.clinicVoiceSettings.findUnique({ where: { id: SETTINGS_ID } });
  return settings?.synthflowAgentId || env.SYNTHFLOW_AGENT_ID || null;
}

const testCallCooldownMs = 120_000;
const recentTestCalls = new Map<string, { at: number; callId: string }>();

/** Synthflow call_status values that mean "not dialed / not answered yet". */
const TEST_CALL_PENDING_STATUSES = new Set(["queue", "queued", "pending", "registered", "initiated"]);

async function ensureClinicOutboundTestAgent(input: {
  clinicName: string;
  fromPhone: string;
  greeting: string;
  prompt: string;
  language: string;
  voiceId?: string;
}): Promise<string> {
  const agentName = `${input.clinicName} Outbound Test`.slice(0, 80);
  const listed = await listAssistants({ limit: 50 });
  const listResp =
    ((listed as { response?: Record<string, unknown> }).response as Record<string, unknown> | undefined) ??
    (listed as Record<string, unknown>);
  const rows = (listResp.assistants as Record<string, unknown>[] | undefined) ?? [];
  const fromDigits = input.fromPhone.replace(/\D/g, "");
  const outboundRows: Array<{
    id: string;
    name: string;
    phone: string;
    poolHasFrom: boolean;
  }> = [];

  for (const row of rows) {
    if (String(row.type || "").toLowerCase() !== "outbound") continue;
    const id = String(row.model_id || row.id || "").trim();
    if (!id) continue;
    const name = String(row.name || "");
    const phone = normalizePhone(String(row.phone_number || ""));
    const attached = Array.isArray(row.attached_phone_numbers)
      ? (row.attached_phone_numbers as Record<string, unknown>[])
      : [];
    const poolHasFrom = attached.some((item) => {
      const number = normalizePhone(String(item.number || ""));
      return number === input.fromPhone || number.replace(/\D/g, "") === fromDigits;
    });
    outboundRows.push({ id, name, phone, poolHasFrom });
  }

  const existingId =
    outboundRows.find((row) => row.name === agentName)?.id ||
    outboundRows.find((row) => row.phone === input.fromPhone || row.poolHasFrom)?.id ||
    null;
  const agentConfig: Record<string, unknown> = {
    prompt: input.prompt,
    greeting_message: input.greeting,
    greeting_message_mode: "agent_static",
    llm: "gpt-4.1-mini",
    language: input.language,
    voice_speed: 1.0,
    patience_level: "medium",
    allowed_idle_time_seconds: 90,
    send_user_idle_reminders: true,
    reminder_after_idle_time_seconds: 8,
    reminder_after_idle_message:
      "I'm still here. Would you like to book an appointment, or something else?",
    min_words_to_interrupt: 3,
    transcriber_provider: "deepgram-nova-3",
    transcriber_speech_recognition: "high_accuracy",
    noise_cancellation: "standard",
    suppression_level: 0.2,
    ...(input.voiceId ? { voice_id: input.voiceId } : {}),
  };

  let outboundId = existingId;
  if (!outboundId) {
    const created = await createOutboundAgent({
      name: agentName,
      agent: agentConfig,
    });
    const response = (created as { response?: Record<string, unknown> }).response || {};
    outboundId = String(
      response.model_id ||
        (created as { model_id?: string }).model_id ||
        response.id ||
        (created as { id?: string }).id ||
        "",
    );
    if (!outboundId) {
      throw new AppError(502, `Synthflow did not return an outbound agent id: ${JSON.stringify(created)}`);
    }
    console.log(`[synthflow] Created outbound test agent ${outboundId}`);
  } else {
    await updateAgent(outboundId, { name: agentName, agent: agentConfig });
  }

  const fromSlug = fromDigits;
  for (const row of outboundRows) {
    if (row.id === outboundId) continue;
    if (!row.poolHasFrom && row.phone !== input.fromPhone) continue;
    if (!/probe|temp|test call probe/i.test(row.name)) {
      throw new AppError(
        409,
        `Outbound agent ${row.name} (${row.id}) also has the clinic caller ID. Remove that number from the competing agent before placing test calls.`,
      );
    }

    await synthflowRequest(
      "DELETE",
      `/assistants/${encodeURIComponent(row.id)}/phone_numbers/${encodeURIComponent(fromSlug)}`,
    );
    console.log(
      `[synthflow] Detached clinic caller ID from competing outbound test agent ${row.id} (${row.name})`,
    );
    try {
      await synthflowRequest("DELETE", `/assistants/${encodeURIComponent(row.id)}`);
      console.log(`[synthflow] Deleted competing outbound probe ${row.id} (${row.name})`);
    } catch (error) {
      console.warn(
        `[synthflow] Could not delete detached outbound probe ${row.id}:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  await attachAssistantPhoneNumbers(outboundId, [input.fromPhone]);
  console.log(
    `[synthflow] Outbound test agent ready ${outboundId} with from_phone ${input.fromPhone}`,
  );
  return outboundId;
}

/**
 * Live Synthflow custom actions hit PUBLIC_API_URL, not localhost.
 * Returns why the tunnel cannot serve check_doctor_availability (the test call
 * then answers from a dial-time DB snapshot), or null when it is healthy.
 */
async function checkPublicAvailabilityReachable(): Promise<string | null> {
  const publicRoot = env.PUBLIC_API_URL.replace(/\/$/, "");
  if (!publicRoot || publicRoot.includes("localhost") || publicRoot.includes("127.0.0.1")) {
    return "PUBLIC_API_URL is not a public HTTPS tunnel, so Synthflow cannot reach this database mid-call.";
  }

  try {
    const res = await fetch(synthflowWebhookUrls().availabilityAction, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
        "bypass-tunnel-reminder": "true",
      },
      body: JSON.stringify({ date: "today" }),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return `check_doctor_availability via ${publicRoot} failed (HTTP ${res.status}: ${text.slice(0, 80)}).`;
    }
    const json = JSON.parse(text) as { success?: boolean; message?: string };
    if (json.success === false) {
      return `check_doctor_availability returned failure: ${String(json.message || text).slice(0, 120)}`;
    }
    return null;
  } catch (error) {
    return `PUBLIC_API_URL ${publicRoot} unreachable (${error instanceof Error ? error.message : error}).`;
  }
}

/**
 * Doctor-initiated outbound test call. Uses a dedicated outbound Synthflow agent
 * (inbound agents cannot place ringing outbound dials).
 */
export async function startClinicReceptionistTestCall(input: { phone: string }) {
  if (!isSynthflowConfigured()) {
    throw new AppError(400, "SYNTHFLOW_API_KEY is not configured in backend/.env");
  }

  const settings = await getOrCreateSettings();
  const inboundModelId =
    settings.synthflowAgentId?.trim() || env.SYNTHFLOW_AGENT_ID.trim() || "";
  if (!inboundModelId) {
    throw new AppError(400, "Create / link a Synthflow agent before placing a test call.");
  }

  const toPhone = normalizePhone(input.phone);
  if (!toPhone || toPhone.replace(/\D/g, "").length < 10) {
    throw new AppError(400, "Enter a valid mobile number with country code (e.g. +14155550123).");
  }

  const fromPhone = normalizePhone(
    settings.phoneNumber || env.SYNTHFLOW_PHONE_NUMBER || "",
  );
  if (!fromPhone) {
    throw new AppError(400, "Set the clinic inbound phone number before placing a test call.");
  }
  if (fromPhone === toPhone) {
    throw new AppError(
      400,
      "Enter your personal mobile — not the clinic inbound number. The receptionist will call you from the clinic line.",
    );
  }

  const cooldownKey = `${fromPhone}:${toPhone}`;
  const recent = recentTestCalls.get(cooldownKey);
  if (recent && Date.now() - recent.at < testCallCooldownMs) {
    // If the prior call already finished, allow a new dial sooner.
    const prior = await getPhoneCall(recent.callId).catch(() => null);
    const priorStatus = prior ? readCallStatus(prior) : "";
    const priorLive =
      TEST_CALL_PENDING_STATUSES.has(priorStatus) ||
      ["ringing", "in-progress"].includes(priorStatus);
    if (priorLive || !priorStatus) {
      const waitSec = Math.ceil((testCallCooldownMs - (Date.now() - recent.at)) / 1000);
      throw new AppError(
        429,
        priorLive
          ? `A test call to ${toPhone} is still ${priorStatus || "in progress"} (call ${recent.callId}). Wait for it to finish before retrying.`
          : `A test call to ${toPhone} was just started. Wait ${waitSec}s before retrying (avoids carrier spam blocks).`,
      );
    }
  }

  const clinic = await getClinicDoctor().catch(() => null);
  const doctorName =
    clinic?.user?.fullName?.trim() ||
    (clinic as { name?: string } | null)?.name?.trim() ||
    "the clinic doctor";
  const clinicName = settings.clinicName?.trim() || "the clinic";

  const greeting =
    settings.agentFirstMessage?.trim() ||
    `Thank you for calling ${clinicName}. You've reached the AI receptionist for ${doctorName}. How can I help you today?`;

  // Outbound calls never hit the inbound webhook, so the agent gets no live clinic
  // context. Send the same prompt as the inbound receptionist plus a dial-time
  // snapshot of today's slots and this week's schedule from the local database.
  const tunnelProblem = await checkPublicAvailabilityReachable();
  if (tunnelProblem) {
    console.warn(`[synthflow] Test call availability tools offline: ${tunnelProblem}`);
  }
  const { knowledge } = await buildDoctorsDirectoryKnowledge();
  const availabilityBlock = await buildLiveAvailabilityPromptBlock({
    toolsOnline: !tunnelProblem,
  });
  const prompt = `${synthflowCompactLivePrompt({ clinicName, clinicDoctorBlock: knowledge })}

## Test call
This is a short TEST call started by the clinic doctor (${doctorName}). Follow every rule above.
If they only want a quick check, confirm you can hear them, then ask if they need anything else.

${availabilityBlock}`;

  const outboundModelId = await ensureClinicOutboundTestAgent({
    clinicName,
    fromPhone,
    greeting,
    prompt,
    language: toSynthflowLanguage(settings.agentLanguage || "en"),
    voiceId: settings.agentVoiceId?.trim() || undefined,
  });
  const actionIds = await buildCanonicalActionKeepList(
    normalizeActionIds(settings.synthflowActionIds),
  ).catch(() => [] as string[]);
  if (actionIds.length) {
    await reconcileAssistantActions(outboundModelId, actionIds).catch((error) => {
      console.warn(
        "[synthflow] Could not attach booking actions to outbound test agent:",
        error instanceof Error ? error.message : error,
      );
    });
  }
  if (outboundModelId === inboundModelId) {
    throw new AppError(502, "Outbound test agent resolved to the inbound receptionist id.");
  }

  console.log(
    `[synthflow] Doctor test call → ${toPhone} from ${fromPhone} (outbound agent ${outboundModelId}; inbound ${inboundModelId})`,
  );

  const { callId, raw: startRaw } = await startOutboundVoiceCall({
    modelId: outboundModelId,
    toPhone,
    fromPhone,
    name: "Doctor clinic test",
    greeting,
    prompt,
  });
  console.log(
    `[synthflow] Doctor test call accepted call_id=${callId} raw=${JSON.stringify(startRaw).slice(0, 400)}`,
  );

  recentTestCalls.set(cooldownKey, { at: Date.now(), callId });

  // Wait long enough to distinguish real ringing from Synthflow "paused" ghost calls.
  let status = "queued";
  for (let i = 0; i < 6; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const early = await getPhoneCall(callId).catch(() => null);
    if (!early) continue;
    status = readCallStatus(early);
    console.log(`[synthflow] Doctor test call poll ${i + 1}: status=${status || "?"}`);
    if (status && !TEST_CALL_PENDING_STATUSES.has(status) && status !== "paused") break;
  }

  if (status === "paused") {
    recentTestCalls.delete(cooldownKey);
    const message =
      `Synthflow accepted the call (${callId}) but returned status "paused"; no dial started. ` +
      `Synthflow did not include a provider error message. Check the outbound agent's caller-ID assignment; ` +
      `if it is correct, contact Synthflow support with this call ID.`;
    console.error(
      `[synthflow] Doctor test call failed: ${message} (outbound agent ${outboundModelId})`,
    );
    throw new AppError(502, message);
  }

  let warning: string | null = null;
  if (["spam", "failed", "canceled", "user-canceled", "busy", "no-answer"].includes(status)) {
    recentTestCalls.delete(cooldownKey);
    warning =
      status === "spam"
        ? `Carrier marked the call as spam. Wait 1–2 minutes, then try again.`
        : status === "busy"
          ? `Line was busy. Try again in a moment.`
          : status === "no-answer"
            ? `No answer at ${toPhone}.`
            : `Call ended early with status "${status}".`;
  }

  const toolsWarning = tunnelProblem
    ? `Live tools offline — the agent will read availability from a snapshot taken at dial time, and booking will not work. ${tunnelProblem} Restart the tunnel to localhost:4000 and update PUBLIC_API_URL.`
    : null;

  return {
    success: true as const,
    callId,
    status: status || "queued",
    toPhone,
    fromPhone,
    modelId: outboundModelId,
    inboundModelId,
    warning: [warning, toolsWarning].filter(Boolean).join(" ") || null,
    message: warning
      ? `Call to ${toPhone} ended with status "${status}".`
      : `Calling ${toPhone} from ${fromPhone}. Answer to test the receptionist.`,
  };
}

export async function getClinicReceptionistTestCall(callId: string) {
  const id = callId.trim();
  if (!id) throw new AppError(400, "callId is required");
  if (!isSynthflowConfigured()) {
    throw new AppError(400, "SYNTHFLOW_API_KEY is not configured in backend/.env");
  }

  const payload = await getPhoneCall(id);
  if (!payload) throw new AppError(404, "Call not found");

  const root = payload as Record<string, unknown>;
  const response = (root.response as Record<string, unknown> | undefined) ?? {};
  const fromList = Array.isArray(response.calls)
    ? (response.calls[0] as Record<string, unknown> | undefined)
    : undefined;
  const call =
    (response.call as Record<string, unknown> | undefined) ||
    fromList ||
    root;

  const status = readCallStatus(payload);
  const duration = call.duration ?? call.call_duration ?? null;
  const transcript = String(call.transcript ?? call.transcript_text ?? "").trim();
  const endReason = String(
    call.end_call_reason ?? call.end_reason ?? call.hangup_reason ?? call.termination_reason ?? "",
  ).trim();

  const healthyStatuses = new Set([
    "ringing",
    "in-progress",
    "completed",
  ]);
  // "paused" means Synthflow accepted the request but never dialed. Treat it as
  // a finished failure.
  const terminalFailure = new Set([
    "paused",
    "failed",
    "spam",
    "busy",
    "canceled",
    "user-canceled",
    "no-answer",
    "voicemail",
    "hangup_on_voicemail",
  ]);
  const live = status === "" || TEST_CALL_PENDING_STATUSES.has(status) || status === "ringing" || status === "in-progress";

  return {
    success: true as const,
    callId: id,
    status,
    duration,
    endReason: endReason || null,
    transcriptPreview: transcript.slice(0, 280) || null,
    working: healthyStatuses.has(status),
    finished: terminalFailure.has(status) || !live,
  };
}

/** Non-dialing health check for the doctor clinic page. */
export async function getClinicCallHealth() {
  const settings = await getOrCreateSettings();
  const modelId =
    settings.synthflowAgentId?.trim() || env.SYNTHFLOW_AGENT_ID.trim() || "";
  const publicRoot = env.PUBLIC_API_URL.replace(/\/$/, "");
  const urls = synthflowWebhookUrls();

  let tunnelOk = false;
  let tunnelError: string | null = null;
  try {
    const res = await fetch(`${publicRoot}/api/health`, {
      headers: { "ngrok-skip-browser-warning": "true" },
      signal: AbortSignal.timeout(8_000),
    });
    tunnelOk = res.ok;
    if (!res.ok) tunnelError = `HTTP ${res.status}`;
  } catch (error) {
    tunnelError = error instanceof Error ? error.message : String(error);
  }

  let availabilityOk = false;
  let availabilityPreview: string | null = null;
  let availabilityError: string | null = null;
  try {
    const res = await fetch(urls.availabilityAction, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({ date: "today" }),
      signal: AbortSignal.timeout(12_000),
    });
    const text = await res.text();
    availabilityOk = res.ok;
    if (res.ok) {
      try {
        const json = JSON.parse(text) as { spoken_summary?: string; message?: string };
        availabilityPreview = String(json.spoken_summary || json.message || "").slice(0, 160);
      } catch {
        availabilityPreview = text.slice(0, 160);
      }
    } else {
      availabilityError = `HTTP ${res.status}: ${text.slice(0, 120)}`;
    }
  } catch (error) {
    availabilityError = error instanceof Error ? error.message : String(error);
  }

  let recentCompleted = 0;
  let recentFailed = 0;
  let lastStatus: string | null = null;
  if (modelId && isSynthflowConfigured()) {
    try {
      const callsJson = await synthflowRequest<Record<string, unknown>>(
        "GET",
        `/calls?model_id=${encodeURIComponent(modelId)}&limit=10`,
      );
      const response = (callsJson.response as Record<string, unknown> | undefined) ?? callsJson;
      const calls = (response.calls as Record<string, unknown>[] | undefined) ?? [];
      for (const call of calls) {
        const status = String(call.status ?? call.call_status ?? "").toLowerCase();
        if (!lastStatus) lastStatus = status || null;
        if (status === "completed") recentCompleted += 1;
        if (["failed", "spam", "busy", "hangup_on_voicemail"].includes(status)) recentFailed += 1;
      }
    } catch (error) {
      console.warn(
        "[synthflow] call health list failed:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  const { openSlotsSummary } = await buildDoctorsDirectoryKnowledge().catch(() => ({
    openSlotsSummary: "none",
  }));

  const checks = {
    synthflowConfigured: isSynthflowConfigured(),
    agentLinked: Boolean(modelId),
    clinicPhoneSet: Boolean(normalizePhone(settings.phoneNumber || env.SYNTHFLOW_PHONE_NUMBER)),
    tunnelOk,
    availabilityOk,
    hasOpenSlots: Boolean(openSlotsSummary && openSlotsSummary !== "none"),
  };

  const ok =
    checks.synthflowConfigured &&
    checks.agentLinked &&
    checks.clinicPhoneSet &&
    checks.tunnelOk &&
    checks.availabilityOk;

  return {
    success: true as const,
    ok,
    modelId: modelId || null,
    clinicPhone: normalizePhone(settings.phoneNumber || env.SYNTHFLOW_PHONE_NUMBER) || null,
    openSlotsSummary,
    tunnel: { ok: tunnelOk, url: publicRoot, error: tunnelError },
    availability: {
      ok: availabilityOk,
      preview: availabilityPreview,
      error: availabilityError,
    },
    recentCalls: {
      completed: recentCompleted,
      failed: recentFailed,
      lastStatus,
    },
    checks,
    message: ok
      ? "Call path looks healthy. Place a test call to your mobile to verify the live receptionist."
      : "Call path needs attention — fix the failed checks below before testing.",
  };
}
