import { createFileRoute, Link } from "@tanstack/react-router";
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
  formatApiError,
  type ApiDoctorSlot,
} from "@/lib/api";

export const Route = createFileRoute("/doctor/availability")({
  head: () => ({
    meta: [
      { title: "Availability — Doctor portal" },
      {
        name: "description",
        content: "Create and manage open appointment slots patients and the phone AI can book.",
      },
    ],
  }),
  component: DoctorAvailabilityPage,
});

function toLocalInputValue(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function DoctorAvailabilityPage() {
  const [slots, setSlots] = useState<ApiDoctorSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newStartsAt, setNewStartsAt] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editStartsAt, setEditStartsAt] = useState("");

  async function refresh() {
    const result = await doctorAvailabilityApi.list();
    setSlots(result.slots);
  }

  useEffect(() => {
    let cancelled = false;
    void refresh()
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

  async function createSlot() {
    if (!newStartsAt) {
      setError("Choose a date and time for the new slot.");
      return;
    }
    setBusyId("create");
    setError("");
    setSuccess("");
    try {
      await doctorAvailabilityApi.create(new Date(newStartsAt).toISOString());
      setNewStartsAt("");
      await refresh();
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
      await refresh();
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
      await doctorAvailabilityApi.update(slotId, new Date(editStartsAt).toISOString());
      setEditingId(null);
      await refresh();
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
      await refresh();
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
        description="These open slots are what patients and the phone receptionist can book. Weekly hours on My profile are the template used to generate slots."
        actions={
          <>
            <Link to="/doctor/profile">
              <Button variant="outline">Weekly hours</Button>
            </Link>
            <Button onClick={() => void generateSlots()} disabled={busyId === "generate"}>
              {busyId === "generate" ? "Generating…" : "Generate 2 weeks"}
            </Button>
          </>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-primary">{success}</p> : null}

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
          No slots yet. Add one above or generate from your weekly hours on My profile.
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
                            setEditStartsAt(toLocalInputValue(slot.startsAt));
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
