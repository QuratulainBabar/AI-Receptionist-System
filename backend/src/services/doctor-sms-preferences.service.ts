import { prisma } from "../lib/prisma.js";
import { ensureDoctorProfileForUser } from "./doctor-profile.service.js";

export type SmsPreferenceKey =
  | "appointmentReminders"
  | "appointmentConfirmations"
  | "invoiceLinks"
  | "recordUploads";

export type SmsPreferences = Record<SmsPreferenceKey, boolean>;

const DEFAULTS: SmsPreferences = {
  appointmentReminders: true,
  appointmentConfirmations: true,
  invoiceLinks: true,
  recordUploads: true,
};

function parsePreferences(value: unknown): SmsPreferences {
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    appointmentReminders: source.appointmentReminders !== false,
    appointmentConfirmations: source.appointmentConfirmations !== false,
    invoiceLinks: source.invoiceLinks !== false,
    recordUploads: source.recordUploads !== false,
  };
}

async function readStoredPreferences(doctorUserId: string) {
  const rows = await prisma.$queryRaw<{ smsPreferences: unknown }[]>`
    SELECT "smsPreferences" FROM "doctor_profiles" WHERE "userId" = ${doctorUserId} LIMIT 1
  `;
  return rows[0]?.smsPreferences ?? null;
}

export async function getDoctorSmsPreferences(doctorUserId: string): Promise<SmsPreferences> {
  await ensureDoctorProfileForUser(doctorUserId);
  return parsePreferences(await readStoredPreferences(doctorUserId));
}

export async function updateDoctorSmsPreferences(
  doctorUserId: string,
  input: Partial<SmsPreferences>,
): Promise<SmsPreferences> {
  const current = await getDoctorSmsPreferences(doctorUserId);
  const next: SmsPreferences = {
    appointmentReminders: input.appointmentReminders ?? current.appointmentReminders,
    appointmentConfirmations: input.appointmentConfirmations ?? current.appointmentConfirmations,
    invoiceLinks: input.invoiceLinks ?? current.invoiceLinks,
    recordUploads: input.recordUploads ?? current.recordUploads,
  };
  await prisma.$executeRawUnsafe(
    `UPDATE "doctor_profiles" SET "smsPreferences" = $1::jsonb WHERE "userId" = $2`,
    JSON.stringify(next),
    doctorUserId,
  );
  return next;
}

/** Missing profile or preference keeps the existing SMS behavior. */
export async function isDoctorSmsEnabled(doctorUserId: string, key: SmsPreferenceKey) {
  const stored = await readStoredPreferences(doctorUserId);
  if (stored == null && !(await profileExists(doctorUserId))) return DEFAULTS[key];
  return parsePreferences(stored)[key];
}

async function profileExists(doctorUserId: string) {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "doctor_profiles" WHERE "userId" = ${doctorUserId} LIMIT 1
  `;
  return rows.length > 0;
}
