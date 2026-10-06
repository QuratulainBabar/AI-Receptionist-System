import { prisma } from "../lib/prisma.js";
import { AppError } from "../utils/AppError.js";
import {
  addCivilDays,
  civilDateKey,
  clinicTimeZone,
  clinicTimeZoneLabel,
  formatClinicDate,
  formatClinicInput,
  formatClinicTime,
  parseClinicDateTime,
  wallTimeToUtc,
  weekdayNameForCivilDate,
} from "../utils/clinic-time.js";
import { parseWeeklyHours, WEEKDAYS } from "../utils/doctor-profile.js";

const SLOT_MINUTES = 30;

export type PublicDoctorSlot = {
  id: string;
  startsAt: string;
  /** Clinic-zone wall clock (`YYYY-MM-DDTHH:mm`) for the doctor's time input. */
  startsAtLocal: string;
  date: string;
  time: string;
  isBooked: boolean;
  appointmentId: string | null;
  appointmentReference: string | null;
  patientName: string | null;
};

export function clinicClock() {
  return {
    clinicTimeZone: clinicTimeZone(),
    clinicTimeZoneLabel: clinicTimeZoneLabel(),
  };
}

async function requireDoctorProfile(doctorUserId: string, options?: { requireActive?: boolean }) {
  const profile = await prisma.doctorProfile.findUnique({
    where: { userId: doctorUserId },
    include: { user: true },
  });
  if (!profile || profile.user.role !== "DOCTOR") {
    throw new AppError(403, "Only doctors can manage availability");
  }
  if (options?.requireActive !== false && !profile.user.isActive) {
    throw new AppError(403, "Only active doctors can manage availability");
  }
  return profile;
}

function formatDateLabel(date: Date) {
  return formatClinicDate(date);
}

function formatTimeLabel(date: Date) {
  return formatClinicTime(date);
}

function toPublicSlot(row: {
  id: string;
  startsAt: Date;
  isBooked: boolean;
  appointment: {
    id: string;
    reference: string;
    patient: { fullName: string };
  } | null;
}): PublicDoctorSlot {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    startsAtLocal: formatClinicInput(row.startsAt),
    date: formatDateLabel(row.startsAt),
    time: formatTimeLabel(row.startsAt),
    isBooked: row.isBooked,
    appointmentId: row.appointment?.id ?? null,
    appointmentReference: row.appointment?.reference ?? null,
    patientName: row.appointment?.patient.fullName ?? null,
  };
}

function parseStartsAt(value: string) {
  try {
    return parseClinicDateTime(value);
  } catch {
    throw new AppError(400, "Invalid date/time for the slot");
  }
}

function parseClock(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour > 23 || minute > 59) {
    return null;
  }
  return { hour, minute };
}

function weekdayName(dateKey: string) {
  const name = weekdayNameForCivilDate(dateKey);
  if (WEEKDAYS.includes(name as (typeof WEEKDAYS)[number])) return name;
  return "";
}

export async function listSlotsForDoctor(
  doctorUserId: string,
  options?: { from?: string; to?: string; includeBooked?: boolean },
) {
  const profile = await requireDoctorProfile(doctorUserId);
  const now = new Date();
  const from = options?.from ? parseStartsAt(options.from) : now;
  const to = options?.to
    ? parseStartsAt(options.to)
    : new Date(now.getTime() + 28 * 24 * 60 * 60 * 1000);

  const rows = await prisma.availabilitySlot.findMany({
    where: {
      doctorId: profile.id,
      startsAt: { gte: from, lte: to },
      ...(options?.includeBooked === false ? { isBooked: false } : {}),
    },
    include: {
      appointment: {
        include: { patient: true },
      },
    },
    orderBy: { startsAt: "asc" },
    take: 500,
  });

  return rows.map(toPublicSlot);
}

export async function createSlotForDoctor(doctorUserId: string, startsAtInput: string) {
  const profile = await requireDoctorProfile(doctorUserId);
  const startsAt = parseStartsAt(startsAtInput);
  if (startsAt.getTime() <= Date.now()) {
    throw new AppError(400, "Slot time must be in the future");
  }

  try {
    const created = await prisma.availabilitySlot.create({
      data: {
        doctorId: profile.id,
        startsAt,
        isBooked: false,
      },
      include: {
        appointment: { include: { patient: true } },
      },
    });
    return toPublicSlot(created);
  } catch {
    throw new AppError(409, "A slot already exists at this date and time");
  }
}

