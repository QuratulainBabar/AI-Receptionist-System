import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  EmptyNote,
  Field,
  PageHeader,
  Panel,
  SectionLabel,
} from "@/components/ui/primitives";
import {
  adminApi,
  formatApiError,
  type ApiAdminAppointmentDetail,
  type ApiAdminDoctorSlot,
  type ApiAppointment,
} from "@/lib/api";
import { statusTone } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/appointments/$appointmentId")({
  head: () => ({
    meta: [{ title: "Appointment details — Super Admin" }],
  }),
  component: AdminAppointmentDetails,
});

const STATUS_ACTIONS: Array<{ status: ApiAppointment["status"]; label: string }> = [
  { status: "confirmed", label: "Confirm" },
  { status: "pending", label: "Pending" },
  { status: "completed", label: "Complete" },
  { status: "cancelled", label: "Cancel" },
];

function AdminAppointmentDetails() {
  const { appointmentId } = Route.useParams();
  const [appointment, setAppointment] = useState<ApiAdminAppointmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [slots, setSlots] = useState<ApiAdminDoctorSlot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.getAppointment(appointmentId);
      setAppointment(result.appointment);
    } catch (err) {
      setError(formatApiError(err, "Unable to load appointment details."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [appointmentId]);

  async function changeStatus(status: ApiAppointment["status"]) {
    if (!appointment) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await adminApi.updateAppointmentStatus(appointment.id, status);
      setAppointment((current) => (current ? { ...current, ...result.appointment } : current));
      setSuccess(result.message || `Marked as ${status}.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to update appointment status."));
    } finally {
      setBusy(false);
    }
  }

  async function openReschedule() {
    if (!appointment) return;
    setRescheduleOpen(true);
    setSlots([]);
    setSlotId("");
    setSlotsLoading(true);
    setError("");
    try {
      const result = await adminApi.listDoctorOpenSlots(appointment.doctorId);
      setSlots(result.slots);
      setSlotId(result.slots[0]?.id ?? "");
    } catch (err) {
      setError(formatApiError(err, "Unable to load open slots for this doctor."));
      setRescheduleOpen(false);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function confirmReschedule() {
    if (!appointment || !slotId) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = await adminApi.rescheduleAppointment(appointment.id, slotId);
      const refreshed = await adminApi.getAppointment(appointment.id);
      setAppointment(refreshed.appointment);
      setSuccess(result.message || "Appointment rescheduled.");
      setRescheduleOpen(false);
    } catch (err) {
      setError(formatApiError(err, "Unable to reschedule appointment."));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <EmptyNote>Loading appointment…</EmptyNote>;

  if (error && !appointment) {
    return (
      <>
        <PageHeader eyebrow="Clinic" title="Appointment details" description={error} />
        <Link to="/admin/appointments">
          <Button variant="outline">Back to appointments</Button>
        </Link>
      </>
    );
  }

  if (!appointment) return null;

  const terminal = appointment.status === "completed" || appointment.status === "cancelled";

  return (
    <>
      <PageHeader
        eyebrow="Clinic"
        title={appointment.reference}
        description={`${appointment.patientName} → ${appointment.doctorName} · ${appointment.date} · ${appointment.time}`}
        actions={
          <Link to="/admin/appointments">
            <Button variant="outline">Back to list</Button>
          </Link>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-primary">{success}</p> : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <SectionLabel>Visit</SectionLabel>
                <p className="mt-1 text-sm font-semibold">
                  {appointment.date} · {appointment.time} · {appointment.duration}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {appointment.mode} · {appointment.clinic}
                </p>
              </div>
              <Badge tone={statusTone[appointment.status]}>{appointment.status}</Badge>
            </div>

            <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="mt-0.5 font-mono">{appointment.reference}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Specialty</dt>
                <dd className="mt-0.5">{appointment.speciality}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fee</dt>
                <dd className="mt-0.5">{appointment.fee}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Booked</dt>
                <dd className="mt-0.5">{new Date(appointment.createdAt).toLocaleString()}</dd>
              </div>
              {appointment.isFollowUp ? (
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Follow-up of</dt>
                  <dd className="mt-0.5 font-mono">{appointment.followUpOfReference}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-4 border-t border-border pt-4">
              <SectionLabel>Reason for visit</SectionLabel>
              <p className="mt-2 text-sm text-muted-foreground">{appointment.reason || "No reason noted"}</p>
            </div>
          </Panel>

          <Panel className="p-5">
            <SectionLabel>People</SectionLabel>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">Patient</p>
                <p className="mt-1 text-sm font-semibold">{appointment.patientName}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{appointment.patientReference}</p>
                <p className="text-xs text-muted-foreground">{appointment.patientEmail}</p>
                <Link to="/admin/patients/$userId" params={{ userId: appointment.patientId }}>
                  <Button size="sm" variant="outline" className="mt-2">
                    Patient profile
                  </Button>
                </Link>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Doctor</p>
                <p className="mt-1 text-sm font-semibold">{appointment.doctorName}</p>
                <p className="text-xs text-muted-foreground">{appointment.doctorEmail}</p>
                <Link to="/admin/doctors/$userId" params={{ userId: appointment.doctorId }}>
                  <Button size="sm" variant="outline" className="mt-2">
                    Doctor CRM
                  </Button>
                </Link>
              </div>
            </div>
          </Panel>

          {appointment.followUps.length ? (
            <Panel className="p-5">
              <SectionLabel>Follow-up visits</SectionLabel>
              <ul className="mt-3 space-y-2 text-sm">
                {appointment.followUps.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center justify-between gap-2">
                    <Link
                      to="/admin/appointments/$appointmentId"
                      params={{ appointmentId: item.id }}
                      className="font-mono text-xs text-primary"
                    >
                      {item.reference}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {item.date} · {item.time} · {item.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {appointment.voiceCalls.length ? (
            <Panel className="p-5">
              <SectionLabel>Related voice calls</SectionLabel>
              <ul className="mt-3 space-y-3">
                {appointment.voiceCalls.map((call) => (
                  <li key={call.id} className="rounded-xl border border-border px-3 py-2">
                    <p className="text-xs text-muted-foreground">
                      {call.status} · {call.fromNumber || "unknown number"} ·{" "}
                      {call.startedAt ? new Date(call.startedAt).toLocaleString() : "—"}
                    </p>
                    {call.summary ? (
                      <p className="mt-1 text-sm text-muted-foreground">{call.summary}</p>
                    ) : null}
                    <Link to="/admin/voice-calls" className="mt-2 inline-block text-xs text-primary">
                      Open voice calls
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>Manage</SectionLabel>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {!terminal
                ? STATUS_ACTIONS.filter((action) => action.status !== appointment.status).map((action) => (
                    <Button
                      key={action.status}
                      size="sm"
                      variant={action.status === "cancelled" ? "danger" : "outline"}
                      disabled={busy}
                      onClick={() => void changeStatus(action.status)}
                    >
                      {action.label}
                    </Button>
                  ))
                : (
                  <p className="text-sm text-muted-foreground">This visit is {appointment.status}.</p>
                )}
              {!terminal ? (
                <Button size="sm" variant="soft" disabled={busy} onClick={() => void openReschedule()}>
                  Reschedule
                </Button>
              ) : null}
            </div>
          </Panel>
        </aside>
      </div>

      {rescheduleOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4">
          <Panel className="w-full max-w-lg space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SectionLabel>Reschedule</SectionLabel>
                <p className="mt-1 text-sm font-semibold">
                  {appointment.reference} · {appointment.patientName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Current: {appointment.date} · {appointment.time}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRescheduleOpen(false)}>
                Close
              </Button>
            </div>

            {slotsLoading ? (
              <EmptyNote>Loading open slots…</EmptyNote>
            ) : slots.length === 0 ? (
              <EmptyNote>No open slots available for this doctor.</EmptyNote>
            ) : (
              <Field label="New open slot">
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

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRescheduleOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void confirmReschedule()} disabled={!slotId || slotsLoading || busy}>
                {busy ? "Saving…" : "Confirm reschedule"}
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
