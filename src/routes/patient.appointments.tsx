import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppointmentCard } from "@/components/shared/cards";
import { Button, EmptyNote, PageHeader, SectionLabel } from "@/components/ui/primitives";
import { appointmentsApi, formatApiError, type ApiAppointment } from "@/lib/api";

export const Route = createFileRoute("/patient/appointments")({
  head: () => ({
    meta: [
      { title: "My appointments — AI Receptionist" },
      { name: "description", content: "Upcoming and past appointments with their status and reference numbers." },
      { property: "og:title", content: "My appointments — AI Receptionist" },
      { property: "og:description", content: "Track upcoming visits and review your appointment history." },
    ],
  }),
  component: AppointmentsLayout,
});

function AppointmentsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/patient/appointments/$appointmentId");
  if (isDetail) return <Outlet />;
  return <MyAppointments />;
}

function isUpcoming(appointment: ApiAppointment, now: number) {
  if (appointment.status === "cancelled" || appointment.status === "completed") return false;
  return new Date(appointment.startsAt).getTime() >= now;
}

function MyAppointments() {
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void appointmentsApi
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

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title="My appointments"
        actions={
          <Link to="/patient/doctors">
            <Button>Book another</Button>
          </Link>
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
              <EmptyNote>No upcoming appointments yet.</EmptyNote>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {upcoming.map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} />
                ))}
              </div>
            )}
          </section>

          <section className="mt-8 space-y-3">
            <SectionLabel>Past</SectionLabel>
            {past.length === 0 ? (
              <EmptyNote>No past appointments yet.</EmptyNote>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {past.map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
