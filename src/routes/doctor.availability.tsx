import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyNote,
  Field,
  Input,
  PageHeader,
  Panel,
  SectionLabel,
} from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  doctorAvailabilityApi,
  doctorProfileApi,
  doctorSynthflowApi,
  formatApiError,
  type ApiAvailabilityConfig,
  type ApiDoctorSlot,
  type ApiWeeklyHourSession,
  type ApiWeeklyHourSlot,
} from "@/lib/api";
import {
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/availability")({
  head: () => ({
    meta: [
      { title: "Availability — Doctor portal" },
      {
        name: "description",
        content:
          "Set weekly hours and bookable slots for patients and the phone AI receptionist.",
      },
    ],
  }),
  component: DoctorAvailabilityPage,
});

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const FIXED_SLOT_DURATION = 30 as const;

const TABS = [
  { id: "current", label: "Today's Availability", icon: CalendarCheck2 },
  { id: "schedule", label: "Weekly Schedule", icon: CalendarDays },
  { id: "calendar", label: "Calendar", icon: CalendarRange },
] as const;

type TabId = (typeof TABS)[number]["id"];

function defaultDay(day: string, enabled = true): ApiWeeklyHourSlot {
  return {
    day,
    enabled,
    startTime: "09:00",
    endTime: "17:00",
    sessions: [{ startTime: "09:00", endTime: "17:00" }],
  };
}

function defaultConfig(): ApiAvailabilityConfig {
  return {
    version: 2,
    slotDurationMinutes: FIXED_SLOT_DURATION,
    scheduleFrom: null,
    scheduleTo: null,
    days: WEEKDAYS.map((day) => defaultDay(day, day !== "Saturday" && day !== "Sunday")),
    dateOverrides: [],
  };
}

function normalizeConfig(raw?: ApiAvailabilityConfig | null, weeklyHours?: ApiWeeklyHourSlot[]): ApiAvailabilityConfig {
  const base = defaultConfig();
  if (raw && Array.isArray(raw.days) && raw.days.length) {
    const byDay = new Map(raw.days.map((d) => [d.day, d]));
    return {
      version: 2,
      slotDurationMinutes: FIXED_SLOT_DURATION,
      scheduleFrom: raw.scheduleFrom ?? null,
      scheduleTo: raw.scheduleTo ?? null,
      days: WEEKDAYS.map((day) => {
        const row = byDay.get(day) || defaultDay(day, day !== "Saturday" && day !== "Sunday");
        const sessions =
          row.sessions && row.sessions.length
            ? row.sessions
            : [{ startTime: row.startTime || "09:00", endTime: row.endTime || "17:00" }];
        return {
          day,
          enabled: Boolean(row.enabled),
          startTime: sessions[0]?.startTime || "09:00",
          endTime: sessions[0]?.endTime || "17:00",
          sessions,
        };
      }),
      dateOverrides: Array.isArray(raw.dateOverrides) ? raw.dateOverrides : [],
    };
  }
  if (weeklyHours?.length) {
    const byDay = new Map(weeklyHours.map((d) => [d.day, d]));
    return {
      ...base,
      days: WEEKDAYS.map((day) => {
        const row = byDay.get(day) || defaultDay(day, day !== "Saturday" && day !== "Sunday");
        const sessions =
          row.sessions && row.sessions.length
            ? row.sessions
            : [{ startTime: row.startTime || "09:00", endTime: row.endTime || "17:00" }];
        return {
          day,
          enabled: Boolean(row.enabled),
          startTime: sessions[0]?.startTime || "09:00",
          endTime: sessions[0]?.endTime || "17:00",
          sessions,
        };
      }),
    };
  }
  return base;
}

function toMinutes(t: string) {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function sessionsOverlap(a: ApiWeeklyHourSession, b: ApiWeeklyHourSession) {
  return toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime);
}

function validateSessions(sessions: ApiWeeklyHourSession[]) {
  for (const s of sessions) {
    if (s.startTime >= s.endTime) return "Each session end time must be after its start.";
  }
  for (let i = 0; i < sessions.length; i += 1) {
    for (let j = i + 1; j < sessions.length; j += 1) {
      if (sessionsOverlap(sessions[i]!, sessions[j]!)) {
        return "Sessions on the same day cannot overlap.";
      }
    }
  }
  return null;
}

