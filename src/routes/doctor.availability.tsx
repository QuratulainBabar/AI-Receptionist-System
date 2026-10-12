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
  doctorAvailabilityApi,
  doctorProfileApi,
  formatApiError,
  type ApiAvailabilityConfig,
  type ApiDateOverride,
  type ApiDoctorSlot,
  type ApiWeeklyHourSession,
  type ApiWeeklyHourSlot,
} from "@/lib/api";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Plus,
  Pencil,
  Trash2,
  Ban,
  Coffee,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/availability")({
  head: () => ({
    meta: [
      { title: "Availability — Doctor portal" },
      {
        name: "description",
        content:
          "Set weekly hours, date overrides, and bookable slots for patients and the phone AI receptionist.",
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

const SLOT_DURATIONS = [15, 30, 45, 60] as const;
type SlotDuration = (typeof SLOT_DURATIONS)[number];

const TABS = [
  { id: "schedule", label: "Weekly Schedule", icon: CalendarDays },
  { id: "calendar", label: "Calendar", icon: CalendarRange },
  { id: "dates", label: "Specific Dates & Breaks", icon: Coffee },
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
    slotDurationMinutes: 30,
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
      slotDurationMinutes: (SLOT_DURATIONS.includes(raw.slotDurationMinutes as SlotDuration)
        ? raw.slotDurationMinutes
        : 30) as SlotDuration,
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

function localDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [slots, setSlots] = useState<ApiDoctorSlot[]>([]);
  const [config, setConfig] = useState<ApiAvailabilityConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [clinicTimeZoneLabel, setClinicTimeZoneLabel] = useState("the clinic US time zone");

  const [weekCursor, setWeekCursor] = useState(() => startOfWeekMonday(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));

  const [rangeDate, setRangeDate] = useState(() => localDateKey(new Date()));
  const [rangeStart, setRangeStart] = useState("09:00");
  const [rangeEnd, setRangeEnd] = useState("12:00");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartsAt, setEditStartsAt] = useState("");

  const [copyFromDay, setCopyFromDay] = useState<string | null>(null);
  const [copyTargets, setCopyTargets] = useState<string[]>([]);

  const [overrideDate, setOverrideDate] = useState(() => localDateKey(new Date()));
  const [overrideType, setOverrideType] = useState<"unavailable" | "custom">("unavailable");
  const [overrideSessions, setOverrideSessions] = useState<ApiWeeklyHourSession[]>([
    { startTime: "09:00", endTime: "12:00" },
  ]);
  const [overrideBreaks, setOverrideBreaks] = useState<ApiWeeklyHourSession[]>([
    { startTime: "12:00", endTime: "13:00" },
  ]);

  async function refreshSlots() {
    const result = await doctorAvailabilityApi.list({ includeBooked: true });
    setSlots(result.slots);
    if (result.clinicTimeZoneLabel) setClinicTimeZoneLabel(result.clinicTimeZoneLabel);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([doctorAvailabilityApi.list({ includeBooked: true }), doctorProfileApi.get()])
      .then(([slotsResult, profileResult]) => {
        if (cancelled) return;
        setSlots(slotsResult.slots);
        if (slotsResult.clinicTimeZoneLabel) setClinicTimeZoneLabel(slotsResult.clinicTimeZoneLabel);
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

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekCursor, i)), [weekCursor]);

  const slotsByDate = useMemo(() => {
    const map = new Map<string, ApiDoctorSlot[]>();
    for (const slot of slots) {
      const key = localDateKey(slotDate(slot));
      const list = map.get(key) || [];
      list.push(slot);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => slotDate(a).getTime() - slotDate(b).getTime());
    }
    return map;
  }, [slots]);

  function updateDay(day: string, patch: Partial<ApiWeeklyHourSlot>) {
    setConfig((current) => ({
      ...current,
      days: current.days.map((row) => {
        if (row.day !== day) return row;
        const next = { ...row, ...patch };
        const sessions = next.sessions?.length
          ? next.sessions
          : [{ startTime: next.startTime, endTime: next.endTime }];
        return {
          ...next,
          sessions,
          startTime: sessions[0]?.startTime || next.startTime,
          endTime: sessions[0]?.endTime || next.endTime,
        };
      }),
    }));
    setSuccess("");
  }

  function updateSession(day: string, index: number, patch: Partial<ApiWeeklyHourSession>) {
    setConfig((current) => ({
      ...current,
      days: current.days.map((row) => {
        if (row.day !== day) return row;
        const sessions = (row.sessions || []).map((s, i) => (i === index ? { ...s, ...patch } : s));
        return {
          ...row,
          sessions,
          startTime: sessions[0]?.startTime || row.startTime,
          endTime: sessions[0]?.endTime || row.endTime,
        };
      }),
    }));
    setSuccess("");
  }

  function addSession(day: string) {
    setConfig((current) => ({
      ...current,
      days: current.days.map((row) => {
        if (row.day !== day) return row;
        const sessions = [...(row.sessions || []), { startTime: "14:00", endTime: "17:00" }];
        return { ...row, enabled: true, sessions };
      }),
    }));
  }

  function removeSession(day: string, index: number) {
    setConfig((current) => ({
      ...current,
      days: current.days.map((row) => {
        if (row.day !== day) return row;
        const sessions = (row.sessions || []).filter((_, i) => i !== index);
        const nextSessions = sessions.length ? sessions : [{ startTime: "09:00", endTime: "17:00" }];
        return {
          ...row,
          sessions: nextSessions,
          startTime: nextSessions[0]!.startTime,
          endTime: nextSessions[0]!.endTime,
          enabled: sessions.length > 0 ? row.enabled : false,
        };
      }),
    }));
  }

  function applyCopyToDays() {
    if (!copyFromDay || !copyTargets.length) return;
    const source = config.days.find((d) => d.day === copyFromDay);
    if (!source) return;
    setConfig((current) => ({
      ...current,
      days: current.days.map((row) => {
        if (!copyTargets.includes(row.day)) return row;
        const sessions = (source.sessions || []).map((s) => ({ ...s }));
        return {
          ...row,
          enabled: source.enabled,
          startTime: sessions[0]?.startTime || source.startTime,
          endTime: sessions[0]?.endTime || source.endTime,
          sessions,
        };
      }),
    }));
    setCopyFromDay(null);
    setCopyTargets([]);
    setSuccess(`Copied ${copyFromDay} schedule to ${copyTargets.length} day${copyTargets.length === 1 ? "" : "s"}.`);
  }

  function validateConfigLocal(): string | null {
    for (const day of config.days) {
      if (!day.enabled) continue;
      const msg = validateSessions(day.sessions || []);
      if (msg) return `${day.day}: ${msg}`;
    }
    if (config.scheduleFrom && config.scheduleTo && config.scheduleFrom > config.scheduleTo) {
      return "Schedule end date must be on or after the start date.";
    }
    return null;
  }

  async function saveConfig(andGenerate = false) {
    const validation = validateConfigLocal();
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const payload: ApiAvailabilityConfig = {
        version: 2,
        slotDurationMinutes: config.slotDurationMinutes,
        scheduleFrom: config.scheduleFrom || null,
        scheduleTo: config.scheduleTo || null,
        days: config.days.map((day) => {
          const sessions = day.enabled
            ? day.sessions && day.sessions.length
              ? day.sessions
              : [{ startTime: day.startTime, endTime: day.endTime }]
            : day.sessions?.length
              ? day.sessions
              : [{ startTime: "09:00", endTime: "17:00" }];
          return {
            day: day.day,
            enabled: day.enabled,
            startTime: sessions[0]?.startTime || "09:00",
            endTime: sessions[0]?.endTime || "17:00",
            sessions,
          };
        }),
        dateOverrides: config.dateOverrides || [],
      };
      const result = await doctorProfileApi.update({ availabilityConfig: payload });
      setConfig(normalizeConfig(result.profile.availabilityConfig, result.profile.weeklyHours));
      if (andGenerate) {
        const gen = await doctorAvailabilityApi.generate(2, true);
        await refreshSlots();
        setSuccess(
          gen.message ||
            `Schedule saved. Created ${gen.created} open slot${gen.created === 1 ? "" : "s"} for the phone agent.`,
        );
      } else {
        await refreshSlots();
        setSuccess(result.message || "Availability schedule saved.");
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to save availability."));
    } finally {
      setSaving(false);
    }
  }

  async function createRangeSlots() {
    if (!rangeDate || !rangeStart || !rangeEnd) {
      setError("Choose a date and start/end time.");
      return;
    }
    if (rangeStart >= rangeEnd) {
      setError("End time must be after start time.");
      return;
    }
    setBusyId("range");
    setError("");
    setSuccess("");
    try {
      const result = await doctorAvailabilityApi.createRange({
        date: rangeDate,
        startTime: rangeStart,
        endTime: rangeEnd,
        durationMinutes: config.slotDurationMinutes as SlotDuration,
      });
      await refreshSlots();
      setSuccess(result.message || `Created ${result.created} slot${result.created === 1 ? "" : "s"}.`);
      setActiveTab("calendar");
      setSelectedDate(new Date(`${rangeDate}T12:00:00`));
      setWeekCursor(startOfWeekMonday(new Date(`${rangeDate}T12:00:00`)));
    } catch (err) {
      setError(formatApiError(err, "Unable to create slots for that range."));
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

  function upsertOverride() {
    if (!overrideDate) {
      setError("Choose a date for the override.");
      return;
    }
    if (overrideType === "custom") {
      const msg = validateSessions(overrideSessions);
      if (msg) {
        setError(msg);
        return;
      }
      for (const br of overrideBreaks) {
        if (br.startTime >= br.endTime) {
          setError("Each break end time must be after its start.");
          return;
        }
      }
    }
    setConfig((current) => {
      const rest = (current.dateOverrides || []).filter((o) => o.date !== overrideDate);
      const next: ApiDateOverride = {
        date: overrideDate,
        type: overrideType,
        sessions: overrideType === "custom" ? overrideSessions.map((s) => ({ ...s })) : [],
        breaks: overrideType === "custom" ? overrideBreaks.map((s) => ({ ...s })) : [],
      };
      return {
        ...current,
        dateOverrides: [...rest, next].sort((a, b) => a.date.localeCompare(b.date)),
      };
    });
    setSuccess(
      overrideType === "unavailable"
        ? `${overrideDate} marked unavailable. Save schedule to apply.`
        : `Custom hours saved for ${overrideDate}. Save schedule to apply.`,
    );
    setError("");
  }

  function removeOverride(date: string) {
    setConfig((current) => ({
      ...current,
      dateOverrides: (current.dateOverrides || []).filter((o) => o.date !== date),
    }));
    setSuccess(`Removed override for ${date}. Save schedule to apply.`);
  }

  const selectedKey = localDateKey(selectedDate);
  const selectedSlots = slotsByDate.get(selectedKey) || [];
  const selectedOverride = (config.dateOverrides || []).find((o) => o.date === selectedKey);

  return (
    <div className="w-full max-w-full">
      <PageHeader
        title="Availability slots"
        description="Set your usual weekly hours, then generate or add the open slots patients and the phone receptionist can book."
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <Panel className="mb-5 border border-sky-100 bg-sky-50/60 p-1.5">
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
                  "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold transition-all",
                  active
                    ? "bg-white text-blue-700 shadow-sm ring-1 ring-sky-200"
                    : "text-slate-600 hover:bg-white/70 hover:text-slate-900",
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
        Times use {clinicTimeZoneLabel}. Booked appointments are never overwritten when you regenerate open slots.
      </p>

      {loading ? (
        <EmptyNote>Loading availability…</EmptyNote>
      ) : activeTab === "schedule" ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Panel className="border border-sky-100 bg-sky-50/40 p-4">
              <SectionLabel>Slot duration</SectionLabel>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-sky-200/80 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/25"
                value={config.slotDurationMinutes}
                onChange={(e) =>
                  setConfig((c) => ({
                    ...c,
                    slotDurationMinutes: Number(e.target.value) as SlotDuration,
                  }))
                }
              >
                {SLOT_DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </Panel>
            <Panel className="border border-sky-100 bg-sky-50/40 p-4">
              <SectionLabel>Schedule starts</SectionLabel>
              <Input
                type="date"
                className="mt-2 bg-white"
                value={config.scheduleFrom || ""}
                onChange={(e) => setConfig((c) => ({ ...c, scheduleFrom: e.target.value || null }))}
              />
            </Panel>
            <Panel className="border border-sky-100 bg-sky-50/40 p-4">
              <SectionLabel>Schedule ends</SectionLabel>
              <Input
                type="date"
                className="mt-2 bg-white"
                value={config.scheduleTo || ""}
                onChange={(e) => setConfig((c) => ({ ...c, scheduleTo: e.target.value || null }))}
              />
            </Panel>
            <Panel className="flex flex-col justify-end gap-2 border border-sky-100 bg-sky-50/40 p-4">
              <Button variant="outline" onClick={() => void saveConfig(false)} disabled={saving}>
                {saving ? "Saving…" : "Save schedule"}
              </Button>
              <Button onClick={() => void saveConfig(true)} disabled={saving}>
                {saving ? "Saving…" : "Save & generate slots"}
              </Button>
            </Panel>
          </div>

          <Panel className="overflow-hidden border border-sky-100 p-0">
            <div className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-blue-50/50 px-5 py-4">
              <h3 className="text-[15px] font-semibold text-slate-900">Weekly hours</h3>
              <p className="mt-0.5 text-[12.5px] text-slate-500">
                Enable days and add multiple sessions (e.g. morning and afternoon). Copy a day to others when ready.
              </p>
            </div>
            <div className="divide-y divide-sky-100/80">
              {config.days.map((day) => {
                const sessions = day.sessions?.length
                  ? day.sessions
                  : [{ startTime: day.startTime, endTime: day.endTime }];
                return (
                  <div
                    key={day.day}
                    className={cn(
                      "px-5 py-4 transition-colors",
                      day.enabled ? "bg-white" : "bg-slate-50/80",
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <ToggleSwitch
                        checked={day.enabled}
                        onChange={(enabled) => updateDay(day.day, { enabled })}
                      />
                      <div className="min-w-[7.5rem] text-[14px] font-semibold text-slate-900">{day.day}</div>
                      {!day.enabled ? (
                        <Badge className="bg-slate-100 text-slate-500">Closed</Badge>
                      ) : (
                        <span className="text-[12px] text-slate-500">
                          {sessions.length} session{sessions.length === 1 ? "" : "s"}
                        </span>
                      )}
                      <div className="ml-auto flex flex-wrap gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!day.enabled}
                          onClick={() => {
                            setCopyFromDay(day.day);
                            setCopyTargets(WEEKDAYS.filter((d) => d !== day.day) as string[]);
                          }}
                        >
                          <Copy className="size-3.5" />
                          Copy
                        </Button>
                        <Button
                          variant="soft"
                          size="sm"
                          disabled={!day.enabled}
                          onClick={() => addSession(day.day)}
                        >
                          <Plus className="size-3.5" />
                          Add session
                        </Button>
                      </div>
                    </div>

                    {day.enabled ? (
                      <div className="mt-3 space-y-2 pl-0 sm:pl-14">
                        {sessions.map((session, index) => (
                          <div
                            key={`${day.day}-${index}`}
                            className="flex flex-wrap items-end gap-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3"
                          >
                            <Field label="Start">
                              <Input
                                type="time"
                                value={session.startTime}
                                onChange={(e) => updateSession(day.day, index, { startTime: e.target.value })}
                              />
                            </Field>
                            <Field label="End">
                              <Input
                                type="time"
                                value={session.endTime}
                                onChange={(e) => updateSession(day.day, index, { endTime: e.target.value })}
                              />
                            </Field>
                            <div className="pb-1 text-[12px] font-medium text-slate-500">
                              {timeToLabel(session.startTime)} – {timeToLabel(session.endTime)}
                            </div>
                            {sessions.length > 1 ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="ml-auto text-red-600"
                                onClick={() => removeSession(day.day, index)}
                              >
                                <Trash2 className="size-3.5" />
                                Remove
                              </Button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </Panel>

          {copyFromDay ? (
            <Panel className="border border-blue-200 bg-blue-50/40 p-5">
              <SectionLabel>Copy “{copyFromDay}” to</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-2">
                {WEEKDAYS.filter((d) => d !== copyFromDay).map((day) => {
                  const checked = copyTargets.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setCopyTargets((current) =>
                          checked ? current.filter((d) => d !== day) : [...current, day],
                        )
                      }
                      className={cn(
                        "rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors",
                        checked
                          ? "bg-blue-600 text-white"
                          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-sky-50",
                      )}
                    >
                      {day.slice(0, 3)}
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={applyCopyToDays} disabled={!copyTargets.length}>
                  Apply copy
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setCopyFromDay(null);
                    setCopyTargets([]);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </Panel>
          ) : null}

          <Panel className="border border-sky-100 bg-sky-50/30 p-5">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="size-4 text-blue-600" />
              <h3 className="text-[14px] font-semibold text-slate-900">Add availability for a date</h3>
            </div>
            <p className="mb-4 text-[12.5px] text-slate-500">
              Creates bookable slots between the start and end times using your slot duration. Existing booked
              appointments are left untouched.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
              <Field label="Date">
                <Input type="date" value={rangeDate} onChange={(e) => setRangeDate(e.target.value)} />
              </Field>
              <Field label="Start">
                <Input type="time" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} />
              </Field>
              <Field label="End">
                <Input type="time" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} />
              </Field>
              <Field label="Duration">
                <Input value={`${config.slotDurationMinutes} min`} disabled />
              </Field>
              <Button onClick={() => void createRangeSlots()} disabled={busyId === "range"}>
                <Plus className="size-4" />
                {busyId === "range" ? "Adding…" : "Add slots"}
              </Button>
            </div>
          </Panel>
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
                const override = (config.dateOverrides || []).find((o) => o.date === key);
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
                      override?.type === "unavailable" && "bg-slate-50",
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
                      {override?.type === "unavailable" ? (
                        <Badge className="bg-slate-200 text-slate-600">Off</Badge>
                      ) : null}
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
                {selectedOverride ? (
                  <p className="mt-1 text-[12.5px] text-slate-500">
                    {selectedOverride.type === "unavailable"
                      ? "Marked unavailable in weekly exceptions."
                      : "Custom hours override for this date."}
                  </p>
                ) : null}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setRangeDate(selectedKey);
                  setActiveTab("schedule");
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
      ) : (
        <div className="space-y-5">
          <Panel className="border border-sky-100 p-5">
            <h3 className="text-[15px] font-semibold text-slate-900">Date exceptions</h3>
            <p className="mt-1 text-[12.5px] text-slate-500">
              Mark a day off, or set custom hours and breaks that override the weekly template when you generate
              slots.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
              <Field label="Date">
                <Input type="date" value={overrideDate} onChange={(e) => setOverrideDate(e.target.value)} />
              </Field>
              <Field label="Type">
                <select
                  className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/25"
                  value={overrideType}
                  onChange={(e) => setOverrideType(e.target.value as "unavailable" | "custom")}
                >
                  <option value="unavailable">Unavailable (day off)</option>
                  <option value="custom">Custom hours + breaks</option>
                </select>
              </Field>
              <div className="lg:col-span-2">
                <Button onClick={upsertOverride}>
                  {overrideType === "unavailable" ? (
                    <>
                      <Ban className="size-4" />
                      Mark unavailable
                    </>
                  ) : (
                    <>
                      <Plus className="size-4" />
                      Save date override
                    </>
                  )}
                </Button>
              </div>
            </div>

            {overrideType === "custom" ? (
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <div>
                  <SectionLabel>Sessions</SectionLabel>
                  <div className="mt-2 space-y-2">
                    {overrideSessions.map((session, index) => (
                      <div key={`os-${index}`} className="flex flex-wrap items-end gap-2 rounded-xl border border-sky-100 bg-sky-50/50 p-3">
                        <Field label="Start">
                          <Input
                            type="time"
                            value={session.startTime}
                            onChange={(e) =>
                              setOverrideSessions((rows) =>
                                rows.map((s, i) => (i === index ? { ...s, startTime: e.target.value } : s)),
                              )
                            }
                          />
                        </Field>
                        <Field label="End">
                          <Input
                            type="time"
                            value={session.endTime}
                            onChange={(e) =>
                              setOverrideSessions((rows) =>
                                rows.map((s, i) => (i === index ? { ...s, endTime: e.target.value } : s)),
                              )
                            }
                          />
                        </Field>
                        {overrideSessions.length > 1 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setOverrideSessions((rows) => rows.filter((_, i) => i !== index))}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    ))}
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() =>
                        setOverrideSessions((rows) => [...rows, { startTime: "14:00", endTime: "17:00" }])
                      }
                    >
                      <Plus className="size-3.5" />
                      Add session
                    </Button>
                  </div>
                </div>
                <div>
                  <SectionLabel>Breaks</SectionLabel>
                  <div className="mt-2 space-y-2">
                    {overrideBreaks.map((br, index) => (
                      <div key={`ob-${index}`} className="flex flex-wrap items-end gap-2 rounded-xl border border-amber-100 bg-amber-50/40 p-3">
                        <Field label="Start">
                          <Input
                            type="time"
                            value={br.startTime}
                            onChange={(e) =>
                              setOverrideBreaks((rows) =>
                                rows.map((s, i) => (i === index ? { ...s, startTime: e.target.value } : s)),
                              )
                            }
                          />
                        </Field>
                        <Field label="End">
                          <Input
                            type="time"
                            value={br.endTime}
                            onChange={(e) =>
                              setOverrideBreaks((rows) =>
                                rows.map((s, i) => (i === index ? { ...s, endTime: e.target.value } : s)),
                              )
                            }
                          />
                        </Field>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setOverrideBreaks((rows) => rows.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="soft"
                      size="sm"
                      onClick={() =>
                        setOverrideBreaks((rows) => [...rows, { startTime: "12:00", endTime: "13:00" }])
                      }
                    >
                      <Plus className="size-3.5" />
                      Add break
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel className="border border-sky-100 p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold text-slate-900">Saved overrides</h3>
              <Button size="sm" onClick={() => void saveConfig(true)} disabled={saving}>
                {saving ? "Saving…" : "Save & generate slots"}
              </Button>
            </div>
            {!(config.dateOverrides || []).length ? (
              <EmptyNote>No date overrides yet.</EmptyNote>
            ) : (
              <div className="space-y-2">
                {(config.dateOverrides || []).map((row) => (
                  <div
                    key={row.date}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-100 bg-white px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-slate-900">
                        {new Date(`${row.date}T12:00:00`).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </div>
                      <div className="text-[12.5px] text-slate-500">
                        {row.type === "unavailable"
                          ? "Unavailable all day"
                          : [
                              ...(row.sessions || []).map(
                                (s) => `${timeToLabel(s.startTime)}–${timeToLabel(s.endTime)}`,
                              ),
                              ...(row.breaks || []).map(
                                (s) => `break ${timeToLabel(s.startTime)}–${timeToLabel(s.endTime)}`,
                              ),
                            ].join(" · ") || "Custom hours"}
                      </div>
                    </div>
                    <Badge
                      className={
                        row.type === "unavailable"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-blue-100 text-blue-800"
                      }
                    >
                      {row.type === "unavailable" ? "Day off" : "Custom"}
                    </Badge>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => removeOverride(row.date)}>
                      <Trash2 className="size-3.5" />
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}
    </div>
  );
}

function sameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
