import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppointmentCard } from "@/components/shared/cards";
import { Button, EmptyNote, PageHeader, Panel, SectionLabel, StatCard } from "@/components/ui/primitives";
import { doctorDashboardApi, formatApiError, type ApiDoctorDashboard } from "@/lib/api";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/doctor/")({
  head: () => ({
    meta: [
      { title: "Doctor dashboard — AI Receptionist" },
      { name: "description", content: "Today's appointments, patient queue and clinic notifications." },
      { property: "og:title", content: "Doctor dashboard — AI Receptionist" },
      { property: "og:description", content: "See your schedule for today and open patient files." },
    ],
  }),
  component: DoctorDashboard,
});

const quickActions = [
  { to: "/doctor/schedule", label: "Full schedule" },
  { to: "/doctor/patients", label: "Patient list" },
  { to: "/doctor/notifications", label: "Notifications" },
  { to: "/doctor/records", label: "History & reports" },
] as const;

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstNameFromDoctor(name: string) {
  return name.replace(/^Dr\.\s+/i, "").split(" ")[0] || name;
}

function DoctorDashboard() {
  const session = getSession();
  const [dashboard, setDashboard] = useState<ApiDoctorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void doctorDashboardApi
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

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), []);
  const firstName = useMemo(() => {
    const name = dashboard?.doctorName || session?.name || "Doctor";
    return firstNameFromDoctor(name);
  }, [dashboard?.doctorName, session?.name]);

  const description = useMemo(() => {
    if (dashboard?.speciality && dashboard.clinic) {
      return `${dashboard.speciality} · ${dashboard.clinic}`;
    }
    return dashboard?.speciality || dashboard?.clinic || "Your clinic overview for today.";
  }, [dashboard?.clinic, dashboard?.speciality]);

  return (
    <>
      <PageHeader
        eyebrow="Doctor"
        title={`${greeting}, ${firstName}`}
        description={description}
        actions={
          <Link to="/doctor/schedule">
            <Button>Open schedule</Button>
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
              label="Today's visits"
              value={String(dashboard?.todayVisitsCount ?? 0)}
              detail="Confirmed and pending"
            />
            <StatCard
              label="Awaiting confirm"
              value={String(dashboard?.awaitingConfirmCount ?? 0)}
              detail="New requests to review"
            />
            <StatCard
              label="Unread alerts"
              value={String(dashboard?.unreadAlerts ?? 0)}
              detail={`${dashboard?.patientsCount ?? 0} patients in your list`}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="space-y-3 lg:col-span-2">
              <SectionLabel>Today's appointments</SectionLabel>
              {dashboard?.todayAppointments.length ? (
                dashboard.todayAppointments.map((appointment) => (
                  <AppointmentCard key={appointment.id} appointment={appointment} perspective="doctor" />
                ))
              ) : (
                <EmptyNote>
                  No visits scheduled for today.{" "}
                  <Link
                    to="/doctor/schedule"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Open full schedule
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
                <SectionLabel>Latest notifications</SectionLabel>
                {dashboard?.latestNotifications.length ? (
                  <ul className="mt-3 space-y-3">
                    {dashboard.latestNotifications.map((note) => (
                      <li key={note.id}>
                        <p className="text-[13px] font-medium">{note.title}</p>
                        <p className="text-xs text-muted-foreground">{note.detail}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{note.time}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No alerts yet.</p>
                )}
                <Link to="/doctor/notifications">
                  <Button variant="soft" size="sm" className="mt-3 w-full">
                    View all
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