function timeToLabel(t: string) {
  try {
    const [hStr, mStr] = t.split(":") as [string, string];
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch {
    return t;
  }
}

function startOfLocalDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function startOfWeekMonday(d: Date) {
  const day = startOfLocalDay(d);
  const dow = day.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(day, offset);
}

function startOfWeekSunday(d: Date) {
  const day = startOfLocalDay(d);
  return addDays(day, -day.getDay());
}

const WEEKDAY_SHORT = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as const;

type WeekDayDraft = {
  dateKey: string;
  weekday: string;
  label: string;
  enabled: boolean;
  sessions: ApiWeeklyHourSession[];
};

function localDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function sameLocalDay(a: Date, b: Date) {
  return localDateKey(a) === localDateKey(b);
}

function slotDate(slot: ApiDoctorSlot) {
  if (slot.startsAt) {
    const parsed = new Date(slot.startsAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  if (slot.startsAtLocal) {
    const parsed = new Date(slot.startsAtLocal);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const fallback = new Date(`${slot.date}T12:00:00`);
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

function toDatetimeLocalValue(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}:${min}`;
}

function ToggleSwitch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
        checked ? "shadow shadow-blue-500/30" : "bg-[#CBD5E1]",
      )}
      style={checked ? { background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)" } : undefined}
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-[18px] transform rounded-full bg-white shadow transition duration-200 ease-in-out",
          checked ? "translate-x-[18px]" : "translate-x-0",
        )}
      />
    </button>
  );
}

function DoctorAvailabilityPage() {
  const [activeTab, setActiveTab] = useState<TabId>("current");
  const [slots, setSlots] = useState<ApiDoctorSlot[]>([]);
  const [config, setConfig] = useState<ApiAvailabilityConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [clinicTimeZoneLabel, setClinicTimeZoneLabel] = useState("the clinic US time zone");
  const [clinicToday, setClinicToday] = useState("");

  const [weekCursor, setWeekCursor] = useState(() => startOfWeekMonday(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));

  // "Today's Availability" follows the doctor's device calendar day so the date
  // rolls forward every local midnight (not stuck on a previous Pacific day).
  const [rangeDate, setRangeDate] = useState(() => localDateKey(new Date()));
  const [pinnedTodayKey, setPinnedTodayKey] = useState(() => localDateKey(new Date()));
  const [dateSessions, setDateSessions] = useState<ApiWeeklyHourSession[]>([
    { startTime: "10:00", endTime: "10:30" },
  ]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartsAt, setEditStartsAt] = useState("");

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [todayModalOpen, setTodayModalOpen] = useState(false);
  const [weekDraft, setWeekDraft] = useState<WeekDayDraft[]>([]);
  const [modalSuccess, setModalSuccess] = useState("");
  const [modalError, setModalError] = useState("");
  const [editingSessionKey, setEditingSessionKey] = useState<string | null>(null);
  const [dayDetailKey, setDayDetailKey] = useState<string | null>(null);

  async function refreshSlots() {
    const result = await doctorAvailabilityApi.list({ includeBooked: true });
    setSlots(result.slots);
    if (result.clinicTimeZoneLabel) setClinicTimeZoneLabel(result.clinicTimeZoneLabel);
    if (result.clinicToday) setClinicToday(result.clinicToday);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([doctorAvailabilityApi.list({ includeBooked: true }), doctorProfileApi.get()])
      .then(([slotsResult, profileResult]) => {
        if (cancelled) return;
        setSlots(slotsResult.slots);
        if (slotsResult.clinicTimeZoneLabel) setClinicTimeZoneLabel(slotsResult.clinicTimeZoneLabel);
        if (slotsResult.clinicToday) setClinicToday(slotsResult.clinicToday);
        // Keep Today's Availability on the device calendar date (auto day rollover).
        const localToday = localDateKey(new Date());
        setPinnedTodayKey(localToday);
        setRangeDate(localToday);
        setSelectedDate(startOfLocalDay(new Date()));
        setWeekCursor(startOfWeekMonday(new Date()));
        setConfig(normalizeConfig(profileResult.profile.availabilityConfig, profileResult.profile.weeklyHours));
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load availability."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When the local calendar day changes, advance "Today" automatically if the
  // doctor was still viewing the previous today (or had not picked another day).
  useEffect(() => {
    function syncLocalToday() {
      const next = localDateKey(new Date());
      setPinnedTodayKey((prevPinned) => {
        if (prevPinned === next) return prevPinned;
        setRangeDate((current) => {
          if (current !== prevPinned) return current;
          setWeekCursor(startOfWeekMonday(new Date()));
          return next;
        });
        setSelectedDate((current) =>
          localDateKey(current) === prevPinned ? startOfLocalDay(new Date()) : current,
        );
        return next;
      });
    }
    syncLocalToday();
    const timer = window.setInterval(syncLocalToday, 30_000);
    const onFocus = () => syncLocalToday();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, []);

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekCursor, i)), [weekCursor]);
  const scheduleWeekDays = useMemo(() => {
    const start = startOfWeekSunday(weekCursor);
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [weekCursor]);
  const scheduleWeekLabel = `${scheduleWeekDays[0]!.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })} → ${scheduleWeekDays[6]!.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  })}`;

  const slotsByDate = useMemo(() => {
    const map = new Map<string, ApiDoctorSlot[]>();
    for (const slot of slots) {
      // Prefer clinic-zone civil date from startsAtLocal (YYYY-MM-DDTHH:mm).
      // slot.date is a display label like "Wed, Oct 14, 2026", not a key.
      const key =
        slot.startsAtLocal && /^\d{4}-\d{2}-\d{2}/.test(slot.startsAtLocal)
          ? slot.startsAtLocal.slice(0, 10)
          : slot.date && /^\d{4}-\d{2}-\d{2}$/.test(slot.date)
            ? slot.date
            : localDateKey(slotDate(slot));
      const list = map.get(key) || [];
      list.push(slot);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => slotDate(a).getTime() - slotDate(b).getTime());
    }
    return map;
  }, [slots]);

  async function syncTimeSlots() {
    setSyncing(true);
    setError("");
    setSuccess("");
    try {
      const result = await doctorSynthflowApi.syncSynthflowDirectory();
      await refreshSlots();
      if (result.warning) {
        setSuccess(result.warning);
      } else if (result.openSlotsSummary && result.openSlotsSummary !== "none") {
        setSuccess(
          `Phone agent updated with open times: ${result.openSlotsSummary}`,
        );
      } else {
        setSuccess(
          "Phone agent updated, but there are no open slots yet. Add slots, then Sync again.",
        );
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to sync time slots to the phone agent."));
    } finally {
      setSyncing(false);
    }
  }

  function openTodaySlotsModal() {
    setDateSessions([{ startTime: "10:00", endTime: "10:30" }]);
    setModalSuccess("");
    setModalError("");
    setTodayModalOpen(true);
  }

  async function createDateSessionSlots() {
    if (!rangeDate) {
      setModalError("Choose a date.");
      setModalSuccess("");
      return;
    }
    const sessionError = validateSessions(dateSessions);
    if (sessionError) {
      setModalError(sessionError);
      setModalSuccess("");
      return;
    }
    setBusyId("range");
    setModalError("");
    setModalSuccess("");
    try {
      // Replace that day's open slots by date (not stale UI ids).
      await doctorAvailabilityApi.clearDates([rangeDate], true);
      let created = 0;
      for (const session of dateSessions) {
        const result = await doctorAvailabilityApi.createRange({
          date: rangeDate,
          startTime: session.startTime,
          endTime: session.endTime,
          durationMinutes: FIXED_SLOT_DURATION,
          skipSynthflowSync: true,
        });
        created += result.created;
      }
      await doctorSynthflowApi.syncSynthflowDirectory().catch(() => null);
      await refreshSlots();
      setSelectedDate(new Date(`${rangeDate}T12:00:00`));
      setWeekCursor(startOfWeekMonday(new Date(`${rangeDate}T12:00:00`)));
      setModalSuccess(
        created
          ? `Slots saved successfully. Created ${created} open slot${created === 1 ? "" : "s"}.`
          : "Slots saved successfully.",
      );
    } catch (err) {
      setModalError(formatApiError(err, "Unable to create slots for that date."));
    } finally {
      setBusyId(null);
    }
  }

  async function saveEditSlot() {
    if (!editingId || !editStartsAt) return;
    setBusyId(editingId);
    setError("");
    setSuccess("");
    try {
      const result = await doctorAvailabilityApi.update(editingId, editStartsAt);
      await refreshSlots();
      setEditingId(null);
      setEditStartsAt("");
      setSuccess(result.message || "Slot updated.");
    } catch (err) {
      setError(formatApiError(err, "Unable to update slot. Booked appointments cannot be moved here."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeSlot(slotId: string) {
    setBusyId(slotId);
    setError("");
    setSuccess("");
    try {
      const result = await doctorAvailabilityApi.remove(slotId);
      await refreshSlots();
      setSuccess(result.message || "Slot removed.");
    } catch (err) {
      setError(formatApiError(err, "Unable to remove slot. Booked appointments are protected."));
    } finally {
      setBusyId(null);
    }
  }

  const selectedKey = localDateKey(selectedDate);
  const selectedSlots = slotsByDate.get(selectedKey) || [];
  const todaySlots = slotsByDate.get(rangeDate) || [];
  const todayOpenCount = todaySlots.filter((s) => !s.isBooked).length;
  function clockFromSlot(slot: ApiDoctorSlot) {
    if (slot.startsAtLocal && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(slot.startsAtLocal)) {
      return slot.startsAtLocal.slice(11, 16);
    }
    const d = slotDate(slot);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  function addMinutesToClock(clock: string, minutes: number) {
    const [hStr, mStr] = clock.split(":");
    const total = Number(hStr) * 60 + Number(mStr) + minutes;
    const normalized = ((total % (24 * 60)) + 24 * 60) % (24 * 60);
    const hour = Math.floor(normalized / 60);
    const minute = normalized % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  function sessionsFromOpenSlots(daySlots: ApiDoctorSlot[]): ApiWeeklyHourSession[] {
    const open = [...daySlots]
      .filter((s) => !s.isBooked)
      .sort((a, b) => slotDate(a).getTime() - slotDate(b).getTime());
    if (!open.length) return [{ startTime: "09:00", endTime: "17:00" }];

    const sessions: ApiWeeklyHourSession[] = [];
    let rangeStart = clockFromSlot(open[0]!);
    let prevEndMs = slotDate(open[0]!).getTime() + FIXED_SLOT_DURATION * 60_000;
    let prevEndClock = addMinutesToClock(rangeStart, FIXED_SLOT_DURATION);

    for (let i = 1; i < open.length; i += 1) {
      const startMs = slotDate(open[i]!).getTime();
      const startClock = clockFromSlot(open[i]!);
      if (startMs > prevEndMs + 1) {
        sessions.push({ startTime: rangeStart, endTime: prevEndClock });
        rangeStart = startClock;
      }
      prevEndMs = startMs + FIXED_SLOT_DURATION * 60_000;
      prevEndClock = addMinutesToClock(startClock, FIXED_SLOT_DURATION);
    }
    sessions.push({ startTime: rangeStart, endTime: prevEndClock });
    return sessions;
  }

  function buildWeekDraft(week: Date[]): WeekDayDraft[] {
    return week.map((day) => {
      const weekday = day.toLocaleDateString("en-US", { weekday: "long" });
      const dateKey = localDateKey(day);
      const daySlots = slotsByDate.get(dateKey) || [];
      const openCount = daySlots.filter((s) => !s.isBooked).length;
      const fromConfig = config.days.find((d) => d.day === weekday);
      const sessions =
        openCount > 0
          ? sessionsFromOpenSlots(daySlots)
          : fromConfig?.sessions?.length
            ? fromConfig.sessions.map((s) => ({ ...s }))
            : [{ startTime: "09:00", endTime: "17:00" }];
      return {
        dateKey,
        weekday,
        label: day.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        // Reflect real open slots first; otherwise fall back to saved weekly template.
        enabled: openCount > 0 ? true : Boolean(fromConfig?.enabled),
        sessions,
      };
    });
  }

  function openWeekSlotsModal(week: Date[]) {
    setWeekDraft(buildWeekDraft(week));
    setModalSuccess("");
    setModalError("");
    setEditingSessionKey(null);
    setWeekCursor(startOfWeekMonday(week[1] || week[0]!));
    setScheduleModalOpen(true);
  }

  function shiftModalWeek(deltaWeeks: number) {
    if (saving) return;
    const nextCursor = addDays(weekCursor, deltaWeeks * 7);
    const nextWeek = Array.from({ length: 7 }, (_, i) => addDays(startOfWeekSunday(nextCursor), i));
    setWeekCursor(startOfWeekMonday(nextCursor));
    setWeekDraft(buildWeekDraft(nextWeek));
    setModalSuccess("");
    setModalError("");
    setEditingSessionKey(null);
  }

  const modalWeekLabel = useMemo(() => {
    if (weekDraft.length < 7) return scheduleWeekLabel;
    const start = new Date(`${weekDraft[0]!.dateKey}T12:00:00`);
    const end = new Date(`${weekDraft[6]!.dateKey}T12:00:00`);
    const fmt = (d: Date) =>
      d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    return `${fmt(start)} → ${fmt(end)}`;
  }, [weekDraft, scheduleWeekLabel]);

  function updateWeekDraftDay(dateKey: string, patch: Partial<WeekDayDraft>) {
    setWeekDraft((rows) => rows.map((row) => (row.dateKey === dateKey ? { ...row, ...patch } : row)));
  }

  function updateWeekDraftSession(dateKey: string, index: number, patch: Partial<ApiWeeklyHourSession>) {
    setWeekDraft((rows) =>
      rows.map((row) => {
        if (row.dateKey !== dateKey) return row;
        const sessions = row.sessions.map((s, i) => (i === index ? { ...s, ...patch } : s));
        return { ...row, sessions };
      }),
    );
  }

  function addWeekDraftSession(dateKey: string) {
    const current = weekDraft.find((row) => row.dateKey === dateKey);
    const nextIndex = current?.sessions.length ?? 0;
    setWeekDraft((rows) =>
      rows.map((row) =>
        row.dateKey === dateKey
          ? { ...row, enabled: true, sessions: [...row.sessions, { startTime: "14:00", endTime: "17:00" }] }
          : row,
      ),
    );
    setEditingSessionKey(`${dateKey}:${nextIndex}`);
  }

  function removeWeekDraftSession(dateKey: string, index: number) {
    setWeekDraft((rows) =>
      rows.map((row) => {
        if (row.dateKey !== dateKey) return row;
        const sessions = row.sessions.filter((_, i) => i !== index);
        return {
          ...row,
          sessions: sessions.length ? sessions : [{ startTime: "09:00", endTime: "17:00" }],
          enabled: sessions.length > 0,
        };
      }),
    );
  }

  async function saveWeeklyFromModal() {
    for (const day of weekDraft) {
      if (!day.enabled || !day.sessions.length) continue;
      const msg = validateSessions(day.sessions);
      if (msg) {
        setModalError(`${day.label}: ${msg}`);
        setModalSuccess("");
        return;
      }
    }

    setSaving(true);
    setModalError("");
    setModalSuccess("");
    try {
      const payloadDays = WEEKDAYS.map((weekday) => {
        const match = weekDraft.find((d) => d.weekday === weekday);
        const existing = config.days.find((d) => d.day === weekday);
        const enabled = match ? match.enabled && match.sessions.length > 0 : Boolean(existing?.enabled);
        const sessions = match
          ? match.sessions.length
            ? match.sessions
            : [{ startTime: "09:00", endTime: "17:00" }]
          : existing?.sessions?.length
            ? existing.sessions
            : [{ startTime: existing?.startTime || "09:00", endTime: existing?.endTime || "17:00" }];
        return {
          day: weekday,
          enabled,
          startTime: sessions[0]?.startTime || "09:00",
          endTime: sessions[0]?.endTime || "17:00",
          sessions,
        };
      });

      // Save the weekly template without regenerating slots (we rebuild this week below).
      const result = await doctorProfileApi.update({
        availabilityConfig: {
          version: 2,
          slotDurationMinutes: FIXED_SLOT_DURATION,
          scheduleFrom: config.scheduleFrom || null,
          scheduleTo: config.scheduleTo || null,
          days: payloadDays,
          dateOverrides: config.dateOverrides || [],
        },
        regenerateOpenSlots: false,
        skipSynthflowSync: true,
      });
      setConfig(normalizeConfig(result.profile.availabilityConfig, result.profile.weeklyHours));

      const weekDates = weekDraft.map((day) => day.dateKey);
      const cleared = await doctorAvailabilityApi.clearDates(weekDates, true);
      let created = 0;
      for (const day of weekDraft) {
        if (!day.enabled || !day.sessions.length) continue;
        for (const session of day.sessions) {
          const range = await doctorAvailabilityApi.createRange({
            date: day.dateKey,
            startTime: session.startTime,
            endTime: session.endTime,
            durationMinutes: FIXED_SLOT_DURATION,
            skipSynthflowSync: true,
          });
          created += range.created;
        }
      }

      await doctorSynthflowApi.syncSynthflowDirectory().catch(() => null);
      await refreshSlots();
      setModalSuccess(
        created || cleared.removed
          ? `Slots saved. Removed ${cleared.removed} old open slot${cleared.removed === 1 ? "" : "s"}, created ${created} new.`
          : "Slots saved for this week.",
      );
    } catch (err) {
      setModalError(formatApiError(err, "Unable to save slots."));
    } finally {
      setSaving(false);
    }
  }

  function formatRangeDateLabel(dateKey: string) {
    const parsed = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateKey;
    return parsed.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function slotEndLabel(slot: ApiDoctorSlot) {
    const start = slotDate(slot);
    const end = new Date(start.getTime() + FIXED_SLOT_DURATION * 60_000);
    return end.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone: "America/Los_Angeles",
    });
  }

  return (
    <div className="w-full max-w-full">
      <PageHeader
        title="Availability slots"
        description="Add today's slots, set weekly hours in a modal, or review the calendar."
        actions={
          <Button
            variant="outline"
            className="h-auto min-h-11 gap-2 px-4 py-2.5"
            onClick={() => void syncTimeSlots()}
            disabled={syncing || loading}
          >
            <RefreshCw className={cn("size-4", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync time slots"}
          </Button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <Panel className="mb-5 overflow-visible border border-sky-100 bg-sky-50/60 p-1.5">
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] font-semibold transition-all sm:px-4 sm:text-[13px]",
                  active
                    ? "border-sky-200 bg-white text-blue-700 shadow-sm"
                    : "border-transparent text-slate-600 hover:bg-white/70 hover:text-slate-900",
                )}
              >
                <Icon className="size-4" strokeWidth={2} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </Panel>

      <p className="mb-5 text-[12.5px] text-slate-500">
        Today&apos;s date follows your device calendar ({formatRangeDateLabel(pinnedTodayKey)}
        ). Slot clock times use {clinicTimeZoneLabel}
        {clinicToday && clinicToday !== pinnedTodayKey
          ? ` (clinic calendar day there is currently ${formatRangeDateLabel(clinicToday)})`
          : ""}
        . Booked appointments are never overwritten when you regenerate open slots.
      </p>

      {loading ? (
        <EmptyNote>Loading availability…</EmptyNote>
      ) : activeTab === "current" ? (
        <div className="space-y-5">
          <Panel className="overflow-hidden border border-sky-100 p-0">
            <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-blue-50/40 px-5 py-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
                    <CalendarCheck2 className="size-5" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="text-[16px] font-semibold text-slate-900">Today&apos;s Availability</h3>
                    <p className="mt-0.5 text-[12.5px] text-slate-500">
                      Add or manage open slots for {formatRangeDateLabel(rangeDate)}. The date updates automatically each day.
                    </p>
                  </div>
                </div>
                <Button onClick={openTodaySlotsModal}>
                  <Plus className="size-4" />
                  Add slot
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 bg-white px-5 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-semibold text-slate-900">Available Time Slots (Today)</h3>
                <Badge className="bg-sky-100 text-blue-700">
                  {todayOpenCount} slot{todayOpenCount === 1 ? "" : "s"} added
                </Badge>
              </div>
              <div className="flex min-w-[12rem] items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2">
                <CalendarDays className="size-4 shrink-0 text-blue-600" />
                <Input
                  type="date"
                  className="h-8 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                  value={rangeDate}
                  onChange={(e) => setRangeDate(e.target.value)}
                  aria-label="Select date"
                />
              </div>
            </div>

            <div className="px-5 py-2 text-[12px] text-slate-500">{formatRangeDateLabel(rangeDate)}</div>

            {!todaySlots.length ? (
              <div className="px-5 pb-5">
                <EmptyNote>No slots for this date yet. Click Add slot to create times.</EmptyNote>
              </div>
            ) : (
              <div className="divide-y divide-sky-100/80">
                {todaySlots.map((slot) => (
                  <div
                    key={slot.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 px-5 py-3.5",
                      slot.isBooked ? "bg-amber-50/40" : "bg-white",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-slate-900">
                        {slot.time} – {slotEndLabel(slot)}
                      </div>
                      {slot.isBooked ? (
                        <div className="mt-1 text-[12px] text-amber-700">
                          Booked{slot.patientName ? ` · ${slot.patientName}` : ""}
                        </div>
                      ) : null}
                      {editingId === slot.id ? (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <Field label="New start">
                            <Input
                              type="datetime-local"
                              value={editStartsAt}
                              onChange={(e) => setEditStartsAt(e.target.value)}
                            />
                          </Field>
                          <Button size="sm" onClick={() => void saveEditSlot()} disabled={busyId === slot.id}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null);
                              setEditStartsAt("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {!slot.isBooked ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600"
                          disabled={busyId === slot.id}
                          onClick={() => {
                            setEditingId(slot.id);
                            setEditStartsAt(slot.startsAtLocal || toDatetimeLocalValue(slotDate(slot)));
                          }}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          disabled={busyId === slot.id}
                          onClick={() => void removeSlot(slot.id)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800">Booked</Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Dialog
            open={todayModalOpen}
            onOpenChange={(open) => {
              setTodayModalOpen(open);
              if (!open) {
                setModalSuccess("");
                setModalError("");
              }
            }}
          >
            <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add slot</DialogTitle>
              </DialogHeader>

              {modalError && todayModalOpen ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalError}
                </div>
              ) : null}
              {modalSuccess && todayModalOpen ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {modalSuccess}
                </div>
              ) : null}

              <div className="space-y-4">
                <Field label="Date">
                  <Input type="date" value={rangeDate} onChange={(e) => setRangeDate(e.target.value)} />
                </Field>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <SectionLabel>Sessions</SectionLabel>
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() =>
                        setDateSessions((rows) => [...rows, { startTime: "14:00", endTime: "14:30" }])
                      }
                    >
                      <Plus className="size-3.5" />
                      Add session
                    </Button>
                  </div>
                  <div className="space-y-2 rounded-2xl border border-sky-100 bg-sky-50/50 p-3">
                    {dateSessions.map((session, index) => (
                      <div
                        key={`ds-${index}`}
                        className="grid gap-3 rounded-xl bg-white/80 p-3 sm:grid-cols-2 sm:items-end"
                      >
                        <Field label="Start Time">
                          <div className="relative">
                            <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                            <Input
                              type="time"
                              className="pl-10"
                              value={session.startTime}
                              onChange={(e) =>
                                setDateSessions((rows) =>
                                  rows.map((s, i) => (i === index ? { ...s, startTime: e.target.value } : s)),
                                )
                              }
                            />
                          </div>
                        </Field>
                        <div className="flex items-end gap-2">
                          <div className="min-w-0 flex-1">
                            <Field label="End Time">
                              <div className="relative">
                                <Clock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                  type="time"
                                  className="pl-10"
                                  value={session.endTime}
                                  onChange={(e) =>
                                    setDateSessions((rows) =>
                                      rows.map((s, i) => (i === index ? { ...s, endTime: e.target.value } : s)),
                                    )
                                  }
                                />
                              </div>
                            </Field>
                          </div>
                          {dateSessions.length > 1 ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="mb-0.5 shrink-0 text-red-600"
                              onClick={() => setDateSessions((rows) => rows.filter((_, i) => i !== index))}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <DialogFooter className="mt-2 gap-2 sm:justify-end">
                {modalSuccess && todayModalOpen ? (
                  <Button className="h-auto min-h-11 px-5 py-2.5" onClick={() => setTodayModalOpen(false)}>
                    Done
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setTodayModalOpen(false)} disabled={busyId === "range"}>
                      Cancel
                    </Button>
                    <Button
                      className="h-auto min-h-11 px-5 py-2.5"
                      onClick={() => void createDateSessionSlots()}
                      disabled={busyId === "range"}
                    >
                      {busyId === "range" ? "Saving…" : "Save slot"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : activeTab === "schedule" ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-semibold text-slate-900">Weekly Schedule</h3>
              <p className="mt-0.5 text-[12.5px] text-slate-500">
                View one week at a time, then add slots for those exact dates.
              </p>
            </div>
            <Button onClick={() => openWeekSlotsModal(scheduleWeekDays)}>
              <Plus className="size-4" />
              Add slot
            </Button>
          </div>

          <Panel className="border border-sky-100 p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekCursor((w) => addDays(w, -7))}
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 px-4 py-2 text-center text-[13px] font-semibold text-slate-800 sm:text-[14px]">
                {scheduleWeekLabel}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekCursor((w) => addDays(w, 7))}
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <div className="mb-2 grid grid-cols-7 gap-1.5">
              {WEEKDAY_SHORT.map((label) => (
                <div
                  key={label}
                  className="py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 items-stretch gap-1.5">
              {scheduleWeekDays.map((day) => {
                const key = localDateKey(day);
                const isToday = sameLocalDay(day, new Date());
                const daySlots = slotsByDate.get(key) || [];
                const openCount = daySlots.filter((s) => !s.isBooked).length;
                const bookedCount = daySlots.filter((s) => s.isBooked).length;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setDayDetailKey(key);
                      setSelectedDate(day);
                    }}
                    className={cn(
                      "min-h-[84px] rounded-xl border border-sky-100 bg-white px-2 py-1.5 text-left transition hover:border-blue-300 hover:bg-sky-50/60",
                      isToday && "ring-2 ring-blue-200",
                      dayDetailKey === key && "border-blue-400 bg-sky-50",
                    )}
                  >
                    <div
                      className={cn(
                        "text-[13px] font-semibold",
                        isToday ? "text-blue-700" : "text-slate-900",
                      )}
                    >
                      {day.getDate()}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      {day.toLocaleDateString("en-US", { month: "short" })}
                    </div>
                    {openCount > 0 ? (
                      <div className="mt-1 text-[10px] font-medium text-blue-600">
                        {openCount} open
                      </div>
                    ) : null}
                    {bookedCount > 0 ? (
                      <div className="mt-0.5 text-[10px] font-medium text-amber-700">
                        {bookedCount} booked
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-[12px] text-slate-500">
              Click a date to see open slots and booked appointments for that day.
            </p>
          </Panel>

          <Dialog
            open={Boolean(dayDetailKey)}
            onOpenChange={(open) => {
              if (!open) setDayDetailKey(null);
            }}
          >
            <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
              <DialogHeader>
                <DialogTitle>
                  {dayDetailKey
                    ? new Date(`${dayDetailKey}T12:00:00`).toLocaleDateString("en-US", {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Day details"}
                </DialogTitle>
              </DialogHeader>
              {(() => {
                const daySlots = dayDetailKey ? slotsByDate.get(dayDetailKey) || [] : [];
                const openSlots = daySlots.filter((s) => !s.isBooked);
                const bookedSlots = daySlots.filter((s) => s.isBooked);
                return (
                  <div className="space-y-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-blue-50 text-blue-700">{openSlots.length} open</Badge>
                      <Badge className="bg-amber-50 text-amber-800">
                        {bookedSlots.length} appointment{bookedSlots.length === 1 ? "" : "s"} booked
                      </Badge>
                    </div>
                    <div>
                      <SectionLabel>Booked appointments</SectionLabel>
                      {!bookedSlots.length ? (
                        <EmptyNote>No appointments booked on this day.</EmptyNote>
                      ) : (
                        <div className="mt-2 space-y-2">
                          {bookedSlots.map((slot) => (
                            <div
                              key={slot.id}
                              className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-[13px]"
                            >
                              <div className="font-semibold text-slate-900">
                                {slot.time || clockFromSlot(slot)}
                              </div>
                              <div className="text-slate-600">
                                {slot.patientName || "Patient"}
                                {slot.appointmentReference
                                  ? ` · ${slot.appointmentReference}`
                                  : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <SectionLabel>Open slots</SectionLabel>
                      {!openSlots.length ? (
                        <EmptyNote>No open slots on this day.</EmptyNote>
                      ) : (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {openSlots.map((slot) => (
                            <Badge key={slot.id} className="bg-sky-50 text-sky-800">
                              {slot.time || clockFromSlot(slot)}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDayDetailKey(null)}>
                        Close
                      </Button>
                      <Button
                        onClick={() => {
                          if (dayDetailKey) {
                            setRangeDate(dayDetailKey);
                            setActiveTab("current");
                            setDayDetailKey(null);
                          }
                        }}
                      >
                        Edit this day&apos;s slots
                      </Button>
                    </DialogFooter>
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>

          <Dialog
            open={scheduleModalOpen}
            onOpenChange={(open) => {
              setScheduleModalOpen(open);
              if (!open) {
                setWeekDraft([]);
                setModalSuccess("");
                setModalError("");
                setEditingSessionKey(null);
              }
            }}
          >
            <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add weekly slots</DialogTitle>
              </DialogHeader>

              {modalError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {modalError}
                </div>
              ) : null}
              {modalSuccess ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  {modalSuccess}
                </div>
              ) : null}

              <div className="overflow-hidden rounded-2xl border border-sky-100">
                <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-blue-50/50 px-4 py-3">
                  <h4 className="text-[14px] font-semibold text-slate-900">Week hours</h4>
                  <p className="mt-0.5 text-[12px] text-slate-500">
                    Enable each date and set sessions for that day. Slots are created as 30-minute bookings.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => shiftModalWeek(-1)}
                    >
                      <ChevronLeft className="size-4" />
                      Back
                    </Button>
                    <div className="min-w-0 flex-1 rounded-xl border border-sky-200 bg-white/80 px-3 py-2 text-center text-[12px] font-semibold text-slate-800 sm:text-[13px]">
                      {modalWeekLabel}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => shiftModalWeek(1)}
                    >
                      Next
                      <ChevronRight className="size-4" />
                    </Button>
                  </div>
                </div>
                <div className="divide-y divide-sky-100/80">
                  {weekDraft.map((day) => (
                    <div
                      key={day.dateKey}
                      className={cn(
                        "px-4 py-3 transition-colors",
                        day.enabled ? "bg-white" : "bg-slate-50/80",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <ToggleSwitch
                          checked={day.enabled}
                          onChange={(enabled) => updateWeekDraftDay(day.dateKey, { enabled })}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[14px] font-semibold text-slate-900">{day.label}</div>
                          <div className="text-[12px] text-slate-500">{day.weekday}</div>
                        </div>
                        {!day.enabled ? (
                          <Badge className="bg-slate-100 text-slate-500">Closed</Badge>
                        ) : (
                          <span className="text-[12px] text-slate-500">
                            {day.sessions.length} session{day.sessions.length === 1 ? "" : "s"}
                          </span>
                        )}
                        <Button
                          variant="soft"
                          size="sm"
                          disabled={!day.enabled}
                          onClick={() => addWeekDraftSession(day.dateKey)}
                        >
                          <Plus className="size-3.5" />
                          Add session
                        </Button>
                      </div>

                      {day.enabled ? (
                        <div className="mt-3 space-y-2">
                          {day.sessions.map((session, index) => {
                            const sessionKey = `${day.dateKey}:${index}`;
                            const isEditing = editingSessionKey === sessionKey;
                            return (
                              <div
                                key={sessionKey}
                                className="flex flex-col gap-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3 sm:flex-row sm:flex-wrap sm:items-end"
                              >
                                {isEditing ? (
                                  <>
                                    <div className="min-w-0 flex-1 sm:min-w-[8rem] sm:flex-none">
                                      <Field label="Start">
                                        <Input
                                          type="time"
                                          value={session.startTime}
                                          onChange={(e) =>
                                            updateWeekDraftSession(day.dateKey, index, {
                                              startTime: e.target.value,
                                            })
                                          }
                                        />
                                      </Field>
                                    </div>
                                    <div className="min-w-0 flex-1 sm:min-w-[8rem] sm:flex-none">
                                      <Field label="End">
                                        <Input
                                          type="time"
                                          value={session.endTime}
                                          onChange={(e) =>
                                            updateWeekDraftSession(day.dateKey, index, {
                                              endTime: e.target.value,
                                            })
                                          }
                                        />
                                      </Field>
                                    </div>
                                  </>
                                ) : (
                                  <div className="min-w-0 flex-1 text-[14px] font-semibold text-slate-900">
                                    {timeToLabel(session.startTime)} – {timeToLabel(session.endTime)}
                                  </div>
                                )}
                                <div className="ml-auto flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-blue-600"
                                    aria-label={isEditing ? "Done editing" : "Edit session"}
                                    onClick={() =>
                                      setEditingSessionKey(isEditing ? null : sessionKey)
                                    }
                                  >
                                    <Pencil className="size-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600"
                                    aria-label="Delete session"
                                    onClick={() => {
                                      removeWeekDraftSession(day.dateKey, index);
                                      setEditingSessionKey(null);
                                    }}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              <DialogFooter className="mt-2 gap-2 sm:justify-end">
                {modalSuccess ? (
                  <Button className="h-auto min-h-11 px-5 py-2.5" onClick={() => setScheduleModalOpen(false)}>
                    Done
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setScheduleModalOpen(false)} disabled={saving}>
                      Cancel
                    </Button>
                    <Button
                      className="h-auto min-h-11 px-5 py-2.5"
                      onClick={() => void saveWeeklyFromModal()}
                      disabled={saving}
                    >
                      {saving ? "Saving…" : "Save slot"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : activeTab === "calendar" ? (
        <div className="space-y-5">
          <Panel className="border border-sky-100 p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">Week view</h3>
                <p className="text-[12.5px] text-slate-500">
                  Open slots in blue · Booked appointments in amber. Click a day to manage slots.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekCursor((w) => addDays(w, -7))}
                  aria-label="Previous week"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => {
                    const today = startOfLocalDay(new Date());
                    setWeekCursor(startOfWeekMonday(today));
                    setSelectedDate(today);
                  }}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setWeekCursor((w) => addDays(w, 7))}
                  aria-label="Next week"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
              {weekDays.map((day) => {
                const key = localDateKey(day);
                const daySlots = slotsByDate.get(key) || [];
                const openCount = daySlots.filter((s) => !s.isBooked).length;
                const bookedCount = daySlots.filter((s) => s.isBooked).length;
                const isSelected = sameLocalDay(day, selectedDate);
                const isToday = sameLocalDay(day, new Date());
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setSelectedDate(startOfLocalDay(day));
                      setRangeDate(key);
                    }}
                    className={cn(
                      "min-h-[140px] rounded-2xl border p-3 text-left transition-all",
                      isSelected
                        ? "border-blue-400 bg-blue-50 shadow-sm ring-2 ring-blue-200/60"
                        : "border-sky-100 bg-white hover:border-sky-200 hover:bg-sky-50/40",
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          {day.toLocaleDateString("en-US", { weekday: "short" })}
                        </div>
                        <div
                          className={cn(
                            "text-[18px] font-semibold",
                            isToday ? "text-blue-700" : "text-slate-900",
                          )}
                        >
                          {day.getDate()}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1">
                      {daySlots.slice(0, 4).map((slot) => (
                        <div
                          key={slot.id}
                          className={cn(
                            "truncate rounded-md px-1.5 py-0.5 text-[11px] font-medium",
                            slot.isBooked
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-800",
                          )}
                        >
                          {slot.time}
                          {slot.isBooked ? " · booked" : ""}
                        </div>
                      ))}
                      {daySlots.length > 4 ? (
                        <div className="text-[11px] text-slate-400">+{daySlots.length - 4} more</div>
                      ) : null}
                      {!daySlots.length ? (
                        <div className="text-[11px] text-slate-400">No slots</div>
                      ) : null}
                    </div>
                    {(openCount > 0 || bookedCount > 0) && daySlots.length > 4 ? (
                      <div className="mt-2 flex gap-2 text-[10px] text-slate-500">
                        <span>{openCount} open</span>
                        <span>{bookedCount} booked</span>
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel className="border border-sky-100 p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-semibold text-slate-900">
                  {selectedDate.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                    year: "numeric",
                  })}
                </h3>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRangeDate(selectedKey);
                  setActiveTab("current");
                }}
              >
                <Plus className="size-3.5" />
                Add slots for this day
              </Button>
            </div>

            {!selectedSlots.length ? (
              <EmptyNote>No slots on this day. Add a time range or generate from weekly hours.</EmptyNote>
            ) : (
              <div className="space-y-2">
                {selectedSlots.map((slot) => (
                  <div
                    key={slot.id}
                    className={cn(
                      "flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3",
                      slot.isBooked
                        ? "border-amber-200 bg-amber-50/60"
                        : "border-sky-100 bg-sky-50/40",
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[14px] font-semibold text-slate-900">{slot.time}</span>
                        <Badge
                          className={
                            slot.isBooked
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }
                        >
                          {slot.isBooked ? "Booked" : "Available"}
                        </Badge>
                        {slot.patientName ? (
                          <span className="text-[12.5px] text-slate-500">{slot.patientName}</span>
                        ) : null}
                      </div>
                      {editingId === slot.id ? (
                        <div className="mt-2 flex flex-wrap items-end gap-2">
                          <Field label="New start">
                            <Input
                              type="datetime-local"
                              value={editStartsAt}
                              onChange={(e) => setEditStartsAt(e.target.value)}
                            />
                          </Field>
                          <Button size="sm" onClick={() => void saveEditSlot()} disabled={busyId === slot.id}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null);
                              setEditStartsAt("");
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : null}
                    </div>
                    {!slot.isBooked ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busyId === slot.id}
                          onClick={() => {
                            setEditingId(slot.id);
                            setEditStartsAt(
                              slot.startsAtLocal || toDatetimeLocalValue(slotDate(slot)),
                            );
                          }}
                        >
                          <Pencil className="size-3.5" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          disabled={busyId === slot.id}
                          onClick={() => void removeSlot(slot.id)}
                        >
                          <Trash2 className="size-3.5" />
                          Delete
                        </Button>
                      </div>
                    ) : (
                      <span className="text-[12px] text-amber-700">Protected booking</span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
