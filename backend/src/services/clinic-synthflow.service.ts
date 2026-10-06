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
  createCustomAction,
  createInboundAgent,
  createInformationExtractor,
  findActionIdByName,
  findAssistantByPhone,
  getCustomActionUrl,
  isSynthflowConfigured,
  synthflowRequest,
  toSynthflowLanguage,
  synthflowPromptRulePrefix,
  updateAgent,
  updateCustomActionUrl,
} from "./synthflow.client.js";
import {
  clinicDoctorProfileBlock,
  formatOpenSlotLabels,
  getClinicDoctor,
} from "./clinic-doctor.service.js";
import { generateSlotsFromWeeklyHours } from "./doctor-availability.service.js";
import { formatDoctorDirectoryLine, formatDoctorSpokenBlurb } from "./doctor-profile.service.js";

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
      "What contact phone number did the patient give? If they said same number, use the calling number. Answer none if unknown.",
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
This clinic has one doctor. Introduce that doctor and specialty, offer real open slots, quote the consultation fee, collect name and phone, and confirm with one final summary.

CRITICAL RULES:
- Keep every response to 1-2 short sentences. Ask only one question per turn, then wait.
- Never give medical advice or diagnoses.
- Never invent another doctor, specialty list, or time.
- Appointments are 30 minutes, in clinic.
- One active appointment per mobile: if active_appointment_found is true, tell the caller using active_appointment_block_message and do not book again.
- When asked about the doctor, share specialty, experience, hospital, and fee only.