export async function updateSlotForDoctor(
  doctorUserId: string,
  slotId: string,
  startsAtInput: string,
) {
  const profile = await requireDoctorProfile(doctorUserId);
  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: slotId },
    include: { appointment: true },
  });
  if (!slot || slot.doctorId !== profile.id) {
    throw new AppError(404, "Slot not found");
  }
  if (slot.isBooked || slot.appointment) {
    throw new AppError(400, "Booked slots cannot be edited. Cancel the appointment first.");
  }

  const startsAt = parseStartsAt(startsAtInput);
  if (startsAt.getTime() <= Date.now()) {
    throw new AppError(400, "Slot time must be in the future");
  }

  try {
    const updated = await prisma.availabilitySlot.update({
      where: { id: slot.id },
      data: { startsAt },
      include: {
        appointment: { include: { patient: true } },
      },
    });
    return toPublicSlot(updated);
  } catch {
    throw new AppError(409, "A slot already exists at this date and time");
  }
}

export async function deleteSlotForDoctor(doctorUserId: string, slotId: string) {
  const profile = await requireDoctorProfile(doctorUserId);
  const slot = await prisma.availabilitySlot.findUnique({
    where: { id: slotId },
    include: { appointment: true },
  });
  if (!slot || slot.doctorId !== profile.id) {
    throw new AppError(404, "Slot not found");
  }
  if (slot.isBooked || slot.appointment) {
    throw new AppError(400, "Booked slots cannot be deleted. Cancel the appointment first.");
  }

  await prisma.availabilitySlot.delete({ where: { id: slot.id } });
  return { id: slot.id };
}

export async function generateSlotsFromWeeklyHours(
  doctorUserId: string,
  options?: { weeks?: number; requireActive?: boolean; allowEmpty?: boolean },
) {
  const profile = await requireDoctorProfile(doctorUserId, { requireActive: options?.requireActive });
  const weeks = Math.max(1, Math.min(8, Math.floor(options?.weeks ?? 2)));
  const weeklyHours = parseWeeklyHours(profile.weeklyHours);
  const byDay = new Map(weeklyHours.map((row) => [row.day, row]));

  const now = new Date();
  const dayCount = weeks * 7;
  const candidates: Date[] = [];
  const todayKey = civilDateKey(now);
  const zone = clinicTimeZone();

  for (let offset = 0; offset < dayCount; offset += 1) {
    const dateKey = addCivilDays(todayKey, offset);
    const template = byDay.get(weekdayName(dateKey));
    if (!template?.enabled) continue;

    const start = parseClock(template.startTime);
    const end = parseClock(template.endTime);
    if (!start || !end) continue;

    const [year, month, day] = dateKey.split("-").map(Number);
    let minuteOfDay = start.hour * 60 + start.minute;
    const endMinute = end.hour * 60 + end.minute;

    while (minuteOfDay + SLOT_MINUTES <= endMinute) {
      const startsAt = wallTimeToUtc(
        {
          year: year!,
          month: month!,
          day: day!,
          hour: Math.floor(minuteOfDay / 60),
          minute: minuteOfDay % 60,
        },
        zone,
      );
      if (startsAt.getTime() > now.getTime()) {
        candidates.push(startsAt);
      }
      minuteOfDay += SLOT_MINUTES;
    }
  }

  if (!candidates.length) {
    if (options?.allowEmpty) {
      return { created: 0, considered: 0, weeks, slotMinutes: SLOT_MINUTES };
    }
    throw new AppError(
      400,
      "No future slots to generate. Enable days and timings under weekly hours first.",
    );
  }

  const result = await prisma.availabilitySlot.createMany({
    data: candidates.map((startsAt) => ({
      doctorId: profile.id,
      startsAt,
      isBooked: false,
    })),
    skipDuplicates: true,
  });

  return {
    created: result.count,
    considered: candidates.length,
    weeks,
    slotMinutes: SLOT_MINUTES,
  };
}
