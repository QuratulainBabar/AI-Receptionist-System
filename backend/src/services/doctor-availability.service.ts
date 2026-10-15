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
import {
  parseAvailabilityConfig,
  SLOT_DURATION_OPTIONS,
  WEEKDAYS,
  type WeeklyHourSession,
} from "../utils/doctor-profile.js";

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
    clinicToday: civilDateKey(new Date()),
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

function clockToMinutes(value: string) {
  const clock = parseClock(value);
  if (!clock) return null;
  return clock.hour * 60 + clock.minute;
}

function weekdayName(dateKey: string) {
  const name = weekdayNameForCivilDate(dateKey);
  if (WEEKDAYS.includes(name as (typeof WEEKDAYS)[number])) return name;
  return "";
}

function subtractBreaks(sessions: WeeklyHourSession[], breaks: WeeklyHourSession[]) {
  if (!breaks.length) return sessions;
  const result: WeeklyHourSession[] = [];
  for (const session of sessions) {
    let pieces: WeeklyHourSession[] = [session];
    for (const brk of breaks) {
      const next: WeeklyHourSession[] = [];
      for (const piece of pieces) {
        const p0 = clockToMinutes(piece.startTime);
        const p1 = clockToMinutes(piece.endTime);
        const b0 = clockToMinutes(brk.startTime);
        const b1 = clockToMinutes(brk.endTime);
        if (p0 == null || p1 == null || b0 == null || b1 == null) {
          next.push(piece);
          continue;
        }
        if (b1 <= p0 || b0 >= p1) {
          next.push(piece);
          continue;
        }
        if (p0 < b0) {
          next.push({
            startTime: piece.startTime,
            endTime: `${String(Math.floor(b0 / 60)).padStart(2, "0")}:${String(b0 % 60).padStart(2, "0")}`,
          });
        }
        if (b1 < p1) {
          next.push({
            startTime: `${String(Math.floor(b1 / 60)).padStart(2, "0")}:${String(b1 % 60).padStart(2, "0")}`,
            endTime: piece.endTime,
          });
        }
      }
      pieces = next;
    }
    result.push(...pieces);
  }
  return result.filter((s) => (clockToMinutes(s.startTime) ?? 0) < (clockToMinutes(s.endTime) ?? 0));
}

function expandSessionsToStarts(
  dateKey: string,
  sessions: WeeklyHourSession[],
  slotMinutes: number,
  now: Date,
  zone: string,
) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const starts: Date[] = [];
  for (const session of sessions) {
    const start = parseClock(session.startTime);
    const end = parseClock(session.endTime);
    if (!start || !end) continue;
    let minuteOfDay = start.hour * 60 + start.minute;
    const endMinute = end.hour * 60 + end.minute;
    while (minuteOfDay + slotMinutes <= endMinute) {
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
      if (startsAt.getTime() > now.getTime()) starts.push(startsAt);
      minuteOfDay += slotMinutes;
    }
  }
  return starts;
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

/** Create open slots from a date + start/end window using the chosen duration. */
export async function createSlotsFromRangeForDoctor(
  doctorUserId: string,
  input: { date: string; startTime: string; endTime: string; durationMinutes?: number },
) {
  const profile = await requireDoctorProfile(doctorUserId);
  const date = String(input.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError(400, "Choose a valid date.");
  }
  const start = parseClock(input.startTime);
  const end = parseClock(input.endTime);
  if (!start || !end) throw new AppError(400, "Choose valid start and end times.");
  const startMin = start.hour * 60 + start.minute;
  const endMin = end.hour * 60 + end.minute;
  if (endMin <= startMin) throw new AppError(400, "End time must be after start time.");

  const config = parseAvailabilityConfig(profile.weeklyHours);
  const duration =
    input.durationMinutes &&
    SLOT_DURATION_OPTIONS.includes(input.durationMinutes as (typeof SLOT_DURATION_OPTIONS)[number])
      ? input.durationMinutes
      : config.slotDurationMinutes;

  const now = new Date();
  const zone = clinicTimeZone();
  const candidates = expandSessionsToStarts(
    date,
    [{ startTime: input.startTime, endTime: input.endTime }],
    duration,
    now,
    zone,
  );
  if (!candidates.length) {
    throw new AppError(400, "No future slots fall in that time range.");
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
    durationMinutes: duration,
  };
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
  // Idempotent: profile regenerate / prior clear may have already removed this id.
  if (!slot || slot.doctorId !== profile.id) {
    return { id: slotId, alreadyGone: true as const };
  }
  if (slot.isBooked || slot.appointment) {
    throw new AppError(400, "Booked slots cannot be deleted. Cancel the appointment first.");
  }

  await prisma.availabilitySlot.delete({ where: { id: slot.id } });
  return { id: slot.id, alreadyGone: false as const };
}

