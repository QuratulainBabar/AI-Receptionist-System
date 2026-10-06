import type { AvailabilitySlot, DoctorProfile, Specialty, User } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import { formatWeeklyHoursSummary, parseWeeklyHours } from "../utils/doctor-profile.js";
import {
  addCivilDays,
  civilDateKey,
  clinicTimeZone,
  formatClinicTime,
  wallTimeToUtc,
} from "../utils/clinic-time.js";

type DoctorWithRelations = DoctorProfile & {
  user: User;
  specialty: Specialty;
  availability?: AvailabilitySlot[];
};

export type PublicDoctor = {
  id: string;
  name: string;
  speciality: string;
  specialityId: string;
  subSpecialty: string;
  qualifications: string[];
  certifications: string[];
  experience: string;
  experienceYears: number;
  rating: number;
  reviews: number;
  clinic: string;
  fee: string;
  consultationType: string;
  languages: string[];
  about: string;
  areasOfExpertise: string[];
  location: string;
  weeklyHoursSummary: string;
  nextAvailable: string;
};

export type PublicSpecialty = {
  id: string;
  name: string;
  description: string;
  doctors: number;
};

export type PublicAvailabilityDate = {
  id: string;
  label: string;
  month: string;
  slots: number;
};

export type PublicTimeSlot = {
  id: string;
  time: string;
  available: boolean;
  startsAt: string;
};

function formatExperience(years: number) {
  return `${years} ${years === 1 ? "year" : "years"}`;
}

function formatNextAvailable(date: Date | null) {
  if (!date) return "No upcoming slots";

  const now = new Date();
  const todayKey = civilDateKey(now);
  const slotKey = civilDateKey(date);
  const time = formatClinicTime(date);

  if (slotKey === todayKey) return `Today, ${time}`;
  if (slotKey === addCivilDays(todayKey, 1)) return `Tomorrow, ${time}`;

  const weekday = date.toLocaleDateString("en-US", {
    timeZone: clinicTimeZone(),
    weekday: "short",
  });
  return `${weekday}, ${time}`;
}

function toPublicDoctor(profile: DoctorWithRelations, nextSlot: Date | null): PublicDoctor {
  const weeklyHours = parseWeeklyHours(profile.weeklyHours);
  return {
    id: profile.userId,
    name: profile.user.fullName,
    speciality: profile.specialty.name,
    specialityId: profile.specialtyId,
    subSpecialty: profile.subSpecialty || "",
    qualifications: profile.qualifications || [],
    certifications: profile.certifications || [],
    experience: formatExperience(profile.experienceYears),
    experienceYears: profile.experienceYears,
    rating: profile.rating,
    reviews: profile.reviews,
    clinic: profile.clinic,
    fee: profile.fee,
    consultationType: profile.consultationType || "In clinic",
    languages: profile.languages,
    about: profile.about,
    areasOfExpertise: profile.areasOfExpertise || [],
    location: profile.location || "",
    weeklyHoursSummary: formatWeeklyHoursSummary(weeklyHours),
    nextAvailable: formatNextAvailable(nextSlot),
  };
}

async function nextOpenSlotsByDoctorIds(doctorIds: string[]) {
  if (!doctorIds.length) return new Map<string, Date>();

  const now = new Date();
  const slots = await prisma.availabilitySlot.findMany({
    where: {
      doctorId: { in: doctorIds },
      isBooked: false,
      startsAt: { gt: now },
    },
    orderBy: { startsAt: "asc" },
  });

  const map = new Map<string, Date>();
  for (const slot of slots) {
    if (!map.has(slot.doctorId)) {
      map.set(slot.doctorId, slot.startsAt);
    }
  }
  return map;
}

export async function listSpecialties(): Promise<PublicSpecialty[]> {
  const rows = await prisma.specialty.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: {
        select: {
          doctors: {
            where: { user: { isActive: true, role: "DOCTOR" } },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    doctors: row._count.doctors,
  }));
}

