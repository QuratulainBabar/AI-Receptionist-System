import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Avatar, Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { appointmentsApi, formatApiError, type ApiAppointment } from "@/lib/api";
import { initials, statusTone } from "@/lib/mock-data";

export const Route = createFileRoute("/patient/appointments/$appointmentId")({
  head: () => ({
    meta: [
      { title: "Appointment details — AI Receptionist" },
      { name: "description", content: "View your appointment reference, doctor, time and visit details." },
    ],
  }),
  component: AppointmentDetails,
});

function AppointmentDetails() {
  const { appointmentId } = Route.useParams();
  const [appointment, setAppointment] = useState<ApiAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await appointmentsApi.get(appointmentId);
        if (!cancelled) setAppointment(result.appointment);
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load appointment details."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [appointmentId]);

  if (loading) {
    return <EmptyNote>Loading appointment…</EmptyNote>;
  }

  if (error || !appointment) {
    return (
      <>
        <PageHeader eyebrow="Patient" title="Appointment details" description={error || "Appointment not found."} />
        <Link to="/patient/appointments">
          <Button variant="outline">Back to appointments</Button>
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="Appointment details"
        description={`${appointment.doctorName} · ${appointment.speciality}`}
        actions={
          <>
            <Link to="/patient/appointments">
              <Button variant="outline">Back to list</Button>
            </Link>
            <Link to="/patient/doctors">
              <Button>Book another</Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <Avatar label={initials(appointment.doctorName)} className="size-12" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{appointment.doctorName}</p>
                  <p className="text-xs text-muted-foreground">{appointment.speciality}</p>
                  <p className="mt-2 font-mono text-[11px] text-foreground">
                    {appointment.date} · {appointment.time} · {appointment.duration}
                  </p>
                </div>
              </div>
              <Badge tone={statusTone[appointment.status]}>{appointment.status}</Badge>
            </div>

            <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="mt-0.5 font-mono">{appointment.reference}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Mode</dt>
                <dd className="mt-0.5">{appointment.mode}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Clinic</dt>
                <dd className="mt-0.5">{appointment.clinic}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Fee</dt>
                <dd className="mt-0.5">{appointment.fee}</dd>
              </div>
            </dl>

            {appointment.reason ? (
              <div className="mt-4 border-t border-border pt-4">
                <SectionLabel>Reason for visit</SectionLabel>
                <p className="mt-2 text-sm text-muted-foreground">{appointment.reason}</p>
              </div>
            ) : null}
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>Need to change this?</SectionLabel>
            <p className="mt-2 text-sm text-muted-foreground">
              Book another visit with a different doctor or time slot from Find a doctor.
            </p>
            <Link to="/patient/doctors">
              <Button variant="soft" size="sm" className="mt-3 w-full">
                Find a doctor
              </Button>
            </Link>
          </Panel>
        </aside>
      </div>
    </>
  );
}
