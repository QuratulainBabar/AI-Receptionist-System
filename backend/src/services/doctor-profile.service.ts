import fs from "node:fs";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  CONSULTATION_TYPES,
  defaultAvailabilityConfig,
  formatWeeklyHoursSummary,
  parseAvailabilityConfig,
  toStoredAvailabilityConfig,
  splitListInput,
  type AvailabilityConfig,
  type WeeklyHourSlot,
} from "../utils/doctor-profile.js";
import { clinicTimeZone } from "../utils/clinic-time.js";
import { normalizePhone } from "../utils/phone.js";

const UNSPECIFIED_SPECIALTY_ID = "unspecified";
const PHOTO_UPLOAD_ROOT = path.resolve(process.cwd(), "uploads", "doctor-photos");
const FEE_CURRENCIES = ["USD", "PKR", "EUR", "GBP", "AED", "INR", "CAD", "AUD"] as const;

export type DoctorProfileDto = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  reference: string;
  isActive: boolean;
  phone: string;
  photoUrl: string;
  specialtyId: string;
  specialty: string;
  subSpecialty: string;
  qualifications: string[];
  certifications: string[];
  experienceYears: number;
  about: string;
  areasOfExpertise: string[];
  clinic: string;
  fee: string;
  feeCurrency: string;
  consultationType: string;
  consultationServices: string[];
  languages: string[];
  location: string;
  weeklyHours: WeeklyHourSlot[];
  weeklyHoursSummary: string;
  availabilityConfig: AvailabilityConfig;
  timezone: string;
  rating: number;
  reviews: number;
  isVerified: boolean;
  verifiedAt: string | null;
  verificationNote: string;
  updatedAt: string;
};

export type UpdateDoctorProfileInput = {
  fullName?: string;
  phone?: string;
  specialtyId?: string;
  /** Free-text specialty for one-to-one clinics (creates/finds Specialty by name). */
  specialty?: string;
  subSpecialty?: string;
  qualifications?: string[] | string;
  certifications?: string[] | string;
  experienceYears?: number;
  about?: string;
  areasOfExpertise?: string[] | string;
  clinic?: string;
  fee?: string;
  feeCurrency?: string;
  consultationType?: string;
  consultationServices?: string[] | string;
  languages?: string[] | string;
  location?: string;
  weeklyHours?: WeeklyHourSlot[] | unknown;
  availabilityConfig?: AvailabilityConfig | unknown;
};

export function getDoctorPhotoUploadRoot() {
  fs.mkdirSync(PHOTO_UPLOAD_ROOT, { recursive: true });
  return PHOTO_UPLOAD_ROOT;
}

function publicPhotoUrl(stored: string) {
  const value = stored.trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) {
    return value;
  }
  return `/uploads/doctor-photos/${value.replace(/^\/+/, "")}`;
}

async function resolveSpecialtyId(input: { specialtyId?: string; specialty?: string }) {
  const specialtyId = input.specialtyId?.trim();
  if (specialtyId) {
    const byId = await prisma.specialty.findUnique({ where: { id: specialtyId } });
    if (!byId) throw new AppError(400, "Selected specialty was not found");
    return byId.id;
  }

  const specialtyName = input.specialty?.trim();
  if (!specialtyName) return undefined;

  const existing = await prisma.specialty.findFirst({
    where: { name: { equals: specialtyName, mode: "insensitive" } },
  });
  if (existing) return existing.id;

  const idBase = specialtyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "specialty";
  let id = idBase;
  let attempt = 0;
  while (await prisma.specialty.findUnique({ where: { id } })) {
    attempt += 1;
    id = `${idBase}-${attempt}`;
  }

  const created = await prisma.specialty.create({
    data: {
      id,
      name: specialtyName,
      description: specialtyName,
      sortOrder: 100,
    },
  });
  return created.id;
}