export async function listDoctors(input: { q?: string; specialtyId?: string }) {
  const q = input.q?.trim();
  const profiles = await prisma.doctorProfile.findMany({
    where: {
      user: { role: "DOCTOR", isActive: true },
      ...(input.specialtyId ? { specialtyId: input.specialtyId } : {}),
      ...(q
        ? {
            OR: [
              { user: { fullName: { contains: q, mode: "insensitive" } } },
              { clinic: { contains: q, mode: "insensitive" } },
              { specialty: { name: { contains: q, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include: {
      user: true,
      specialty: true,
    },
    orderBy: [{ rating: "desc" }, { user: { fullName: "asc" } }],
  });

  const nextMap = await nextOpenSlotsByDoctorIds(profiles.map((profile) => profile.id));
  return profiles.map((profile) => toPublicDoctor(profile, nextMap.get(profile.id) ?? null));
}

export async function getDoctorByUserId(userId: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId },
    include: {
      user: true,
      specialty: true,
    },
  });

  if (!profile || !profile.user.isActive || profile.user.role !== "DOCTOR") {
    throw new AppError(404, "Doctor not found");
  }

  const nextMap = await nextOpenSlotsByDoctorIds([profile.id]);
  return toPublicDoctor(profile, nextMap.get(profile.id) ?? null);
}

function dateKey(date: Date) {
  return civilDateKey(date);
}

export async function getDoctorAvailability(userId: string, date?: string) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId },
    include: { user: true },
  });

  if (!profile || !profile.user.isActive || profile.user.role !== "DOCTOR") {
    throw new AppError(404, "Doctor not found");
  }

  const now = new Date();
  const todayKey = civilDateKey(now);
  const rangeStart = wallTimeToUtc({
    year: Number(todayKey.slice(0, 4)),
    month: Number(todayKey.slice(5, 7)),
    day: Number(todayKey.slice(8, 10)),
    hour: 0,
    minute: 0,
  });
  const endKey = addCivilDays(todayKey, 14);
  const rangeEnd = wallTimeToUtc({
    year: Number(endKey.slice(0, 4)),
    month: Number(endKey.slice(5, 7)),
    day: Number(endKey.slice(8, 10)),
    hour: 0,
    minute: 0,
  });

  const slots = await prisma.availabilitySlot.findMany({
    where: {
      doctorId: profile.id,
      startsAt: { gte: rangeStart, lt: rangeEnd },
    },
    orderBy: { startsAt: "asc" },
  });

  const byDay = new Map<string, AvailabilitySlot[]>();
  for (const slot of slots) {
    const key = dateKey(slot.startsAt);
    const list = byDay.get(key) ?? [];
    list.push(slot);
    byDay.set(key, list);
  }

  const dates: PublicAvailabilityDate[] = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const key = addCivilDays(todayKey, offset);
    const day = wallTimeToUtc({
      year: Number(key.slice(0, 4)),
      month: Number(key.slice(5, 7)),
      day: Number(key.slice(8, 10)),
      hour: 12,
      minute: 0,
    });
    const daySlots = byDay.get(key) ?? [];
    const openCount = daySlots.filter((slot) => !slot.isBooked && slot.startsAt > now).length;
    dates.push({
      id: key,
      label: day.toLocaleDateString("en-US", {
        timeZone: clinicTimeZone(),
        weekday: "short",
        day: "numeric",
      }),
      month: day.toLocaleDateString("en-US", { timeZone: clinicTimeZone(), month: "short" }),
      slots: openCount,
    });
  }

  const selectedDate = date && byDay.has(date) ? date : dates.find((d) => d.slots > 0)?.id ?? dates[0]?.id;
  const selectedSlots = selectedDate ? byDay.get(selectedDate) ?? [] : [];

  const timeSlots: PublicTimeSlot[] = selectedSlots.map((slot) => ({
    id: slot.id,
    time: formatClinicTime(slot.startsAt),
    available: !slot.isBooked && slot.startsAt > now,
    startsAt: slot.startsAt.toISOString(),
  }));

  return {
    dates,
    selectedDate: selectedDate ?? null,
    timeSlots,
  };
}
