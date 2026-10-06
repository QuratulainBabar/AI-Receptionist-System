import { env } from "../config/env.js";

const MS_MINUTE = 60_000;
const MS_HOUR = 60 * MS_MINUTE;
const MS_DAY = 24 * MS_HOUR;

export type ReminderKind = "THREE_DAYS" | "TWENTY_FOUR_HOURS" | "SIX_HOURS";

export type ClinicParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: string;
};

export function clinicTimeZone() {
  return env.CLINIC_TIMEZONE;
}

export function clinicTimeZoneLabel(date = new Date()) {
  const zone = clinicTimeZone();
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "long" })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value || zone;
  return `${name} (${zone})`;
}

function clinicParts(date: Date, timeZone = clinicTimeZone()): ClinicParts {
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const map: Record<string, string> = {};
  for (const part of formatted) {
    if (part.type !== "literal") map[part.type] = part.value;
  }

  let hour = Number(map.hour);
  if (hour === 24) hour = 0;

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: map.weekday || "",
  };
}

function offsetMs(date: Date, timeZone: string) {
  const parts = clinicParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return asUtc - date.getTime();
}

/** Convert a clinic wall-clock time into the UTC instant stored on appointments. */
export function wallTimeToUtc(
  input: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone = clinicTimeZone(),
) {
  const utcGuess = Date.UTC(input.year, input.month - 1, input.day, input.hour, input.minute, 0);
  let utc = utcGuess - offsetMs(new Date(utcGuess), timeZone);
  const adjusted = utcGuess - offsetMs(new Date(utc), timeZone);
  if (adjusted !== utc) utc = adjusted;
  return new Date(utc);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export function civilDateKey(date: Date, timeZone = clinicTimeZone()) {
  const parts = clinicParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function addCivilDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const shifted = new Date(Date.UTC(year!, (month || 1) - 1, (day || 1) + days));
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export function weekdayNameForCivilDate(dateKey: string, timeZone = clinicTimeZone()) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const noon = wallTimeToUtc({ year: year!, month: month!, day: day!, hour: 12, minute: 0 }, timeZone);
  return clinicParts(noon, timeZone).weekday;
}

/** `YYYY-MM-DDTHH:mm` in the clinic zone, for datetime-local inputs. */
export function formatClinicInput(date: Date) {
  const parts = clinicParts(date);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function formatClinicDate(date: Date, locale = "en-US") {
  return date.toLocaleDateString(locale, {
    timeZone: clinicTimeZone(),
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatClinicTime(date: Date, locale = "en-US") {
  return date.toLocaleTimeString(locale, {
    timeZone: clinicTimeZone(),
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatClinicDateTime(date: Date, locale = "en-US") {
  return date.toLocaleString(locale, {
    timeZone: clinicTimeZone(),
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Parse a slot time.
 * A value without a zone is the clinic wall clock (what doctors type).
 * A value with Z or an offset is already an absolute instant.
 */
export function parseClinicDateTime(value: string) {
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(trimmed);
  const hasZone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  if (!match || hasZone) {
    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      throw new Error("Invalid date/time");
    }
    date.setSeconds(0, 0);
    return date;
  }

  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (hour > 23 || minute > 59) {
    throw new Error("Invalid date/time");
  }

  return wallTimeToUtc({
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour,
    minute,
  });
}

/**
 * Reminder instants from the appointment's exact UTC time.
 * Three days before keeps the same clinic clock time (so DST does not shift 9:00 to 8:00).
 * 24 hours and 6 hours are exact durations before that instant.
 */
export function reminderInstants(startsAt: Date) {
  const parts = clinicParts(startsAt);
  const threeDaysKey = addCivilDays(civilDateKey(startsAt), -3);
  const [year, month, day] = threeDaysKey.split("-").map(Number);

  return {
    THREE_DAYS: wallTimeToUtc({
      year: year!,
      month: month!,
      day: day!,
      hour: parts.hour,
      minute: parts.minute,
    }),
    TWENTY_FOUR_HOURS: new Date(startsAt.getTime() - MS_DAY),
    SIX_HOURS: new Date(startsAt.getTime() - 6 * MS_HOUR),
  } satisfies Record<ReminderKind, Date>;
}