function toDto(profile: {
  id: string;
  userId: string;
  specialtyId: string;
  subSpecialty: string;
  qualifications: string[];
  certifications: string[];
  experienceYears: number;
  about: string;
  areasOfExpertise: string[];
  clinic: string;
  fee: string;
  feeCurrency?: string;
  consultationType: string;
  consultationServices?: string[];
  phone?: string;
  photoUrl?: string;
  languages: string[];
  location: string;
  timezone?: string;
  weeklyHours: unknown;
  rating: number;
  reviews: number;
  isVerified: boolean;
  verifiedAt: Date | null;
  verificationNote: string;
  updatedAt?: Date;
  user: { fullName: string; email: string; reference: string; isActive: boolean };
  specialty: { name: string };
}): DoctorProfileDto {
  const availabilityConfig = parseAvailabilityConfig(profile.weeklyHours);
  const weeklyHours = availabilityConfig.days;
  return {
    id: profile.id,
    userId: profile.userId,
    fullName: profile.user.fullName,
    email: profile.user.email,
    reference: profile.user.reference,
    isActive: profile.user.isActive,
    phone: profile.phone || "",
    photoUrl: publicPhotoUrl(profile.photoUrl || ""),
    specialtyId: profile.specialtyId,
    specialty:
      profile.specialtyId === UNSPECIFIED_SPECIALTY_ID || !profile.specialty.name.trim()
        ? ""
        : profile.specialty.name,
    subSpecialty: profile.subSpecialty,
    qualifications: profile.qualifications,
    certifications: profile.certifications,
    experienceYears: profile.experienceYears,
    about: profile.about,
    areasOfExpertise: profile.areasOfExpertise,
    clinic: profile.clinic,
    fee: profile.fee,
    feeCurrency: (profile.feeCurrency || "USD").toUpperCase(),
    consultationType: profile.consultationType,
    consultationServices: profile.consultationServices || [],
    languages: profile.languages,
    location: profile.location,
    weeklyHours,
    weeklyHoursSummary: formatWeeklyHoursSummary(weeklyHours),
    availabilityConfig,
    timezone: clinicTimeZone(),
    rating: profile.rating,
    reviews: profile.reviews,
    isVerified: profile.isVerified,
    verifiedAt: profile.verifiedAt?.toISOString() ?? null,
    verificationNote: profile.verificationNote || "",
    updatedAt: (profile.updatedAt ?? new Date()).toISOString(),
  };
}

export { toDto as toDoctorProfileDto };

async function ensureUnspecifiedSpecialty() {
  return prisma.specialty.upsert({
    where: { id: UNSPECIFIED_SPECIALTY_ID },
    create: {
      id: UNSPECIFIED_SPECIALTY_ID,
      name: "",
      description: "Not set yet",
      sortOrder: 999,
    },
    update: {},
  });
}

export async function alignDoctorTimeZones() {
  const zone = clinicTimeZone();
  const result = await prisma.doctorProfile.updateMany({
    where: { NOT: { timezone: zone } },
    data: { timezone: zone },
  });
  if (result.count > 0) {
    console.log(`[clinic-time] Aligned ${result.count} doctor profile(s) to ${zone}`);
  }
}

export async function ensureDoctorProfileForUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.role !== "DOCTOR") {
    throw new AppError(404, "Doctor not found");
  }

  const existing = await prisma.doctorProfile.findUnique({
    where: { userId },
    include: { user: true, specialty: true },
  });
  if (existing) return existing;

  // New doctors start with an empty profile — only placeholders in the UI.
  await ensureUnspecifiedSpecialty();

  return prisma.doctorProfile.create({
    data: {
      userId,
      specialtyId: UNSPECIFIED_SPECIALTY_ID,
      experienceYears: 0,
      clinic: "",
      fee: "",
      feeCurrency: "USD",
      about: "",
      qualifications: [],
      certifications: [],
      areasOfExpertise: [],
      consultationServices: [],
      languages: [],
      location: "",
      phone: "",
      photoUrl: "",
      subSpecialty: "",
      timezone: clinicTimeZone(),
      weeklyHours: defaultAvailabilityConfig() as unknown as Prisma.InputJsonValue,
    },
    include: { user: true, specialty: true },
  });
}

async function requireDoctorProfile(
  doctorUserId: string,
  options?: { requireActive?: boolean },
) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    include: {
      user: true,
      specialty: true,
    },
  });

  if (!profile || profile.user.role !== "DOCTOR") {
    throw new AppError(404, "Doctor profile not found");
  }
  if (options?.requireActive !== false && !profile.user.isActive) {
    throw new AppError(403, "Only active doctors can manage this profile");
  }

  return profile;
}

export async function getDoctorProfileForDoctor(doctorUserId: string): Promise<DoctorProfileDto> {
  const profile = await requireDoctorProfile(doctorUserId);
  return toDto(profile);
}

