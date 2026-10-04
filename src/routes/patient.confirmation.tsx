import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import { appointmentsApi, formatApiError, type ApiAppointment } from "@/lib/api";

export const Route = createFileRoute("/patient/confirmation")({
  validateSearch: (search: Record<string, unknown>) => ({
    appointmentId: typeof search.appointmentId === "string" ? search.appointmentId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Appointment confirmed — AI Receptionist" },
      { name: "description", content: "Your appointment reference, time, place and what to bring." },
      { property: "og:title", content: "Appointment confirmed — AI Receptionist" },
      { property: "og:description", content: "Confirmation details and follow-up reminders for your visit." },
    ],
  }),
  component: Confirmation,
});

function Confirmation() {
  const { appointmentId } = Route.useSearch();
  const [appointment, setAppointment] = useState<ApiAppointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      try {
        if (!appointmentId) {
          if (!cancelled) setError("No appointment was selected.");
          return;
        }
        const result = await appointmentsApi.get(appointmentId);
        if (!cancelled) setAppointment(result.appointment);
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load confirmation."));
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
    return <EmptyNote>Loading confirmation…</EmptyNote>;
  }

  if (error || !appointment) {
    return (
      <>
        <PageHeader eyebrow="Patient" title="Appointment confirmed" description={error || "Appointment not found."} />
        <Link to="/patient/appointments">
          <Button variant="outline">My appointments</Button>
        </Link>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="Patient" title="Appointment confirmed" description="Your visit is booked and reminders are scheduled." />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Panel className="border-success/40 bg-success/8 p-5">
            <div className="flex items-center justify-between gap-2">
              <SectionLabel>Confirmation</SectionLabel>
              <Badge tone="success">{appointment.reference}</Badge>
            </div>
            <p className="mt-3 font-display text-xl font-semibold">
              {appointment.date} · {appointment.time}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {appointment.doctorName} · {appointment.speciality} · {appointment.clinic}
            </p>
            {appointment.reason ? (
              <p className="mt-3 text-sm text-muted-foreground">Reason: {appointment.reason}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/patient/appointments">
                <Button variant="outline" size="sm">
                  My appointments
                </Button>
              </Link>
              <Link to="/patient/records">
                <Button variant="outline" size="sm">
                  Upload a report
                </Button>
              </Link>
            </div>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Before you arrive</SectionLabel>
            <ul className="mt-2.5 space-y-1.5 text-sm">
              <li>Arrive 10 minutes early for check-in.</li>
              <li>Bring your current medication list.</li>
              <li>Upload recent test results so the doctor can review them first.</li>
            </ul>
          </Panel>
        </div>

        <aside className="space-y-4">
          <Panel className="p-4">
            <SectionLabel>Visit summary</SectionLabel>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Duration</dt>
                <dd>{appointment.duration}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Mode</dt>
                <dd>{appointment.mode}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Fee</dt>
                <dd>{appointment.fee}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Status</dt>
                <dd className="capitalize">{appointment.status}</dd>
              </div>
            </dl>
            <Link to="/patient/messages">
              <Button variant="soft" size="sm" className="mt-3 w-full">
                View messages
              </Button>
            </Link>
          </Panel>
        </aside>
      </div>
    </>
  );
}