/** Delete open (unbooked) slots for one or more clinic-zone civil dates. */
export async function clearOpenSlotsOnDates(doctorUserId: string, dates: string[]) {
  const profile = await requireDoctorProfile(doctorUserId);
  const unique = [
    ...new Set(
      dates
        .map((value) => String(value || "").trim())
        .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value)),
    ),
  ];
  if (!unique.length) {
    throw new AppError(400, "Choose at least one valid date to clear.");
  }

  let removed = 0;
  for (const date of unique) {
    const [year, month, day] = date.split("-").map(Number);
    const dayStart = wallTimeToUtc({
      year: year!,
      month: month!,
      day: day!,
      hour: 0,
      minute: 0,
    });
    const nextKey = addCivilDays(date, 1);
    const [ny, nm, nd] = nextKey.split("-").map(Number);
    const nextStart = wallTimeToUtc({
      year: ny!,
      month: nm!,
      day: nd!,
      hour: 0,
      minute: 0,
    });

    const result = await prisma.availabilitySlot.deleteMany({
      where: {
        doctorId: profile.id,
        isBooked: false,
        appointment: null,
        startsAt: { gte: dayStart, lt: nextStart },
      },
    });
    removed += result.count;
  }

  return { removed, dates: unique };
}

export async function generateSlotsFromWeeklyHours(
  doctorUserId: string,
  options?: {
    weeks?: number;
    requireActive?: boolean;
    allowEmpty?: boolean;
    replaceOpen?: boolean;
  },
) {
  const profile = await requireDoctorProfile(doctorUserId, { requireActive: options?.requireActive });
  const config = parseAvailabilityConfig(profile.weeklyHours);
  // Default 1 week so Sync / auto-generate does not silently create next week's days.
  const weeks = Math.max(1, Math.min(8, Math.floor(options?.weeks ?? 1)));
  const slotMinutes = config.slotDurationMinutes;
  const byDay = new Map(config.days.map((row) => [row.day, row]));
  const overrides = new Map(config.dateOverrides.map((row) => [row.date, row]));

  const now = new Date();
  const todayKey = civilDateKey(now);
  const zone = clinicTimeZone();
  const dayCount = weeks * 7;
  const candidates: Date[] = [];

  for (let offset = 0; offset < dayCount; offset += 1) {
    const dateKey = addCivilDays(todayKey, offset);
    if (config.scheduleFrom && dateKey < config.scheduleFrom) continue;
    if (config.scheduleTo && dateKey > config.scheduleTo) continue;

    const override = overrides.get(dateKey);
    if (override?.type === "unavailable") continue;

    let sessions: WeeklyHourSession[] = [];
    if (override?.type === "custom") {
      sessions = subtractBreaks(override.sessions, override.breaks);
    } else {
      const template = byDay.get(weekdayName(dateKey));
      if (!template?.enabled) continue;
      sessions = template.sessions?.length
        ? template.sessions
        : [{ startTime: template.startTime, endTime: template.endTime }];
      if (override?.breaks?.length) {
        sessions = subtractBreaks(sessions, override.breaks);
      }
    }

    candidates.push(...expandSessionsToStarts(dateKey, sessions, slotMinutes, now, zone));
  }

  if (!candidates.length) {
    if (options?.allowEmpty) {
      return { created: 0, considered: 0, weeks, slotMinutes };
    }
    throw new AppError(
      400,
      "No future slots to generate. Enable days and timings under weekly hours first.",
    );
  }

  const windowStart = candidates.reduce((min, d) => (d < min ? d : min), candidates[0]!);
  const windowEnd = candidates.reduce((max, d) => (d > max ? d : max), candidates[0]!);

  if (options?.replaceOpen) {
    // Remove only unbooked open slots in the generated window — never booked appointments.
    await prisma.availabilitySlot.deleteMany({
      where: {
        doctorId: profile.id,
        isBooked: false,
        appointment: null,
        startsAt: { gte: windowStart, lte: windowEnd },
      },
    });
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
    slotMinutes,
  };
}