export async function updateDoctorProfileForDoctor(
  doctorUserId: string,
  input: UpdateDoctorProfileInput,
  options?: { requireActive?: boolean },
): Promise<DoctorProfileDto> {
  await requireDoctorProfile(doctorUserId, options);

  const specialtyId = await resolveSpecialtyId({
    specialtyId: input.specialtyId,
    specialty: input.specialty,
  });

  const experienceYears =
    input.experienceYears == null
      ? undefined
      : Number.isFinite(Number(input.experienceYears))
        ? Math.max(0, Math.min(80, Math.floor(Number(input.experienceYears))))
        : undefined;

  const consultationType = input.consultationType?.trim();
  if (
    consultationType &&
    !CONSULTATION_TYPES.includes(consultationType as (typeof CONSULTATION_TYPES)[number])
  ) {
    throw new AppError(400, "Consultation type must be In clinic, Video call, or Both");
  }

  let feeCurrency: string | undefined;
  if (input.feeCurrency !== undefined) {
    const code = String(input.feeCurrency).trim().toUpperCase();
    if (!FEE_CURRENCIES.includes(code as (typeof FEE_CURRENCIES)[number])) {
      throw new AppError(400, `Fee currency must be one of: ${FEE_CURRENCIES.join(", ")}`);
    }
    feeCurrency = code;
  }

  const fullName =
    input.fullName !== undefined ? String(input.fullName).trim().replace(/\s+/g, " ") : undefined;
  if (fullName !== undefined && fullName.length < 2) {
    throw new AppError(400, "Full name must be at least 2 characters");
  }

  let phone: string | undefined;
  if (input.phone !== undefined) {
    const raw = String(input.phone).trim();
    phone = raw ? normalizePhone(raw) : "";
    if (raw && phone.replace(/\D/g, "").length < 10) {
      throw new AppError(400, "Enter a valid phone number (at least 10 digits)");
    }
  }

  const availabilityPayload =
    input.availabilityConfig !== undefined
      ? input.availabilityConfig
      : input.weeklyHours !== undefined
        ? input.weeklyHours
        : undefined;
  const availabilityConfig =
    availabilityPayload === undefined
      ? undefined
      : toStoredAvailabilityConfig(availabilityPayload);

  if (availabilityConfig) {
    for (const day of availabilityConfig.days) {
      if (!day.enabled) continue;
      for (const session of day.sessions) {
        if (session.startTime >= session.endTime) {
          throw new AppError(400, `${day.day}: session end must be after start.`);
        }
      }
      for (let i = 0; i < day.sessions.length; i += 1) {
        for (let j = i + 1; j < day.sessions.length; j += 1) {
          const a = day.sessions[i]!;
          const b = day.sessions[j]!;
          const toMin = (t: string) => {
            const [h, m] = t.split(":").map(Number);
            return (h || 0) * 60 + (m || 0);
          };
          if (toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime)) {
            throw new AppError(400, `${day.day}: sessions cannot overlap.`);
          }
        }
      }
    }
  }

  if (fullName !== undefined) {
    await prisma.user.update({
      where: { id: doctorUserId },
      data: { fullName },
    });
  }

  const data: Prisma.DoctorProfileUpdateInput = {
    ...(specialtyId
      ? {
          specialty: {
            connect: { id: specialtyId },
          },
        }
      : {}),
    ...(input.subSpecialty !== undefined ? { subSpecialty: String(input.subSpecialty).trim() } : {}),
    ...(input.qualifications !== undefined
      ? { qualifications: splitListInput(input.qualifications) }
      : {}),
    ...(input.certifications !== undefined
      ? { certifications: splitListInput(input.certifications) }
      : {}),
    ...(experienceYears !== undefined ? { experienceYears } : {}),
    ...(input.about !== undefined ? { about: String(input.about).trim() } : {}),
    ...(input.areasOfExpertise !== undefined
      ? { areasOfExpertise: splitListInput(input.areasOfExpertise) }
      : {}),
    ...(input.clinic !== undefined ? { clinic: String(input.clinic).trim() } : {}),
    ...(input.fee !== undefined ? { fee: String(input.fee).trim() } : {}),
    ...(feeCurrency !== undefined ? { feeCurrency } : {}),
    ...(consultationType ? { consultationType } : {}),
    ...(input.consultationServices !== undefined
      ? { consultationServices: splitListInput(input.consultationServices) }
      : {}),
    ...(phone !== undefined ? { phone } : {}),
    ...(input.languages !== undefined ? { languages: splitListInput(input.languages) } : {}),
    ...(input.location !== undefined ? { location: String(input.location).trim() } : {}),
    timezone: clinicTimeZone(),
    ...(availabilityConfig !== undefined
      ? { weeklyHours: availabilityConfig as unknown as Prisma.InputJsonValue }
      : {}),
  };

  const updated = await prisma.doctorProfile.update({
    where: { userId: doctorUserId },
    data,
    include: {
      user: true,
      specialty: true,
    },
  });

  return toDto(updated);
}

