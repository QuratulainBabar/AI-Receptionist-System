export type WeeklyHourSlot = {
  day: string;
  enabled: boolean;
  startTime: string;
  endTime: string;
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

export function defaultWeeklyHours(): WeeklyHourSlot[] {
  return WEEKDAYS.map((day) => ({
    day,
    enabled: day !== "Saturday" && day !== "Sunday",
    startTime: "09:00",
    endTime: "17:00",
  }));
}

export function parseWeeklyHours(value: unknown): WeeklyHourSlot[] {
  if (!Array.isArray(value)) return defaultWeeklyHours();

  const byDay = new Map<string, WeeklyHourSlot>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const day = String(row.day || "").trim();
    if (!WEEKDAYS.includes(day as (typeof WEEKDAYS)[number])) continue;
    byDay.set(day, {
      day,
      enabled: Boolean(row.enabled),
      startTime: String(row.startTime || "09:00"),
      endTime: String(row.endTime || "17:00"),
    });
  }

  return WEEKDAYS.map(
    (day) =>
      byDay.get(day) || {
        day,
        enabled: day !== "Saturday" && day !== "Sunday",
        startTime: "09:00",
        endTime: "17:00",
      },
  );
}

export function formatWeeklyHoursSummary(hours: WeeklyHourSlot[]) {
  const enabled = hours.filter((slot) => slot.enabled);
  if (!enabled.length) return "No weekly hours set";
  return enabled
    .map((slot) => `${slot.day.slice(0, 3)} ${slot.startTime}-${slot.endTime}`)
    .join("; ");
}

export function splitListInput(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || "").trim())
      .filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[\n,;|]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}
