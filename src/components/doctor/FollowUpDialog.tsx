import { useEffect, useMemo, useState } from "react";
import {
  Button,
  EmptyNote,
  Field,
  Panel,
  SectionLabel,
  Textarea,
} from "@/components/ui/primitives";
import {
  doctorAppointmentsApi,
  doctorAvailabilityApi,
  formatApiError,
  type ApiAppointment,
  type ApiDoctorSlot,
} from "@/lib/api";

export function FollowUpDialog({
  parent,
  onClose,
  onCreated,
}: {
  parent: ApiAppointment;
  onClose: () => void;
  onCreated: (appointment: ApiAppointment, message: string) => void;
}) {
  const [slots, setSlots] = useState<ApiDoctorSlot[]>([]);
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [mode, setMode] = useState<ApiAppointment["mode"]>(parent.mode);
  const [reason, setReason] = useState(
    `Follow-up after ${parent.reference}${parent.reason ? ` — ${parent.reason}` : ""}`,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void doctorAvailabilityApi
      .list({ includeBooked: false })
      .then((result) => {
        if (cancelled) return;
        const parentTime = new Date(parent.startsAt).getTime();
        const open = result.slots.filter(
          (slot) => !slot.isBooked && new Date(slot.startsAt).getTime() > Math.max(parentTime, Date.now()),
        );
        setSlots(open);
        const firstDate = open[0]?.date ?? "";
        setDate(firstDate);
        setSlotId(open.find((slot) => slot.date === firstDate)?.id ?? "");
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load open slots."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [parent.id, parent.startsAt]);

  const dates = useMemo(() => [...new Set(slots.map((slot) => slot.date))], [slots]);
  const times = useMemo(() => slots.filter((slot) => slot.date === date), [slots, date]);

  function chooseDate(nextDate: string) {
    setDate(nextDate);
    const first = slots.find((slot) => slot.date === nextDate);
    setSlotId(first?.id ?? "");
  }

  async function submit() {
    if (!slotId) {
      setError("Select a date and time for the next visit.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await doctorAppointmentsApi.scheduleFollowUp(parent.id, {
        slotId,
        reason: reason.trim(),
        mode,
      });
      onCreated(result.appointment, result.message || "Next visit scheduled.");
    } catch (err) {
      setError(formatApiError(err, "Unable to schedule the next visit."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4">
      <Panel className="w-full max-w-lg space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionLabel>Schedule next visit</SectionLabel>
            <p className="mt-1 text-sm font-semibold">
              After {parent.reference} · {parent.patientName}
            </p>
            <p className="text-xs text-muted-foreground">
              This visit stays on the same patient profile and is linked to {parent.reference}.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <EmptyNote>Loading open times…</EmptyNote>
        ) : slots.length === 0 ? (
          <EmptyNote>
            No open times after this visit. Add availability first, then schedule the next visit from this appointment.
          </EmptyNote>
        ) : (
          <>
            <Field label="Date">
              <select
                className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
                value={date}
                onChange={(e) => chooseDate(e.target.value)}
              >
                {dates.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Time">
              <select
                className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
              >
                {times.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.time}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}

        <Field label="Appointment type">
          <select
            className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
            value={mode}
            onChange={(e) => setMode(e.target.value as ApiAppointment["mode"])}
          >
            <option value="In clinic">In clinic</option>
            <option value="Video call">Video call</option>
          </select>
        </Field>

        <Field label="Reason / follow-up details">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why the patient should return"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Not now
          </Button>
          <Button onClick={() => void submit()} disabled={saving || loading || !slotId}>
            {saving ? "Scheduling…" : "Schedule next visit"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