function absolutePhotoPath(stored: string) {
  const value = stored.trim().replace(/^\/uploads\/doctor-photos\//, "");
  if (!value || value.includes("..") || path.isAbsolute(value)) return null;
  return path.join(getDoctorPhotoUploadRoot(), value);
}

export async function updateDoctorPhotoForDoctor(
  doctorUserId: string,
  file: { filename: string; path: string },
): Promise<DoctorProfileDto> {
  const profile = await requireDoctorProfile(doctorUserId);
  const previous = absolutePhotoPath(profile.photoUrl || "");
  const updated = await prisma.doctorProfile.update({
    where: { userId: doctorUserId },
    data: { photoUrl: file.filename },
    include: { user: true, specialty: true },
  });
  if (previous && previous !== file.path) {
    fs.unlink(previous, () => undefined);
  }
  return toDto(updated);
}

export async function removeDoctorPhotoForDoctor(doctorUserId: string): Promise<DoctorProfileDto> {
  const profile = await requireDoctorProfile(doctorUserId);
  const previous = absolutePhotoPath(profile.photoUrl || "");
  const updated = await prisma.doctorProfile.update({
    where: { userId: doctorUserId },
    data: { photoUrl: "" },
    include: { user: true, specialty: true },
  });
  if (previous) fs.unlink(previous, () => undefined);
  return toDto(updated);
}

function joinList(items?: string[]) {
  return (items || []).map((item) => item.trim()).filter(Boolean).join(", ");
}

/** Format one doctor for Synthflow directory / inbound context. */
export function formatDoctorDirectoryLine(input: {
  fullName: string;
  doctorId: string;
  specialty: string;
  experienceYears?: number;
  clinic: string;
  fee: string;
  feeCurrency?: string;
  weeklyHoursSummary?: string;
  nextSlots?: string;
  subSpecialty?: string;
  qualifications?: string[];
  certifications?: string[];
  about?: string;
  areasOfExpertise?: string[];
  consultationType?: string;
  consultationServices?: string[];
  languages?: string[];
  location?: string;
}) {
  const feeLabel =
    input.fee && input.fee !== "none"
      ? `${input.fee}${input.feeCurrency ? ` ${input.feeCurrency}` : ""}`.trim()
      : "none";
  return [
    `Doctor: ${input.fullName}`,
    `doctor_id: ${input.doctorId}`,
    `specialty: ${input.specialty}`,
    `experience_years: ${input.experienceYears ?? 0}`,
    `hospital: ${input.clinic}`,
    `location: ${input.location || "none"}`,
    `consultation_fee: ${feeLabel}`,
    `consultation_type: ${input.consultationType || "none"}`,
    `languages: ${joinList(input.languages) || "none"}`,
    `qualifications: ${joinList(input.qualifications) || "none"}`,
    `certifications: ${joinList(input.certifications) || "none"}`,
    `expertise: ${joinList(input.areasOfExpertise) || "none"}`,
    `services: ${joinList(input.consultationServices) || "none"}`,
    `available_days_timings: ${input.weeklyHoursSummary || "see next_slots"}`,
    `next_slots: ${input.nextSlots || "none"}`,
  ].join(" | ");
}

/** Short spoken profile the phone agent should read once before offering slots. */
export function formatDoctorSpokenBlurb(input: {
  fullName: string;
  specialty: string;
  experienceYears?: number;
  clinic?: string;
  fee?: string;
  feeCurrency?: string;
  qualifications?: string[];
  certifications?: string[];
  about?: string;
  languages?: string[];
  consultationType?: string;
  location?: string;
  areasOfExpertise?: string[];
}) {
  const certs = (input.certifications || []).map((item) => item.trim()).filter(Boolean);
  const bio = input.about?.trim();
  const lead = [
    `${input.fullName} is a ${input.specialty}`,
    input.experienceYears ? `with ${input.experienceYears} years of experience` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const fee =
    input.fee?.trim() && input.fee.trim().toLowerCase() !== "none"
      ? `${input.fee.trim()}${input.feeCurrency ? ` ${input.feeCurrency}` : ""}`.trim()
      : "";
  const parts = [
    lead,
    certs.length ? `Certifications: ${certs.join(", ")}` : "",
    bio || "",
    input.clinic?.trim() ? `Hospital: ${input.clinic.trim()}` : "",
    input.location?.trim() ? `Location: ${input.location.trim()}` : "",
    fee ? `Fee ${fee}` : "",
    input.consultationType?.trim() ? `Consultations: ${input.consultationType.trim()}` : "",
    joinList(input.languages) ? `Languages: ${joinList(input.languages)}` : "",
    joinList(input.qualifications) ? `Qualifications: ${joinList(input.qualifications)}` : "",
    joinList(input.areasOfExpertise) ? `Expertise: ${joinList(input.areasOfExpertise)}` : "",
  ].filter(Boolean);
  return `- ${parts.join(". ")}.`;
}
