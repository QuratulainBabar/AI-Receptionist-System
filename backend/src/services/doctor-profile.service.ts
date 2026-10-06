import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  CONSULTATION_TYPES,
  defaultWeeklyHours,
  formatWeeklyHoursSummary,
  parseWeeklyHours,
  splitListInput,
  type WeeklyHourSlot,
} from "../utils/doctor-profile.js";
import { clinicTimeZone } from "../utils/clinic-time.js";

const UNSPECIFIED_SPECIALTY_ID = "unspecified";

export type DoctorProfileDto = {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  reference: string;
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
  consultationType: string;
  languages: string[];
  location: string;
  weeklyHours: WeeklyHourSlot[];
  weeklyHoursSummary: string;
  timezone: string;
  rating: number;
  reviews: number;
  isVerified: boolean;
  verifiedAt: string | null;
  verificationNote: string;
};

export type UpdateDoctorProfileInput = {
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
  consultationType?: string;
  languages?: string[] | string;
  location?: string;
  weeklyHours?: WeeklyHourSlot[] | unknown;
};

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
  consultationType: string;
  languages: string[];
  location: string;
  timezone?: string;
  weeklyHours: unknown;
  rating: number;
  reviews: number;
  isVerified: boolean;
  verifiedAt: Date | null;
  verificationNote: string;
  user: { fullName: string; email: string; reference: string; isActive: boolean };
  specialty: { name: string };
}): DoctorProfileDto {
  const weeklyHours = parseWeeklyHours(profile.weeklyHours);
  return {
    id: profile.id,
    userId: profile.userId,
    fullName: profile.user.fullName,
    email: profile.user.email,
    reference: profile.user.reference,
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
    consultationType: profile.consultationType,
    languages: profile.languages,
    location: profile.location,
    weeklyHours,
    weeklyHoursSummary: formatWeeklyHoursSummary(weeklyHours),
    timezone: clinicTimeZone(),
    rating: profile.rating,
    reviews: profile.reviews,
    isVerified: profile.isVerified,
    verifiedAt: profile.verifiedAt?.toISOString() ?? null,
    verificationNote: profile.verificationNote || "",
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
      about: "",
      qualifications: [],
      certifications: [],
      areasOfExpertise: [],
      languages: [],
      location: "",
      subSpecialty: "",
      timezone: clinicTimeZone(),
      weeklyHours: defaultWeeklyHours() as unknown as Prisma.InputJsonValue,
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

  const weeklyHours =
    input.weeklyHours === undefined ? undefined : parseWeeklyHours(input.weeklyHours);

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
    ...(consultationType ? { consultationType } : {}),
    ...(input.languages !== undefined ? { languages: splitListInput(input.languages) } : {}),
    ...(input.location !== undefined ? { location: String(input.location).trim() } : {}),
    timezone: clinicTimeZone(),
    ...(weeklyHours !== undefined
      ? { weeklyHours: weeklyHours as unknown as Prisma.InputJsonValue }
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

/** Format one doctor for Synthflow directory / inbound context. */
export function formatDoctorDirectoryLine(input: {
  fullName: string;
  doctorId: string;
  specialty: string;
  experienceYears?: number;
  clinic: string;
  fee: string;
  weeklyHoursSummary?: string;
  nextSlots?: string;
  /** @deprecated unused — kept for call-site compatibility */
  subSpecialty?: string;
  qualifications?: string[];
  certifications?: string[];
  about?: string;
  areasOfExpertise?: string[];
  consultationType?: string;
  languages?: string[];
  location?: string;
}) {
  return [
    `Doctor: ${input.fullName}`,
    `doctor_id: ${input.doctorId}`,
    `specialty: ${input.specialty}`,
    `experience_years: ${input.experienceYears ?? 0}`,
    `hospital: ${input.clinic}`,
    `consultation_fee: ${input.fee}`,
    `available_days_timings: ${input.weeklyHoursSummary || "see next_slots"}`,
    `next_slots: ${input.nextSlots || "none"}`,
  ].join(" | ");
}

/** Short spoken profile the phone agent should read when a doctor is discussed. */
export function formatDoctorSpokenBlurb(input: {
  fullName: string;
  specialty: string;
  experienceYears?: number;
  clinic?: string;
  fee?: string;
  /** @deprecated unused — kept for call-site compatibility */
  qualifications?: string[];
  certifications?: string[];
  about?: string;
  languages?: string[];
}) {
  const lead = [
    `${input.fullName} is a ${input.specialty}`,
    input.experienceYears ? `with ${input.experienceYears} years of experience` : "",
  ]
    .filter(Boolean)
    .join(" ");
  const parts = [
    lead,
    input.clinic?.trim() ? `Hospital: ${input.clinic.trim()}` : "",
    input.fee?.trim() ? `Fee ${input.fee.trim()}` : "",
  ].filter(Boolean);
  return `- ${parts.join(". ")}.`;
}
