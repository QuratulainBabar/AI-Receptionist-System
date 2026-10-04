import { useEffect, useState } from "react";
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
  onCreated: (appointment: ApiAppointment) => void;
}) {
  const [slots, setSlots] = useState<ApiDoctorSlot[]>([]);
  const [slotId, setSlotId] = useState("");
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
          (slot) => !slot.isBooked && new Date(slot.startsAt).getTime() > parentTime,
        );
        setSlots(open);
        setSlotId(open[0]?.id ?? "");
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

  async function submit() {
    if (!slotId) {
      setError("Select an open slot for the follow-up visit.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const result = await doctorAppointmentsApi.scheduleFollowUp(parent.id, {
        slotId,
        reason: reason.trim(),
      });
      onCreated(result.appointment);
    } catch (err) {
      setError(formatApiError(err, "Unable to schedule follow-up."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4">
      <Panel className="w-full max-w-lg space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <SectionLabel>Follow-up visit</SectionLabel>
            <p className="mt-1 text-sm font-semibold">
              After {parent.reference} · {parent.patientName}
            </p>
            <p className="text-xs text-muted-foreground">
              {parent.date} · {parent.time}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {loading ? (
          <EmptyNote>Loading open slots…</EmptyNote>
        ) : slots.length === 0 ? (
          <EmptyNote>
            No open slots after this visit. Add slots under Availability first.
          </EmptyNote>
        ) : (
          <Field label="Open slot">
            <select
              className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
              value={slotId}
              onChange={(e) => setSlotId(e.target.value)}
            >
              {slots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.date} · {slot.time}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Reason">
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Follow-up reason"
          />
        </Field>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={saving || loading || !slotId}>
            {saving ? "Scheduling…" : "Schedule follow-up"}
          </Button>
        </div>
      </Panel>
    </div>
  );
}
