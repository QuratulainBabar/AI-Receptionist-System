import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  adminApi,
  formatApiError,
  type ApiAdminDoctorSlot,
  type ApiAppointment,
} from "@/lib/api";
import { statusTone } from "@/lib/mock-data";

export const Route = createFileRoute("/admin/appointments")({
  head: () => ({
    meta: [{ title: "Appointments — Super Admin" }],
  }),
  component: AdminAppointmentsLayout,
});

const STATUS_ACTIONS: Array<{ status: ApiAppointment["status"]; label: string }> = [
  { status: "confirmed", label: "Confirm" },
  { status: "pending", label: "Pending" },
  { status: "completed", label: "Complete" },
  { status: "cancelled", label: "Cancel" },
];

function AdminAppointmentsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/admin/appointments/$appointmentId");
  if (isDetail) return <Outlet />;
  return <AdminAppointmentsPage />;
}

function AdminAppointmentsPage() {
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rescheduleFor, setRescheduleFor] = useState<ApiAppointment | null>(null);
  const [slots, setSlots] = useState<ApiAdminDoctorSlot[]>([]);
  const [slotId, setSlotId] = useState("");
  const [slotsLoading, setSlotsLoading] = useState(false);

  async function load(nextQ = appliedQ) {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.listAppointments({ q: nextQ || undefined, limit: 100 });
      setAppointments(result.appointments);
    } catch (err) {
      setError(formatApiError(err, "Unable to load appointments."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function changeStatus(appointment: ApiAppointment, status: ApiAppointment["status"]) {
    setBusyId(appointment.id);
    setError("");
    setSuccess("");
    try {
      const result = await adminApi.updateAppointmentStatus(appointment.id, status);
      setAppointments((current) =>
        current.map((row) => (row.id === appointment.id ? result.appointment : row)),
      );
      setSuccess(result.message || `Marked as ${status}.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to update appointment status."));
    } finally {
      setBusyId(null);
    }
  }

  async function openReschedule(appointment: ApiAppointment) {
    setRescheduleFor(appointment);
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
      setRescheduleFor(null);
    } finally {
      setSlotsLoading(false);
    }
  }

  async function confirmReschedule() {
    if (!rescheduleFor || !slotId) return;
    setBusyId(rescheduleFor.id);
    setError("");
    setSuccess("");
    try {
      const result = await adminApi.rescheduleAppointment(rescheduleFor.id, slotId);
      setAppointments((current) =>
        current.map((row) => (row.id === rescheduleFor.id ? result.appointment : row)),
      );
      setSuccess(result.message || "Appointment rescheduled.");
      setRescheduleFor(null);
    } catch (err) {
      setError(formatApiError(err, "Unable to reschedule appointment."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Manage booking status, cancellations, and reschedules — including visits booked by the phone AI."
      />

      <Panel className="mb-6 p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            placeholder="Search reference, patient, doctor, or reason"
            className="sm:flex-1"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setAppliedQ(q);
                void load(q);
              }
            }}
          />
          <Button
            type="button"
            onClick={() => {
              setAppliedQ(q);
              void load(q);
            }}
          >
            Search
          </Button>
        </div>
      </Panel>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-primary">{success}</p> : null}

      {loading && !appointments.length ? (
        <EmptyNote>Loading appointments…</EmptyNote>
      ) : !appointments.length ? (
        <EmptyNote>No appointments yet.</EmptyNote>
      ) : (
        <div className="space-y-3">
          {appointments.map((row) => {
            const terminal = row.status === "completed" || row.status === "cancelled";
            return (
              <Panel key={row.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {row.reference}
                      {row.isFollowUp ? (
                        <span className="ml-2 text-xs font-normal text-primary">
                          Follow-up of {row.followUpOfReference}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {row.date} · {row.time} · {row.duration} · {row.mode}
                    </p>
                    <p className="mt-2 text-sm">
                      {row.patientName}
                      <span className="text-muted-foreground"> → </span>
                      {row.doctorName}
                      <span className="text-muted-foreground"> · {row.speciality}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.reason || "No reason noted"}</p>
                  </div>
                  <Badge tone={statusTone[row.status]}>{row.status}</Badge>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
                  <Link to="/admin/appointments/$appointmentId" params={{ appointmentId: row.id }}>
                    <Button size="sm" variant="outline">
                      Details
                    </Button>
                  </Link>
                  {!terminal
                    ? STATUS_ACTIONS.filter((action) => action.status !== row.status).map((action) => (
                        <Button
                          key={action.status}
                          size="sm"
                          variant={action.status === "cancelled" ? "danger" : "outline"}
                          disabled={busyId === row.id}
                          onClick={() => void changeStatus(row, action.status)}
                        >
                          {action.label}
                        </Button>
                      ))
                    : null}
                  {!terminal ? (
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={busyId === row.id}
                      onClick={() => void openReschedule(row)}
                    >
                      Reschedule
                    </Button>
                  ) : null}
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {rescheduleFor ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/35 p-4">
          <Panel className="w-full max-w-lg space-y-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <SectionLabel>Reschedule</SectionLabel>
                <p className="mt-1 text-sm font-semibold">
                  {rescheduleFor.reference} · {rescheduleFor.patientName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Current: {rescheduleFor.date} · {rescheduleFor.time}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setRescheduleFor(null)}>
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
              <Button variant="outline" onClick={() => setRescheduleFor(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => void confirmReschedule()}
                disabled={!slotId || slotsLoading || busyId === rescheduleFor.id}
              >
                {busyId === rescheduleFor.id ? "Saving…" : "Confirm reschedule"}
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
