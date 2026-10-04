import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FollowUpDialog } from "@/components/doctor/FollowUpDialog";
import { Avatar, Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import {
  doctorAppointmentsApi,
  formatApiError,
  type ApiAppointment,
} from "@/lib/api";
import { initials, statusTone } from "@/lib/mock-data";

export const Route = createFileRoute("/doctor/schedule")({
  head: () => ({
    meta: [
      { title: "Appointment schedule — AI Receptionist" },
      { name: "description", content: "Upcoming and past appointments on your clinic calendar." },
      { property: "og:title", content: "Appointment schedule — AI Receptionist" },
      { property: "og:description", content: "Update visit status and schedule follow-ups." },
    ],
  }),
  component: DoctorSchedule,
});

function isUpcoming(appointment: ApiAppointment, now: number) {
  if (appointment.status === "cancelled" || appointment.status === "completed") return false;
  return new Date(appointment.startsAt).getTime() >= now;
}

const STATUS_ACTIONS: Array<{ status: ApiAppointment["status"]; label: string }> = [
  { status: "confirmed", label: "Confirm" },
  { status: "pending", label: "Pending" },
  { status: "completed", label: "Complete" },
  { status: "cancelled", label: "Cancel" },
];

function DoctorSchedule() {
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = useState<ApiAppointment | null>(null);

  useEffect(() => {
    let cancelled = false;
    void doctorAppointmentsApi
      .list()
      .then((result) => {
        if (!cancelled) setAppointments(result.appointments);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load appointments."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { upcoming, past } = useMemo(() => {
    const now = Date.now();
    const upcomingItems = appointments
      .filter((appointment) => isUpcoming(appointment, now))
      .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
    const pastItems = appointments
      .filter((appointment) => !isUpcoming(appointment, now))
      .sort((a, b) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
    return { upcoming: upcomingItems, past: pastItems };
  }, [appointments]);

  async function changeStatus(appointment: ApiAppointment, status: ApiAppointment["status"]) {
    if (appointment.status === status) return;
    setBusyId(appointment.id);
    setError("");
    try {
      const result = await doctorAppointmentsApi.updateStatus(appointment.id, status);
      setAppointments((current) =>
        current.map((row) => (row.id === appointment.id ? result.appointment : row)),
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to update appointment status."));
    } finally {
      setBusyId(null);
    }
  }

  function renderCard(appointment: ApiAppointment) {
    const terminal = appointment.status === "completed" || appointment.status === "cancelled";
    return (
      <Panel key={appointment.id} className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <Avatar label={initials(appointment.patientName)} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{appointment.patientName}</p>
              <p className="text-xs text-muted-foreground">{appointment.reason || "No reason noted"}</p>
              <p className="mt-2 font-mono text-[11px] text-foreground">
                {appointment.date} · {appointment.time} · {appointment.duration}
              </p>
              {appointment.isFollowUp ? (
                <p className="mt-1 text-[11px] text-primary">
                  Follow-up of {appointment.followUpOfReference || "prior visit"}
                </p>
              ) : null}
            </div>
          </div>
          <Badge tone={statusTone[appointment.status]}>{appointment.status}</Badge>
        </div>

        {!terminal ? (
          <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
            {STATUS_ACTIONS.filter((action) => action.status !== appointment.status).map((action) => (
              <Button
                key={action.status}
                size="sm"
                variant={action.status === "cancelled" ? "danger" : "outline"}
                disabled={busyId === appointment.id}
                onClick={() => void changeStatus(appointment, action.status)}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
          <span className="font-mono text-[11px] text-muted-foreground">
            {appointment.reference} · {appointment.mode}
          </span>
          <div className="flex flex-wrap gap-2">
            {appointment.status !== "cancelled" ? (
              <Button size="sm" variant="soft" onClick={() => setFollowUpFor(appointment)}>
                Schedule follow-up
              </Button>
            ) : null}
            <Link to="/doctor/patients/$patientId" params={{ patientId: appointment.patientId }}>
              <Button variant="outline" size="sm">
                Patient file
              </Button>
            </Link>
          </div>
        </div>
      </Panel>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Doctor"
        title="Appointment schedule"
        description="Update visit status and schedule follow-up appointments linked to a prior visit."
        actions={
          <>
            <Link to="/doctor/availability">
              <Button variant="outline">Availability</Button>
            </Link>
            <Link to="/doctor/patients">
              <Button variant="outline">Patient list</Button>
            </Link>
          </>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading appointments…</EmptyNote>
      ) : (
        <>
          <section className="space-y-3">
            <SectionLabel>Upcoming</SectionLabel>
            {upcoming.length === 0 ? (
              <EmptyNote>No upcoming appointments assigned to you.</EmptyNote>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">{upcoming.map(renderCard)}</div>
            )}
          </section>

          <section className="mt-8 space-y-3">
            <SectionLabel>Past</SectionLabel>
            {past.length === 0 ? (
              <p className="text-sm text-muted-foreground">No completed or cancelled visits yet.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">{past.map(renderCard)}</div>
            )}
          </section>
        </>
      )}

      {followUpFor ? (
        <FollowUpDialog
          parent={followUpFor}
          onClose={() => setFollowUpFor(null)}
          onCreated={(appointment) => {
            setAppointments((current) => [...current, appointment]);
            setFollowUpFor(null);
          }}
        />
      ) : null}
    </>
  );
}
