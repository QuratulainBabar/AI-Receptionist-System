import { createFileRoute } from "@tanstack/react-router";

/*
Patient dashboard is fully commented out.
The /patient route stays registered so the patient portal still loads.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppointmentCard } from "@/components/shared/cards";
import { Button, EmptyNote, PageHeader, Panel, SectionLabel, StatCard } from "@/components/ui/primitives";
import { dashboardApi, formatApiError, type ApiPatientDashboard } from "@/lib/api";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/patient/")({
  head: () => ({
    meta: [
      { title: "Patient dashboard — AI Receptionist" },
      { name: "description", content: "Your upcoming visits, follow-up messages and quick actions." },
      { property: "og:title", content: "Patient dashboard — AI Receptionist" },
      { property: "og:description", content: "See your next appointment and start a chat with the receptionist." },
    ],
  }),
  component: PatientDashboard,
});

const quickActions = [
  { to: "/patient/chat", label: "Ask the receptionist" },
  { to: "/patient/doctors", label: "Find a doctor" },
  { to: "/patient/records", label: "Upload a report" },
  { to: "/patient/history", label: "Update history" },
] as const;

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function PatientDashboard() {
  const session = getSession();
  const [dashboard, setDashboard] = useState<ApiPatientDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void dashboardApi
      .get()
      .then((result) => {
        if (!cancelled) setDashboard(result.dashboard);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load dashboard."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const firstName = useMemo(() => {
    const name = dashboard?.patientName || session?.name || "there";
    return name.split(" ")[0];
  }, [dashboard?.patientName, session?.name]);

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);

  return (
    <>
      <PageHeader
        eyebrow="Patient"
        title={`${greeting}, ${firstName}`}
        description="Here's where your care stands today."
        actions={
          <Link to="/patient/book">
            <Button>Book appointment</Button>
          </Link>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading your dashboard…</EmptyNote>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Next appointment"
              value={dashboard?.nextAppointment?.value ?? "None scheduled"}
              detail={
                dashboard?.nextAppointment?.detail ??
                (dashboard?.upcomingAppointments.length ? undefined : "Book a visit when you're ready")
              }
            />
            <StatCard
              label="Follow-up due"
              value={dashboard?.followUpDue?.value ?? "None due"}
              detail={dashboard?.followUpDue?.detail ?? "No pending rechecks on file"}
            />
            <StatCard
              label="Unread messages"
              value={String(dashboard?.unreadMessages ?? 0)}
              detail="Confirmations and reminders"
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="space-y-3 lg:col-span-2">
              <SectionLabel>Upcoming appointments</SectionLabel>
              {dashboard?.upcomingAppointments.length ? (
                dashboard.upcomingAppointments.map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} />
                ))
              ) : (
                <EmptyNote>
                  No upcoming appointments.{" "}
                  <Link to="/patient/book" className="font-medium text-primary underline-offset-2 hover:underline">
                    Book one now
                  </Link>
                  .
                </EmptyNote>
              )}
            </section>

            <aside className="space-y-4">
              <Panel className="p-4">
                <SectionLabel>Quick actions</SectionLabel>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {quickActions.map((action) => (
                    <Link key={action.to} to={action.to}>
                      <Button variant="outline" size="sm" className="h-auto w-full justify-start py-2.5 text-left">
                        {action.label}
                      </Button>
                    </Link>
                  ))}
                </div>
              </Panel>

              <Panel className="p-4">
                <SectionLabel>Popular specialities</SectionLabel>
                <ul className="mt-3 space-y-2">
                  {(dashboard?.popularSpecialties ?? []).map((speciality) => (
                    <li key={speciality.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px]">{speciality.name}</span>
                      <span className="font-mono text-[11px] text-muted-foreground">{speciality.doctors}</span>
                    </li>
                  ))}
                </ul>
                <Link to="/patient/doctors">
                  <Button variant="soft" size="sm" className="mt-3 w-full">
                    Browse all
                  </Button>
                </Link>
              </Panel>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
*/

export const Route = createFileRoute("/patient/")({
  head: () => ({
    meta: [{ title: "Patient portal — AI Receptionist" }],
  }),
  component: PatientDashboard,
});

function PatientDashboard() {
  return null;
}
