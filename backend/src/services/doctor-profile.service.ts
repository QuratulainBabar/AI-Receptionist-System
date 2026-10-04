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
  rating: number;
  reviews: number;
  isVerified: boolean;
  verifiedAt: string | null;
  verificationNote: string;
};

export type UpdateDoctorProfileInput = {
  specialtyId?: string;
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
    specialty: profile.specialty.name,
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
    rating: profile.rating,
    reviews: profile.reviews,
    isVerified: profile.isVerified,
    verifiedAt: profile.verifiedAt?.toISOString() ?? null,
    verificationNote: profile.verificationNote || "",
  };
}

export { toDto as toDoctorProfileDto };

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

  const specialty =
    (await prisma.specialty.findUnique({ where: { id: "general" } })) ||
    (await prisma.specialty.findFirst({ orderBy: { sortOrder: "asc" } }));
  if (!specialty) {
    throw new AppError(400, "No specialties are configured. Seed specialties first.");
  }

  return prisma.doctorProfile.create({
    data: {
      userId,
      specialtyId: specialty.id,
      experienceYears: 0,
      clinic: "",
      fee: "",
      about: "",
      languages: ["English"],
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

  const specialtyId = input.specialtyId?.trim();
  if (specialtyId) {
    const specialty = await prisma.specialty.findUnique({ where: { id: specialtyId } });
    if (!specialty) {
      throw new AppError(400, "Selected specialty was not found");
    }
  }

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
  subSpecialty?: string;
  qualifications?: string[];
  certifications?: string[];
  experienceYears?: number;
  about?: string;
  areasOfExpertise?: string[];
  clinic: string;
  fee: string;
  consultationType?: string;
  languages?: string[];
  location?: string;
  weeklyHoursSummary?: string;
  nextSlots?: string;
}) {
  return [
    `Doctor: ${input.fullName}`,
    `doctor_id: ${input.doctorId}`,
    `specialty: ${input.specialty}`,
    `sub_specialty: ${input.subSpecialty?.trim() || "none"}`,
    `qualifications: ${(input.qualifications || []).join(", ") || "none"}`,
    `certifications: ${(input.certifications || []).join(", ") || "none"}`,
    `experience_years: ${input.experienceYears ?? 0}`,
    `professional_bio: ${input.about?.trim() || "none"}`,
    `areas_of_expertise: ${(input.areasOfExpertise || []).join(", ") || "none"}`,
    `hospital: ${input.clinic}`,
    `consultation_fee: ${input.fee}`,
    `consultation_type: ${input.consultationType || "In clinic"}`,
    `languages: ${(input.languages || []).join(", ") || "English"}`,
    `location: ${input.location?.trim() || "none"}`,
    `available_days_timings: ${input.weeklyHoursSummary || "see next_slots"}`,
    `next_slots: ${input.nextSlots || "none"}`,
  ].join(" | ");
}
