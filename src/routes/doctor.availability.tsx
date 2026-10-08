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
  type ApiDoctorSlot,
  type ApiWeeklyHourSlot,
} from "@/lib/api";
import {
  CalendarDays,
  Clock as ClockIcon,
  CalendarClock,
  List,
  Settings as SettingsIcon,
  ChevronLeft,
  ChevronRight,
  Timer,
  Hourglass,
  CalendarRange,
  SlidersHorizontal,
  Search,
  Download,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/availability")({
  head: () => ({
    meta: [
      { title: "Availability — Doctor portal" },
      {
        name: "description",
        content: "Set weekly hours and manage open appointment slots patients and the phone AI can book.",
      },
    ],
  }),
  component: DoctorAvailabilityPage,
});

const TABS = [
  { id: "schedule", label: "Weekly Schedule", icon: <CalendarDays className="size-[17px]" strokeWidth={2} /> },
  { id: "slots", label: "Open Slots", icon: <ClockIcon className="size-[17px]" strokeWidth={2} /> },
  { id: "appointments", label: "Appointment List", icon: <List className="size-[17px]" strokeWidth={2} /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon className="size-[17px]" strokeWidth={2} /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

const DEFAULT_WEEKLY_HOURS: ApiWeeklyHourSlot[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
].map((day) => ({
  day,
  enabled: day !== "Saturday" && day !== "Sunday",
  startTime: "09:00",
  endTime: "17:00",
}));

const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function slotInputValue(slot: ApiDoctorSlot) {
  return slot.startsAtLocal || "";
}

function timeToLabel(t: string) {
  try {
    const [hStr, mStr] = t.split(":") as [string, string];
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const ampm = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mm = m === 0 ? "00" : String(m).padStart(2, "0");
    return `${h12}:${mm} ${ampm}`;
  } catch {
    return t;
  }
}

function hoursBetween(start24: string, end24: string) {
  try {
    const [sh, sm] = start24.split(":").map(Number) as [number, number];
    const [eh, em] = end24.split(":").map(Number) as [number, number];
    const diffMin = eh * 60 + em - (sh * 60 + sm);
    if (diffMin <= 0) return "0h";
    const hrs = Math.floor(diffMin / 60);
    const mins = diffMin % 60;
    if (mins === 0) return `${hrs}h`;
    return `${hrs}h ${mins}m`;
  } catch {
    return "8h";
  }
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
      style={
        checked
          ? { background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)" }
          : undefined
      }
    >
      <span
        className={cn(
          "pointer-events-none inline-block size-[18px] transform rounded-full bg-white ring-0 shadow transition duration-200 ease-in-out mt-0",
          checked ? "translate-x-[18px]" : "translate-x-0",
        )}
        style={{
          boxShadow: checked ? "0 1px 6px -2px rgba(37, 99, 235, 0.5)" : "0 1px 2px rgba(15,23,42,0.15)",
        }}
      />
    </button>
  );
}

function DoctorAvailabilityPage() {
  const [activeTab, setActiveTab] = useState<TabId>("schedule");
  const [slots, setSlots] = useState<ApiDoctorSlot[]>([]);
  const [weeklyHours, setWeeklyHours] = useState<ApiWeeklyHourSlot[]>(DEFAULT_WEEKLY_HOURS);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingHours, setSavingHours] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [clinicTimeZoneLabel, setClinicTimeZoneLabel] = useState("the clinic US time zone");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartsAt, setEditStartsAt] = useState("");

  const [monthCursor, setMonthCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const [slotDuration, setSlotDuration] = useState("15 minutes");
  const [bufferTime, setBufferTime] = useState("10 minutes");
  const [maxAdvance, setMaxAdvance] = useState("30 days");
  const [slotSearch, setSlotSearch] = useState("");

  async function refreshSlots() {
    const result = await doctorAvailabilityApi.list();
    setSlots(result.slots);
    if (result.clinicTimeZoneLabel) setClinicTimeZoneLabel(result.clinicTimeZoneLabel);
  }

  useEffect(() => {
    let cancelled = false;
    void Promise.all([doctorAvailabilityApi.list(), doctorProfileApi.get()])
      .then(([slotsResult, profileResult]) => {
        if (cancelled) return;
        setSlots(slotsResult.slots);
        if (slotsResult.clinicTimeZoneLabel) setClinicTimeZoneLabel(slotsResult.clinicTimeZoneLabel);
        const hours = profileResult.profile.weeklyHours;
        setWeeklyHours(
          Array.isArray(hours) && hours.length > 0 ? hours : DEFAULT_WEEKLY_HOURS,
        );
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

  const grouped = useMemo(() => {
    const map = new Map<string, ApiDoctorSlot[]>();
    for (const slot of slots) {
      const key = slot.date;
      const list = map.get(key) || [];
      list.push(slot);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [slots]);

  const filteredSlots = useMemo(() => {
    if (!slotSearch.trim()) return slots;
    const q = slotSearch.toLowerCase();
    return slots.filter((s) =>
      `${s.date} ${s.time} ${s.isBooked ? "booked" : "available"} ${s.patientName ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [slots, slotSearch]);

  const slotsTableData = useMemo(() => {
    return filteredSlots
      .slice()
      .sort((a, b) => {
        const da = new Date(a.startsAt || a.date + " " + a.time).getTime();
        const db = new Date(b.startsAt || b.date + " " + b.time).getTime();
        return da - db;
      })
      .map((slot) => {
        const d = new Date(slot.startsAt || slot.date + "T00:00:00");
        const dateStr = d.toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        });
        const dow = d.toLocaleDateString("en-US", { weekday: "long" });
        const start = slot.time;
        const startD = new Date(slot.startsAt || slot.date + " " + start);
        const endD = new Date(startD.getTime() + 15 * 60000);
        const end = endD.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        });
        return {
          slot,
          date: dateStr,
          day: dow,
          time: `${start} – ${end}`,
          duration: slotDuration,
        };
      });
  }, [filteredSlots, slotDuration]);

  function updateWeeklyHour(day: string, patch: Partial<ApiWeeklyHourSlot>) {
    setWeeklyHours((current) =>
      current.map((slot) => (slot.day === day ? { ...slot, ...patch } : slot)),
    );
    setSuccess("");
  }

  async function saveWeeklyHours() {
    setSavingHours(true);
    setError("");
    setSuccess("");
    try {
      const result = await doctorProfileApi.update({ weeklyHours });
      const hours = result.profile.weeklyHours;
      setWeeklyHours(Array.isArray(hours) && hours.length > 0 ? hours : DEFAULT_WEEKLY_HOURS);
      setSuccess("Weekly hours saved. Bookable slots were generated for the phone agent.");
    } catch (err) {
      setError(formatApiError(err, "Unable to save weekly hours."));
    } finally {
      setSavingHours(false);
    }
  }

  async function createSlot() {
    if (!newStartsAt) {
      setError("Choose a date and time for the new slot.");
      return;
    }
    setBusyId("create");
    setError("");
    setSuccess("");
    try {
      await doctorAvailabilityApi.create(newStartsAt);
      setNewStartsAt("");
      await refreshSlots();
      setSuccess("Slot created.");
    } catch (err) {
      setError(formatApiError(err, "Unable to create slot."));
    } finally {
      setBusyId(null);
    }
  }

  async function generateSlots() {
    setBusyId("generate");
    setError("");
    setSuccess("");
    try {
      const result = await doctorAvailabilityApi.generate(2);
      await refreshSlots();
      setSuccess(result.message || `Created ${result.created} slots.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to generate slots from weekly hours."));
    } finally {
      setBusyId(null);
    }
  }

  async function saveEdit(slotId: string) {
    if (!editStartsAt) return;
    setBusyId(slotId);
    setError("");
    setSuccess("");
    try {
      await doctorAvailabilityApi.update(slotId, editStartsAt);
      setEditingId(null);
      await refreshSlots();
      setSuccess("Slot updated.");
    } catch (err) {
      setError(formatApiError(err, "Unable to update slot."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeSlot(slotId: string) {
    setBusyId(slotId);
    setError("");
    setSuccess("");
    try {
      await doctorAvailabilityApi.remove(slotId);
      await refreshSlots();
      setSuccess("Slot removed.");
    } catch (err) {
      setError(formatApiError(err, "Unable to remove slot."));
    } finally {
      setBusyId(null);
    }
  }

  const monthLabel = monthCursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const monthDays = useMemo(() => {
    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const startDow = first.getDay();
    const totalDays = last.getDate();
    const out: Array<{ date: Date | null; key: string }> = [];
    for (let i = 0; i < startDow; i++) out.push({ date: null, key: `pre-${i}` });
    for (let d = 1; d <= totalDays; d++) {
      out.push({ date: new Date(year, month, d), key: `day-${d}` });
    }
    while (out.length % 7 !== 0) out.push({ date: null, key: `post-${out.length}` });
    return out;
  }, [monthCursor]);

  const todayDate = new Date();
  const todayKey = `${todayDate.getFullYear()}-${todayDate.getMonth()}-${todayDate.getDate()}`;

  const weeklyHoursByDay = useMemo(() => {
    const map = new Map<string, ApiWeeklyHourSlot>();
    for (const h of weeklyHours) map.set(h.day, h);
    return map;
  }, [weeklyHours]);

  function hasBookingOn(d: Date) {
    const label = d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const label2 = d.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    for (const [dateKey] of grouped) {
      if (dateKey.includes(label.slice(0, 3)) || label2.includes(dateKey) || dateKey === label || dateKey === label2) {
        return true;
      }
    }
    const iso = d.toISOString().slice(0, 10);
    const slotsOnDate = slots.filter((s) => s.startsAt?.slice(0, 10) === iso);
    return slotsOnDate.length > 0;
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <div className="mb-5">
        <PageHeader
          title="Availability slots"
          description="Set your usual weekly hours, then generate or add the open slots patients and the phone receptionist can book."
          actions={
            <Button onClick={() => void generateSlots()} disabled={busyId === "generate" || loading}>
              <CalendarClock className="size-[17px]" strokeWidth={2} />
              {busyId === "generate" ? "Generating…" : "Generate 2 weeks"}
            </Button>
          }
        />
      </div>

      <Panel className="mb-6 p-1.5 w-full max-w-full overflow-hidden">
        <div className="flex flex-wrap gap-1.5 w-full">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2.5 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all",
                  active
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40",
                )}
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg, rgba(59, 130, 246, 0.14) 0%, rgba(37, 99, 235, 0.06) 100%)",
                        boxShadow: "inset 0 0 0 1px rgba(59, 130, 246, 0.2)",
                      }
                    : undefined
                }
              >
                <span className={active ? "text-primary" : "text-muted-foreground/80"}>
                  {tab.icon}
                </span>
                <span>{tab.label}</span>
                {active ? (
                  <span
                    aria-hidden
                    className="mx-auto h-0.5 w-6 rounded-full"
                    style={{
                      background: "linear-gradient(90deg, #2563EB, #1D4ED8)",
                      position: "relative",
                      marginBottom: "-2px",
                    }}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </Panel>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-primary">{success}</p> : null}

      {activeTab === "schedule" ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2 mb-6 w-full max-w-full overflow-hidden">
            <Panel className="p-4 w-full max-w-full overflow-hidden">
              <div className="flex items-center justify-between mb-6">
                <h2
                  className="font-[--font-display] font-bold tracking-tight text-foreground"
                  style={{ fontSize: "1.35rem" }}
                >
                  {monthLabel}
                </h2>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setMonthCursor(
                        new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1),
                      )
                    }
                    className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronLeft className="size-4.5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setMonthCursor(
                        new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1),
                      )
                    }
                    className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                  >
                    <ChevronRight className="size-4.5" strokeWidth={2} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2 w-full max-w-full overflow-hidden">
                {DOWS.map((d) => (
                  <div
                    key={d}
                    className="py-1.5 text-center text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate"
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1 w-full max-w-full overflow-hidden">
                {monthDays.map((cell) => {
                  if (!cell.date)
                    return <div key={cell.key} className="h-10 rounded-lg w-full" />;
                  const d = cell.date;
                  const dKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
                  const isToday = dKey === todayKey;
                  const dowName = DAY_ORDER[d.getDay()!];
                  const avail = weeklyHoursByDay.get(dowName!)?.enabled ?? false;
                  const hasSlots = hasBookingOn(d);
                  return (
                    <div
                      key={cell.key}
                      className={cn(
                        "relative h-10 w-full grid place-items-center rounded-lg text-[12.5px] font-medium transition-all overflow-hidden",
                        isToday
                          ? "text-white shadow-md shadow-blue-500/30"
                          : avail
                            ? "text-foreground hover:bg-blue-50 cursor-pointer"
                            : "text-muted-foreground/60",
                      )}
                      style={
                        isToday
                          ? { background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #1E40AF 100%)" }
                          : undefined
                      }
                    >
                      {d.getDate()}
                      {avail || hasSlots ? (
                        <span
                          className="absolute bottom-1 size-1 rounded-full"
                          style={{
                            background: isToday
                              ? "rgba(255,255,255,0.9)"
                              : hasSlots
                                ? "#2563EB"
                                : "#93C5FD",
                          }}
                        />
                      ) : null}
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-5 text-[12px]">
                <div className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#2563EB]" />
                  <span className="text-muted-foreground">Available</span>
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#93C5FD]" />
                  <span className="text-muted-foreground">Partially filled</span>
                </div>
                <div className="inline-flex items-center gap-2">
                  <span className="size-2 rounded-full bg-[#94A3B8]" />
                  <span className="text-muted-foreground">Fully booked</span>
                </div>
              </div>
            </Panel>

            <Panel className="p-4 w-full max-w-full overflow-hidden">
              <div className="flex items-center justify-between mb-5">
                <h2
                  className="font-[--font-display] font-bold tracking-tight text-foreground"
                  style={{ fontSize: "1.25rem" }}
                >
                  Weekly Schedule
                </h2>
                <button
                  type="button"
                  onClick={() => void saveWeeklyHours()}
                  disabled={savingHours || loading}
                  className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-semibold text-primary transition-all hover:bg-blue-50 disabled:opacity-50"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.05))",
                    border: "1px solid rgba(59, 130, 246, 0.2)",
                  }}
                >
                  <Pencil className="size-4" strokeWidth={2} />
                  {savingHours ? "Saving…" : "Edit Schedule"}
                </button>
              </div>

              <div className="space-y-1.5">
                {weeklyHours.map((slot, i) => {
                  const active = slot.enabled;
                  return (
                    <div
                      key={slot.day}
                      className={cn(
                        "flex flex-wrap items-center gap-x-2.5 gap-y-2 rounded-xl px-3 py-3 transition-all",
                        active && i === 2
                          ? "bg-blue-50/70 ring-1 ring-blue-200/70"
                          : "hover:bg-muted/30",
                      )}
                    >
                      <div
                        className={cn(
                          "w-[5.75rem] shrink-0 text-[13.5px] font-semibold",
                          active ? "text-foreground" : "text-muted-foreground",
                          i === 2 && active ? "text-primary" : undefined,
                        )}
                      >
                        {slot.day}
                      </div>
                      <ToggleSwitch
                        checked={slot.enabled}
                        onChange={(v) => updateWeeklyHour(slot.day, { enabled: v })}
                      />
                      <div className="flex min-w-[20.5rem] flex-1 items-center gap-1.5">
                        {active ? (
                          <>
                            <Input
                              type="time"
                              aria-label={`${slot.day} start time`}
                              className="h-9 w-[9.75rem] shrink-0 px-2 text-[13px]"
                              value={slot.startTime}
                              onChange={(e) =>
                                updateWeeklyHour(slot.day, { startTime: e.target.value })
                              }
                            />
                            <span className="shrink-0 text-[12px] text-muted-foreground">–</span>
                            <Input
                              type="time"
                              aria-label={`${slot.day} end time`}
                              className="h-9 w-[9.75rem] shrink-0 px-2 text-[13px]"
                              value={slot.endTime}
                              onChange={(e) =>
                                updateWeeklyHour(slot.day, { endTime: e.target.value })
                              }
                            />
                          </>
                        ) : (
                          <span className="text-[13px] font-medium text-muted-foreground">–</span>
                        )}
                      </div>
                      <div className="ml-auto flex items-center gap-1">
                        <span
                          className={cn(
                            "w-8 text-right text-[12px] font-bold",
                            active ? "text-muted-foreground" : "text-muted-foreground/60",
                          )}
                        >
                          {active ? hoursBetween(slot.startTime, slot.endTime) : "0h"}
                        </span>
                        <button
                          type="button"
                          className="grid size-6 place-items-center rounded-lg text-muted-foreground/60 hover:bg-secondary hover:text-foreground"
                        >
                          <ChevronRight className="size-3.5" strokeWidth={2.25} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          <div className="grid gap-3 mb-5 md:grid-cols-2 xl:grid-cols-4 w-full max-w-full overflow-hidden">
            <SettingsCard
              icon={<Timer className="size-5" strokeWidth={2} />}
              label="Slot Duration"
              value={slotDuration}
              options={["10 minutes", "15 minutes", "20 minutes", "30 minutes", "45 minutes", "60 minutes"]}
              onChange={setSlotDuration}
            />
            <SettingsCard
              icon={<Hourglass className="size-5" strokeWidth={2} />}
              label="Buffer Time"
              value={bufferTime}
              options={["0 minutes", "5 minutes", "10 minutes", "15 minutes", "20 minutes"]}
              onChange={setBufferTime}
            />
            <SettingsCard
              icon={<CalendarRange className="size-5" strokeWidth={2} />}
              label="Max Booking Advance"
              value={maxAdvance}
              options={["7 days", "14 days", "30 days", "60 days", "90 days"]}
              onChange={setMaxAdvance}
            />
            <Panel className="p-4 flex items-center justify-between group cursor-pointer transition-all w-full max-w-full overflow-hidden min-w-0">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div
                  className="grid size-10 shrink-0 place-items-center rounded-2xl text-primary"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(37, 99, 235, 0.06))",
                  }}
                >
                  <SlidersHorizontal className="size-5" strokeWidth={2} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-muted-foreground mb-1">
                    Advanced Filters
                  </p>
                  <p className="truncate text-[13px] font-semibold text-foreground">
                    Configure rules
                  </p>
                </div>
              </div>
              <ChevronRight
                className="size-4.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                strokeWidth={2}
              />
            </Panel>
          </div>

          <Panel className="p-4 w-full max-w-full overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
              <div className="flex items-center gap-3.5">
                <div
                  className="grid size-11 shrink-0 place-items-center rounded-2xl text-primary"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(37, 99, 235, 0.06))",
                  }}
                >
                  <CalendarDays className="size-5" strokeWidth={2} />
                </div>
                <div>
                  <h2
                    className="font-[--font-display] font-bold tracking-tight text-foreground"
                    style={{ fontSize: "1.2rem" }}
                  >
                    Available Appointment Slots
                  </h2>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative w-full max-w-full">
                  <Search
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
                    strokeWidth={2}
                  />
                  <input
                    type="text"
                    value={slotSearch}
                    onChange={(e) => setSlotSearch(e.target.value)}
                    placeholder="Search time slots..."
                    className="h-10 w-56 max-w-full rounded-xl border-2 border-transparent bg-input-fill pl-10 pr-4 text-[13px] text-foreground placeholder:text-muted-foreground/60 transition-all focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:outline-none"
                    style={{ boxShadow: "inset 0 1px 2px 0 rgba(15, 23, 42, 0.03)" }}
                  />
                </div>
                <Button variant="outline">
                  <Download className="size-4" strokeWidth={2} />
                  Export
                </Button>
              </div>
            </div>

            {loading ? (
              <EmptyNote>Loading slots…</EmptyNote>
            ) : slotsTableData.length === 0 ? (
              <EmptyNote>
                No slots yet. Save weekly hours above, generate 2 weeks, or add a slot manually.
              </EmptyNote>
            ) : (
              <div className="overflow-x-auto w-full max-w-full -mx-1">
                <table className="w-full min-w-[720px] table-fixed">
                  <thead>
                    <tr
                      className="border-b"
                      style={{ borderColor: "#EEF2F7" }}
                    >
                      <th className="w-[44px] px-5 py-3.5">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-border accent-blue-600"
                        />
                      </th>
                      <th className="px-3 py-3.5 text-left">
                        <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                          Date
                        </SectionLabel>
                      </th>
                      <th className="px-3 py-3.5 text-left">
                        <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                          Day
                        </SectionLabel>
                      </th>
                      <th className="px-3 py-3.5 text-left">
                        <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                          Time
                        </SectionLabel>
                      </th>
                      <th className="px-3 py-3.5 text-left">
                        <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                          Duration
                        </SectionLabel>
                      </th>
                      <th className="px-3 py-3.5 text-left">
                        <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                          Status
                        </SectionLabel>
                      </th>
                      <th className="px-5 py-3.5 text-right">
                        <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                          Actions
                        </SectionLabel>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {slotsTableData.slice(0, 50).map((row) => {
                      const s = row.slot;
                      return (
                        <tr
                          key={s.id}
                          className="border-b transition-colors hover:bg-muted/30"
                          style={{ borderColor: "#F1F5F9" }}
                        >
                          <td className="px-5 py-3.5 align-middle">
                            <input
                              type="checkbox"
                              className="size-4 rounded border-border accent-blue-600"
                            />
                          </td>
                          <td className="px-3 py-3.5 align-middle">
                            <p className="text-[13px] font-semibold text-foreground">
                              {row.date}
                            </p>
                          </td>
                          <td className="px-3 py-3.5 align-middle">
                            <p className="text-[13px] text-foreground">{row.day}</p>
                          </td>
                          <td className="px-3 py-3.5 align-middle">
                            <p className="text-[13px] font-medium text-foreground">{row.time}</p>
                          </td>
                          <td className="px-3 py-3.5 align-middle">
                            <p className="text-[13px] text-muted-foreground">{row.duration}</p>
                          </td>
                          <td className="px-3 py-3.5 align-middle">
                            {s.isBooked ? (
                              <Badge tone="info" dot>
                                Booked
                              </Badge>
                            ) : (
                              <Badge tone="success" dot>
                                Available
                              </Badge>
                            )}
                          </td>
                          <td className="px-5 py-3.5 align-middle">
                            {s.isBooked ? null : editingId === s.id ? (
                              <div className="flex items-center justify-end gap-2">
                                <Input
                                  type="datetime-local"
                                  value={editStartsAt}
                                  onChange={(e) => setEditStartsAt(e.target.value)}
                                  className="h-9 w-56"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => void saveEdit(s.id)}
                                  disabled={busyId === s.id}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditingId(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setEditingId(s.id);
                                    setEditStartsAt(slotInputValue(s));
                                  }}
                                >
                                  <Pencil className="size-3.5" strokeWidth={2} />
                                  Edit
                                </Button>
                                <button
                                  type="button"
                                  className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40"
                                  onClick={() => void removeSlot(s.id)}
                                  disabled={busyId === s.id}
                                >
                                  <MoreHorizontal className="size-4" strokeWidth={2} />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      ) : activeTab === "slots" ? (
        <>
          <Panel className="mb-6 grid gap-3 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
            <Field label="Add open slot">
              <Input
                type="datetime-local"
                value={newStartsAt}
                onChange={(e) => setNewStartsAt(e.target.value)}
              />
            </Field>
            <Button onClick={() => void createSlot()} disabled={busyId === "create"}>
              {busyId === "create" ? "Adding…" : "Add slot"}
            </Button>
          </Panel>

          {loading ? (
            <EmptyNote>Loading slots…</EmptyNote>
          ) : grouped.length === 0 ? (
            <EmptyNote>
              No slots yet. Save weekly hours above, generate 2 weeks, or add a slot manually.
            </EmptyNote>
          ) : (
            <div className="space-y-5">
              {grouped.map(([date, daySlots]) => (
                <section key={date} className="space-y-2">
                  <SectionLabel>{date}</SectionLabel>
                  <div className="space-y-2">
                    {daySlots.map((slot) => (
                      <Panel key={slot.id} className="flex flex-wrap items-center gap-3 p-3.5">
                        <div className="min-w-0 flex-1">
                          {editingId === slot.id ? (
                            <Input
                              type="datetime-local"
                              value={editStartsAt}
                              onChange={(e) => setEditStartsAt(e.target.value)}
                              className="max-w-xs"
                            />
                          ) : (
                            <>
                              <p className="text-sm font-medium">{slot.time}</p>
                              <p className="font-mono text-[11px] text-muted-foreground">
                                {slot.isBooked
                                  ? `${slot.appointmentReference || "Booked"} · ${slot.patientName || "Patient"}`
                                  : "Open for booking"}
                              </p>
                            </>
                          )}
                        </div>
                        <Badge tone={slot.isBooked ? "warning" : "success"}>
                          {slot.isBooked ? "Booked" : "Open"}
                        </Badge>
                        {slot.isBooked ? null : editingId === slot.id ? (
                          <>
                            <Button
                              size="sm"
                              onClick={() => void saveEdit(slot.id)}
                              disabled={busyId === slot.id}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setEditingId(null)}
                            >
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setEditingId(slot.id);
                                setEditStartsAt(slotInputValue(slot));
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="danger"
                              disabled={busyId === slot.id}
                              onClick={() => void removeSlot(slot.id)}
                            >
                              <Trash2 className="size-3.5" strokeWidth={2} />
                              Remove
                            </Button>
                          </>
                        )}
                      </Panel>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      ) : activeTab === "appointments" ? (
        <Panel className="p-8">
          <EmptyNote>Appointment list view coming soon.</EmptyNote>
        </Panel>
      ) : (
        <Panel className="space-y-4 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <SettingsCard
              icon={<Timer className="size-5" strokeWidth={2} />}
              label="Slot Duration"
              value={slotDuration}
              options={["10 minutes", "15 minutes", "20 minutes", "30 minutes", "45 minutes", "60 minutes"]}
              onChange={setSlotDuration}
            />
            <SettingsCard
              icon={<Hourglass className="size-5" strokeWidth={2} />}
              label="Buffer Time"
              value={bufferTime}
              options={["0 minutes", "5 minutes", "10 minutes", "15 minutes", "20 minutes"]}
              onChange={setBufferTime}
            />
            <SettingsCard
              icon={<CalendarRange className="size-5" strokeWidth={2} />}
              label="Max Booking Advance"
              value={maxAdvance}
              options={["7 days", "14 days", "30 days", "60 days", "90 days"]}
              onChange={setMaxAdvance}
            />
            <div className="rounded-2xl p-5 border border-border flex items-center justify-between">
              <div>
                <SectionLabel className="mb-1.5">Save Weekly Hours</SectionLabel>
                <p className="text-[13px] text-muted-foreground">
                  Save current weekly hours configuration.
                </p>
              </div>
              <Button onClick={() => void saveWeeklyHours()} disabled={savingHours || loading}>
                {savingHours ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function SettingsCard({
  icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <Panel className="p-4 transition-all w-full max-w-full overflow-hidden">
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className="grid size-10 shrink-0 place-items-center rounded-2xl text-primary"
            style={{
              background:
                "linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(37, 99, 235, 0.06))",
            }}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-semibold text-muted-foreground mb-1">{label}</p>
            <div className="relative w-full">
              <select
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="h-9 w-full appearance-none rounded-xl border-2 border-transparent bg-input-fill pl-2.5 pr-8 text-[13px] font-semibold text-foreground transition-all focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:outline-none truncate"
                style={{ boxShadow: "inset 0 1px 2px 0 rgba(15, 23, 42, 0.03)" }}
              >
                {options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
              <ChevronRight
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 -rotate-90 size-3.5 text-muted-foreground"
                strokeWidth={2.5}
              />
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
