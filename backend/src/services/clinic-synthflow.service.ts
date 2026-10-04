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
  isSynthflowConfigured,
  toSynthflowLanguage,
  updateAgent,
} from "./synthflow.client.js";
import { formatDoctorDirectoryLine } from "./doctor-profile.service.js";
import { formatWeeklyHoursSummary, parseWeeklyHours } from "../utils/doctor-profile.js";

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
    description: "What is the doctor_id if mentioned? Answer none if not mentioned.",
    examples: ["cmu16ksa00001vgis6s1oq1m9", "none"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "doctor_name",
    description: "Which doctor did the patient book with? Answer none if no doctor was chosen.",
    examples: ["Dr. Daniel Osei", "none"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "slot_id",
    description: "What is the appointment slot_id if mentioned? Answer none if not mentioned.",
    examples: ["cmu2awlf40008vgfsoulh0ck4", "none"],
  },
  {
    kind: "OPEN_QUESTION" as const,
    identifier: "specialty",
    description: "Which specialty did the patient need? Answer none if unclear.",
    examples: ["Cardiology", "Dermatology", "none"],
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
Help the caller find the right specialty and doctor, book an in-clinic appointment, state the consultation fee, collect name and phone, and confirm with one final summary.

CRITICAL RULES:
- Keep every response to 1-2 short sentences. Ask only one question per turn, then wait.
- Never give medical advice or diagnoses.
- Quote exact doctor fees from the clinic directory.
- Appointments are 30 minutes, in clinic.
- Share detailed doctor profile information (bio, qualifications, certifications, expertise, hospital, location, languages, weekly hours) ONLY when the caller specifically asks about that doctor. For booking, use specialty, doctor name, fee, consultation type, and available slots unless more detail is requested.

Use the live doctors directory injected for this call when available.`;
}

const DIRECTORY_HEADING = "## Live doctor directory";
const ROSTER_HEADING = "## Current roster";

export function stripOutdatedDoctorLists(prompt: string) {
  let next = prompt.replace(/\r\n/g, "\n");
  next = next.replace(/\n## Specialties[\s\S]*?(?=\n## Fast Booking Protocol|\n## Current roster|\n## Live doctor directory|$)/, "\n");
  next = next.replace(/\n## Doctors \(quote exact fee\)[\s\S]*?(?=\n## Fast Booking Protocol|\n## Current roster|\n## Live doctor directory|$)/, "\n");
  next = next.replace(
    /\n## (Availability answers|Live openings|Current roster|Live doctor directory)[\s\S]*$/,
    "",
  );
  next = next.replace(/^\s*- (Cardiology|Dermatology|Neurology|Pediatrics|Orthopedics|General Medicine): ONLY .+$/gm, "");
  next = next.replace(
    /If caller asks generally "What specialties do you have\?", say: "We offer .+ Which one do you need\?"/,
    "If caller asks generally what specialties you have, list ONLY specialties from the Current roster, then ask which one they need.",
  );
  return next.replace(/\n{3,}/g, "\n\n").trim();
}

export function mergeDirectoryIntoPrompt(basePrompt: string, knowledge: string) {
  const cleaned = stripOutdatedDoctorLists(basePrompt);
  return `${cleaned}\n\n${knowledge}`;
}

export async function buildDoctorsDirectoryKnowledge() {
  const now = new Date();
  const doctors = await prisma.doctorProfile.findMany({
    where: { user: { isActive: true, role: "DOCTOR" } },
    include: {
      user: true,
      specialty: true,
      availability: {
        where: { isBooked: false, startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        take: 4,
      },
    },
    orderBy: { user: { fullName: "asc" } },
    take: 100,
  });

  const bySpecialty = new Map<string, string[]>();
  for (const doctor of doctors) {
    const specialtyName = doctor.specialty.name;
    const names = bySpecialty.get(specialtyName) ?? [];
    names.push(doctor.user.fullName);
    bySpecialty.set(specialtyName, names);
  }
  const rosterLines = [...bySpecialty.entries()].map(
    ([specialty, names]) => `- ${specialty}: ${names.join(", ")}`,
  );
  const specialtyNames = [...bySpecialty.keys()];

  const openingLines: string[] = [];
  const lines = doctors.map((doctor) => {
    const slotLabels = doctor.availability
      .map((slot) => {
        const when = slot.startsAt.toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        return `${when} [slot:${slot.id}]`;
      });
    const slots = slotLabels.join("; ");
    openingLines.push(
      doctor.availability.length
        ? `${doctor.user.fullName} (${doctor.specialty.name}, ${doctor.fee}): AVAILABLE — ${slotLabels.slice(0, 2).join("; ")}`
        : `${doctor.user.fullName} (${doctor.specialty.name}): no open slots right now`,
    );

    const weeklyHoursSummary = formatWeeklyHoursSummary(parseWeeklyHours(doctor.weeklyHours));

    return formatDoctorDirectoryLine({
      fullName: doctor.user.fullName,
      doctorId: doctor.userId,
      specialty: doctor.specialty.name,
      subSpecialty: doctor.subSpecialty,
      qualifications: doctor.qualifications,
      certifications: doctor.certifications,
      experienceYears: doctor.experienceYears,
      about: doctor.about,
      areasOfExpertise: doctor.areasOfExpertise,
      clinic: doctor.clinic,
      fee: doctor.fee,
      consultationType: doctor.consultationType,
      languages: doctor.languages,
      location: doctor.location,
      weeklyHoursSummary,
      nextSlots: slots || "none",
    });
  });

  return {
    doctorsCount: doctors.length,
    knowledge: [
      "## Availability answers (mandatory)",
      "You CAN check availability. Use Live openings below. NEVER say you cannot check availability or calendars.",
      "If asked whether a doctor is available, answer yes/no, quote the next 1-2 times and fee, then ask if they want to book.",
      "",
      "## Live openings",
      openingLines.join("\n") || "No open slots.",
      "",
      `${ROSTER_HEADING} (source of truth — ignore any older doctor names above)`,
      `Specialties now available: ${specialtyNames.join(", ") || "none"}.`,
      "List ONLY these doctors for each specialty:",
      rosterLines.join("\n") || "- none",
      "",
      `${DIRECTORY_HEADING} (active profiles)`,
      "Use doctor_id / slot_id and exact consultation_fee when booking.",
      "Share bio, qualifications, certifications, expertise, hospital, location, languages, and weekly hours ONLY if the caller asks about that doctor.",
      "For booking, prefer specialty, doctor name, fee, consultation type, and next_slots unless more detail is requested.",
      lines.join("\n") || "No doctors currently available.",
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
  if (!actionId) {
    try {
      const created = await createCustomAction({
        name: AVAILABILITY_ACTION_NAME,
        description:
          "Check whether a named doctor has open appointment slots. Call this whenever the caller asks if a doctor is available or wants times.",
        url: urls.availabilityAction,
        jsonBody: {
          doctor_name: "<doctor_name>",
          doctor_id: "<doctor_id>",
          specialty: "<specialty>",
        },
        variables: [
          {
            name: "doctor_name",
            description: "Doctor the caller asked about, for example Dr. Qurat ul Ain",
            example: "Dr. Qurat ul Ain",
          },
          {
            name: "doctor_id",
            description: "doctor_id from the live directory if known, otherwise empty",
            example: "cmutnug6e0000t91wz8sug0jy",
          },
          {
            name: "specialty",
            description: "Specialty if mentioned, otherwise empty",
            example: "General Physician",
          },
        ],
        prompt:
          "Use spoken_summary from the response. Speak the next 1-2 times and fee. Never say you cannot check availability.",
        messageError: "I can still see openings in our clinic directory. Let me share the next times.",
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
  if (!actionId) {
    try {
      const created = await createCustomAction({
        name: BOOK_ACTION_NAME,
        description:
          "Create the clinic appointment after the caller confirms a doctor and time. Always send doctor_name plus slot_id from Live openings when possible.",
        url: urls.bookAction,
        jsonBody: {
          doctor_name: "<doctor_name>",
          doctor_id: "<doctor_id>",
          slot_id: "<slot_id>",
          patient_name: "<patient_name>",
          phone: "<phone>",
          reason: "<reason>",
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
          "If success is true, confirm the appointment reference. If it failed, apologize and offer another slot_id from Live openings.",
        messageError: "I could not save that booking yet. Let me offer another open time.",
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
  const { doctorsCount } = await buildDoctorsDirectoryKnowledge();
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
  const basePrompt =
    input?.systemPrompt?.trim() ||
    settings.agentSystemPrompt.trim() ||
    loadDefaultPromptFromFile() ||
    fallbackPrompt(clinicName);

  const { knowledge, doctorsCount } = await buildDoctorsDirectoryKnowledge();
  const fullPrompt = mergeDirectoryIntoPrompt(
    stripOutdatedDoctorLists(basePrompt) || loadDefaultPromptFromFile() || fallbackPrompt(clinicName),
    knowledge,
  );

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
  return createOrUpdateClinicSynthflowAgent({
    firstMessage: settings.agentFirstMessage,
    systemPrompt: settings.agentSystemPrompt,
    phoneNumber: settings.phoneNumber,
    language: settings.agentLanguage,
    voiceId: settings.agentVoiceId,
    synthflowAgentId: settings.synthflowAgentId,
  });
}

export async function resolveBootAgentId() {
  const settings = await prisma.clinicVoiceSettings.findUnique({ where: { id: SETTINGS_ID } });
  return settings?.synthflowAgentId || env.SYNTHFLOW_AGENT_ID || null;
}
