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

function slotInputValue(slot: ApiDoctorSlot) {
  return slot.startsAtLocal || "";
}

function DoctorAvailabilityPage() {
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

  return (
    <>
      <PageHeader
        eyebrow="Practice"
        title="Availability slots"
        description="Set your usual weekly hours, then generate or add the open slots patients and the phone receptionist can book."
        actions={
          <Button onClick={() => void generateSlots()} disabled={busyId === "generate" || loading}>
            {busyId === "generate" ? "Generating…" : "Generate 2 weeks"}
          </Button>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-primary">{success}</p> : null}

      <Panel className="mb-6 space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <SectionLabel>Available days and timings</SectionLabel>
            <p className="mt-1 text-xs text-muted-foreground">
              Weekly hours and slots use {clinicTimeZoneLabel}. A time you enter, such as 9:00 AM,
              is that US clock time, including for appointment reminders.
            </p>
          </div>
          <Button
            type="button"
            onClick={() => void saveWeeklyHours()}
            disabled={savingHours || loading}
          >
            {savingHours ? "Saving…" : "Save weekly hours"}
          </Button>
        </div>
        <div className="space-y-2">
          {weeklyHours.map((slot) => (
            <div
              key={slot.day}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl border border-border/70 px-3 py-2"
            >
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(e) => updateWeeklyHour(slot.day, { enabled: e.target.checked })}
                />
                {slot.day}
              </label>
              <Input
                type="time"
                className="h-9 w-[7.5rem]"
                disabled={!slot.enabled}
                value={slot.startTime}
                onChange={(e) => updateWeeklyHour(slot.day, { startTime: e.target.value })}
              />
              <Input
                type="time"
                className="h-9 w-[7.5rem]"
                disabled={!slot.enabled}
                value={slot.endTime}
                onChange={(e) => updateWeeklyHour(slot.day, { endTime: e.target.value })}
              />
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="mb-6 grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
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
  );
}