Use the Clinic doctor profile injected on sync and on each call.`;
}

const CLINIC_DOCTOR_HEADING = "## Clinic doctor";

export function stripOutdatedDoctorLists(prompt: string) {
  let next = prompt.replace(/\r\n/g, "\n");
  // Drop boot-time rule prefixes — Sync re-adds the current one-doctor versions.
  next = next.replace(
    /^(BOOKING OTP RULE:|AVAILABILITY SPEAK RULE:|PHONE APPOINTMENT RULE)[\s\S]*?(?=\nYou are |\nPRIMARY MISSION:)/,
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
  let doctor = await getClinicDoctor({ openSlotsTake: 8 });
  if (!doctor) {
    return {
      doctorsCount: 0,
      knowledge: [
        `${CLINIC_DOCTOR_HEADING} (source of truth)`,
        "No active doctor profile is configured in the Doctor Dashboard yet.",
        "Do not invent a doctor. Ask the caller to try again after the clinic finishes setup.",
      ].join("\n"),
    };
  }

  // Weekly hours alone are not enough — auto-materialize open slots so the agent has real times.
  if (doctor.availability.length === 0 && doctor.weeklyHours != null) {
    await generateSlotsFromWeeklyHours(doctor.userId, { weeks: 2, allowEmpty: true });
    doctor = (await getClinicDoctor({ openSlotsTake: 8 })) ?? doctor;
  }

  const profile = clinicDoctorProfileBlock(doctor);
  const spoken = formatDoctorSpokenBlurb({
    fullName: profile.doctorName,
    specialty: profile.specialty,
    experienceYears: profile.experienceYears,
    clinic: profile.hospital === "none" ? "" : profile.hospital,
    fee: profile.fee === "none" ? "" : profile.fee,
  });
  const openingLabels = formatOpenSlotLabels(doctor.availability, {
    withIds: false,
    limit: 2,
  });
  const directoryLine = formatDoctorDirectoryLine({
    fullName: profile.doctorName,
    doctorId: profile.doctorId,
    specialty: profile.specialty,
    experienceYears: profile.experienceYears,
    clinic: profile.hospital === "none" ? "" : profile.hospital,
    fee: profile.fee === "none" ? "" : profile.fee,
    weeklyHoursSummary: profile.weeklyHoursSummary,
    nextSlots: profile.openSlots,
  });

  return {
    doctorsCount: 1,
    clinicDoctorName: profile.doctorName,
    clinicDoctorId: profile.doctorId,
    knowledge: [
      `${CLINIC_DOCTOR_HEADING} (source of truth — one doctor only)`,
      "This clinic has exactly ONE doctor. Never mention any other doctor or specialty menu.",
      "IGNORE any older doctor names elsewhere in this prompt if they conflict with this Clinic doctor block.",
      `Doctor name: ${profile.doctorName}`,
      `doctor_id: ${profile.doctorId}`,
      `Specialty: ${profile.specialty || "none"}`,
      `Hospital name: ${profile.hospital}`,
      `Consultation fee: ${profile.fee}`,
      `Years of experience: ${profile.experienceYears}`,
      `Available days and timings: ${profile.weeklyHoursSummary}`,
      `Bookable open slots: ${profile.openSlots}`,
      "",
      "## How to use this profile",
      `- When the caller wants an appointment, introduce ${profile.doctorName} and specialty ${profile.specialty || "the clinic specialty"}, then quote fee ${profile.fee}.`,
      "- Offer ONLY bookable open slots listed above or returned by check_doctor_availability. Never invent a time.",
      "- When the caller asks about the doctor, share specialty, years of experience, hospital, fee, and usual days/timings only. Do not invent bio or credentials.",
      `- Spoken intro: ${spoken.replace(/^- /, "")}`,
      openingLabels.length
        ? `- Next open times to offer first: ${openingLabels.join(", and ")}`
        : "- There are no open bookable slots right now.",
      "",
      "## Compact directory line",
      directoryLine,
    ].join("\n"),
  };
}

function normalizeActionIds(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  return [];
}

async function ensureAppointmentExtractors(existingIds: string[]) {
  if (existingIds.length >= 4) return existingIds;
  const ids: string[] = [...existingIds];
  for (const spec of APPOINTMENT_EXTRACTORS) {
    try {
      const created = await createInformationExtractor(spec);
      if (created.action_id) ids.push(created.action_id);
    } catch (error) {
      console.warn(
        "[synthflow] extractor create failed:",
        spec.identifier,
        error instanceof Error ? error.message : error,
      );
    }
  }
  return [...new Set(ids)];
}

const AVAILABILITY_ACTION_NAME = "check_doctor_availability";

async function ensureAvailabilityCustomAction(existingIds: string[]) {
  const urls = synthflowWebhookUrls();
  let actionId = await findActionIdByName(AVAILABILITY_ACTION_NAME);
  if (actionId) {
    const current = await getCustomActionUrl(actionId).catch(() => null);
    if (current !== urls.availabilityAction) {
      await updateCustomActionUrl(actionId, urls.availabilityAction).catch((error) => {
        console.warn(
          "[synthflow] availability action URL refresh failed:",
          error instanceof Error ? error.message : error,
        );
      });
    }
  }
  if (!actionId) {
    try {
      const created = await createCustomAction({
        name: AVAILABILITY_ACTION_NAME,
        description:
          "Check the clinic doctor's open appointment slots. Call this whenever the caller asks for availability or wants times.",
        url: urls.availabilityAction,
        jsonBody: {
          doctor_name: "<doctor_name>",
          doctor_id: "<doctor_id>",
        },
        variables: [
          {
            name: "doctor_name",
            description: "Clinic doctor name if spoken, otherwise empty",
            example: "Dr. Ahmed Khan",
          },
          {
            name: "doctor_id",
            description: "doctor_id from the Clinic doctor profile if known, otherwise empty",
            example: "cmutnug6e0000t91wz8sug0jy",
          },
        ],
        prompt:
          "Say spoken_summary exactly. Introduce the clinic doctor and specialty, then fee and the next open times. Never invent another doctor or time.",
        messageError: "Let me check the clinic doctor's open times.",
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
          "This does not confirm the appointment. If success is true, do not read otp aloud. Call send_booking_otp with otp and expires_seconds only. The SMS is sent to the phone the caller is calling from. Then ask the caller to read the six digits and call verify_booking_otp. If success is false, speak the response message and do not say the appointment is booked.",
        messageError:
          "Booking could not be completed. If you already have an active appointment, please complete or cancel it first.",
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
}) {
  if (!isSynthflowConfigured()) {
    throw new AppError(400, "SYNTHFLOW_API_KEY is not configured in backend/.env");
  }

  const settings = await getOrCreateSettings();
  const clinicName = settings.clinicName;
  const greeting =
    input?.firstMessage?.trim() ||
    settings.agentFirstMessage.trim() ||
    defaultGreeting(clinicName);
  // Always prefer the one-to-one prompt from agent-prompt.md so Sync refreshes
  // multi-doctor language left in older stored prompts.
  const filePrompt = loadDefaultPromptFromFile();
  const storedPrompt =
    input?.systemPrompt?.trim() ||
    settings.agentSystemPrompt.trim() ||
    "";
  const basePrompt =
    filePrompt ||
    stripOutdatedDoctorLists(storedPrompt) ||
    fallbackPrompt(clinicName);

  const { knowledge, doctorsCount, clinicDoctorName, clinicDoctorId } =
    await buildDoctorsDirectoryKnowledge();
  console.log(
    `[synthflow] Syncing clinic doctor → ${clinicDoctorName || "none"} (${clinicDoctorId || "n/a"})`,
  );
  const bodyPrompt = mergeDirectoryIntoPrompt(
    stripOutdatedDoctorLists(basePrompt) || filePrompt || fallbackPrompt(clinicName),
    knowledge,
  );
  // Always push OTP/availability/phone rules with the one-doctor body so Fine-tuner
  // never keeps an old multi-doctor prompt that only had rules prepended on boot.
  const fullPrompt = `${synthflowPromptRulePrefix()}\n\n${bodyPrompt}`;

  const phone = normalizePhone(
    input?.phoneNumber || settings.phoneNumber || env.SYNTHFLOW_PHONE_NUMBER || "",
  );
  const urls = synthflowWebhookUrls();
  const lang = toSynthflowLanguage(input?.language || settings.agentLanguage || "en");
  const voiceId = (input?.voiceId || settings.agentVoiceId || "").trim() || undefined;

  const agentConfig = {
    prompt: fullPrompt,
    greeting_message: greeting,
    llm: "gpt-4.1-Mini",
    language: lang,
    ...(voiceId ? { voice_id: voiceId } : {}),
  };

  const agentPayload: Record<string, unknown> = {
    name: `${clinicName} Receptionist`,
    ...(phone ? { phone_number: phone } : {}),
    inbound_call_webhook_url: urls.inbound,
    external_webhook_url: urls.data,
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
  try {
    actionIds = await ensureAppointmentExtractors(actionIds);
    actionIds = await ensureAvailabilityCustomAction(actionIds);
    actionIds = await ensureBookCustomAction(actionIds);
    try {
      await attachActions(modelId, actionIds);
    } catch (error) {
      warnings.push(
        `Agent saved but attaching extractors failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  } catch (error) {
    warnings.push(
      `Agent saved but extractors failed: ${error instanceof Error ? error.message : String(error)}`,
    );
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
    webhookUrls: urls,
    warning: warnings.length ? warnings.join(" ") : null,
    settings: await getClinicVoiceSettings(),
  };
}

export async function syncClinicDirectoryToSynthflow() {
  const settings = await getOrCreateSettings();
  if (!settings.synthflowAgentId) {
    throw new AppError(400, "Create a Synthflow agent first");
  }
  // Do not pass the previous full prompt (it may still name an old doctor).
  // createOrUpdateClinicSynthflowAgent reloads agent-prompt.md + live Clinic doctor.
  return createOrUpdateClinicSynthflowAgent({
    firstMessage: settings.agentFirstMessage,
    phoneNumber: settings.phoneNumber,
    language: settings.agentLanguage,
    voiceId: settings.agentVoiceId,
    synthflowAgentId: settings.synthflowAgentId,
  });
}

export function queueDirectorySync(reason: string) {
  void syncClinicDirectoryToSynthflow().catch((error) => {
    console.warn(
      "[synthflow] auto directory sync failed:",
      reason,
      error instanceof Error ? error.message : error,
    );
  });
}

export async function resolveBootAgentId() {
  const settings = await prisma.clinicVoiceSettings.findUnique({ where: { id: SETTINGS_ID } });
  return settings?.synthflowAgentId || env.SYNTHFLOW_AGENT_ID || null;
}
