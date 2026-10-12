export type WeeklyHourSession = {
  startTime: string;
  endTime: string;
};

export type WeeklyHourSlot = {
  day: string;
  enabled: boolean;
  /** First session start — kept for older callers / summaries. */
  startTime: string;
  /** First session end — kept for older callers / summaries. */
  endTime: string;
  sessions: WeeklyHourSession[];
};

export type DateOverride = {
  date: string;
  type: "unavailable" | "custom";
  sessions: WeeklyHourSession[];
  breaks: WeeklyHourSession[];
};

export type AvailabilityConfig = {
  version: 2;
  slotDurationMinutes: number;
  scheduleFrom: string | null;
  scheduleTo: string | null;
  days: WeeklyHourSlot[];
  dateOverrides: DateOverride[];
};

export const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

export const CONSULTATION_TYPES = ["In clinic", "Video call", "Both"] as const;
export const SLOT_DURATION_OPTIONS = [15, 30, 45, 60] as const;

function normalizeSession(raw: unknown): WeeklyHourSession | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const startTime = String(row.startTime || "").trim();
  const endTime = String(row.endTime || "").trim();
  if (!/^\d{1,2}:\d{2}$/.test(startTime) || !/^\d{1,2}:\d{2}$/.test(endTime)) return null;
  return { startTime: startTime.padStart(5, "0"), endTime: endTime.padStart(5, "0") };
}

function sessionsForDay(enabled: boolean, startTime: string, endTime: string, sessionsRaw: unknown) {
  const parsed = Array.isArray(sessionsRaw)
    ? sessionsRaw.map(normalizeSession).filter((s): s is WeeklyHourSession => Boolean(s))
    : [];
  if (parsed.length) return parsed;
  if (enabled) return [{ startTime, endTime }];
  return [{ startTime: startTime || "09:00", endTime: endTime || "17:00" }];
}

export function defaultWeeklyHours(): WeeklyHourSlot[] {
  return WEEKDAYS.map((day) => {
    const enabled = day !== "Saturday" && day !== "Sunday";
    const startTime = "09:00";
    const endTime = "17:00";
    return {
      day,
      enabled,
      startTime,
      endTime,
      sessions: [{ startTime, endTime }],
    };
  });
}

export function defaultAvailabilityConfig(): AvailabilityConfig {
  return {
    version: 2,
    slotDurationMinutes: 30,
    scheduleFrom: null,
    scheduleTo: null,
    days: defaultWeeklyHours(),
    dateOverrides: [],
  };
}

function parseDayRow(item: unknown): WeeklyHourSlot | null {
  if (!item || typeof item !== "object") return null;
  const row = item as Record<string, unknown>;
  const day = String(row.day || "").trim();
  if (!WEEKDAYS.includes(day as (typeof WEEKDAYS)[number])) return null;
  const enabled = Boolean(row.enabled);
  const startTime = String(row.startTime || "09:00").padStart(5, "0");
  const endTime = String(row.endTime || "17:00").padStart(5, "0");
  const sessions = sessionsForDay(enabled, startTime, endTime, row.sessions);
  return {
    day,
    enabled,
    startTime: sessions[0]?.startTime || startTime,
    endTime: sessions[0]?.endTime || endTime,
    sessions,
  };
}

export function parseWeeklyHours(value: unknown): WeeklyHourSlot[] {
  const config = parseAvailabilityConfig(value);
  return config.days;
}

export function parseAvailabilityConfig(value: unknown): AvailabilityConfig {
  const base = defaultAvailabilityConfig();
  if (value == null) return base;

  let daysRaw: unknown = value;
  let slotDurationMinutes = base.slotDurationMinutes;
  let scheduleFrom: string | null = null;
  let scheduleTo: string | null = null;
  let dateOverrides: DateOverride[] = [];

  if (value && typeof value === "object" && !Array.isArray(value)) {
    const root = value as Record<string, unknown>;
    if (Array.isArray(root.days)) daysRaw = root.days;
    const duration = Number(root.slotDurationMinutes);
    if (SLOT_DURATION_OPTIONS.includes(duration as (typeof SLOT_DURATION_OPTIONS)[number])) {
      slotDurationMinutes = duration;
    }
    const from = String(root.scheduleFrom || "").trim();
    const to = String(root.scheduleTo || "").trim();
    scheduleFrom = /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : null;
    scheduleTo = /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : null;
    if (Array.isArray(root.dateOverrides)) {
      dateOverrides = root.dateOverrides
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const date = String(row.date || "").trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
          const type = row.type === "unavailable" ? "unavailable" : "custom";
          const sessions = Array.isArray(row.sessions)
            ? row.sessions.map(normalizeSession).filter((s): s is WeeklyHourSession => Boolean(s))
            : [];
          const breaks = Array.isArray(row.breaks)
            ? row.breaks.map(normalizeSession).filter((s): s is WeeklyHourSession => Boolean(s))
            : [];
          return { date, type, sessions, breaks } satisfies DateOverride;
        })
        .filter((row): row is DateOverride => Boolean(row));
    }
  }

  const byDay = new Map<string, WeeklyHourSlot>();
  if (Array.isArray(daysRaw)) {
    for (const item of daysRaw) {
      const parsed = parseDayRow(item);
      if (parsed) byDay.set(parsed.day, parsed);
    }
  }

  const days = WEEKDAYS.map(
    (day) =>
      byDay.get(day) || {
        day,
        enabled: day !== "Saturday" && day !== "Sunday",
        startTime: "09:00",
        endTime: "17:00",
        sessions: [{ startTime: "09:00", endTime: "17:00" }],
      },
  );

  return {
    version: 2,
    slotDurationMinutes,
    scheduleFrom,
    scheduleTo,
    days,
    dateOverrides,
  };
}

/** Normalize any weeklyHours payload into the v2 JSON shape stored on DoctorProfile. */
export function toStoredAvailabilityConfig(value: unknown): AvailabilityConfig {
  return parseAvailabilityConfig(value);
}

export function sessionsOverlap(a: WeeklyHourSession, b: WeeklyHourSession) {
  const toMin = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const a0 = toMin(a.startTime);
  const a1 = toMin(a.endTime);
  const b0 = toMin(b.startTime);
  const b1 = toMin(b.endTime);
  return a0 < b1 && b0 < a1;
}

export function validateDaySessions(sessions: WeeklyHourSession[]) {
  const cleaned = sessions
    .map((s) => ({
      startTime: s.startTime.padStart(5, "0"),
      endTime: s.endTime.padStart(5, "0"),
    }))
    .filter((s) => s.startTime < s.endTime);

  for (let i = 0; i < cleaned.length; i += 1) {
    for (let j = i + 1; j < cleaned.length; j += 1) {
      if (sessionsOverlap(cleaned[i]!, cleaned[j]!)) {
        return { ok: false as const, message: "Sessions on the same day cannot overlap." };
      }
    }
  }
  return { ok: true as const, sessions: cleaned };
}

export function formatWeeklyHoursSummary(hours: WeeklyHourSlot[]) {
  const enabled = hours.filter((slot) => slot.enabled);
  if (!enabled.length) return "No weekly hours set";
  return enabled
    .map((slot) => {
      const ranges = (slot.sessions?.length
        ? slot.sessions
        : [{ startTime: slot.startTime, endTime: slot.endTime }]
      )
        .map((s) => `${s.startTime}-${s.endTime}`)
        .join(", ");
      return `${slot.day.slice(0, 3)} ${ranges}`;
    })
    .join("; ");
}

export function splitListInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,;|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
