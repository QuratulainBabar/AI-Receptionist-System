import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppointmentCard } from "@/components/shared/cards";
import { AppointmentInvoiceAction } from "@/components/doctor/AppointmentInvoiceAction";
import { Button, EmptyNote, PageHeader, Panel, SectionLabel, StatCard } from "@/components/ui/primitives";
import { doctorDashboardApi, formatApiError, type ApiDoctorDashboard } from "@/lib/api";
import { useDoctorAccess } from "@/lib/doctor-access";
import { getSession } from "@/lib/session";

export const Route = createFileRoute("/doctor/")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: search["checkout"] === "success" ? ("success" as const) : undefined,
  }),
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
  { to: "/doctor/subscription", label: "Subscription" },
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
  const access = useDoctorAccess();
  const search = Route.useSearch();
  const [dashboard, setDashboard] = useState<ApiDoctorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

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
          access.ready ? (
            <Link to="/doctor/schedule">
              <Button>Open schedule</Button>
            </Link>
          ) : null
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-primary">{message}</p> : null}
      {search.checkout === "success" ? (
        <p className="mb-4 text-sm text-primary">Payment received. Your clinic account is enrolled.</p>
      ) : null}

      {!access.ready ? (
        <Panel className="mb-6 space-y-4 p-5">
          <div>
            <p className="text-sm font-medium">Finish setup to use the clinic</p>
            <p className="text-xs text-muted-foreground">
              {access.planName ? `${access.planName} is active.` : "Your plan is active."} Complete your profile and availability, then the rest of the portal opens.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">1. Profile</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {access.profileComplete ? "Specialty and clinic are saved." : "Add your specialty and clinic."}
              </p>
              <Link to="/doctor/profile">
                <Button size="sm" className="mt-3" variant={access.profileComplete ? "outline" : "primary"}>
                  {access.profileComplete ? "Review profile" : "Complete profile"}
                </Button>
              </Link>
            </div>
            <div className="rounded-xl border border-border p-3">
              <p className="text-sm font-medium">2. Availability</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {access.availabilityComplete ? "Open slots are on your calendar." : "Save weekly hours so patients can book."}
              </p>
              <Link to="/doctor/availability">
                <Button size="sm" className="mt-3" variant={access.availabilityComplete ? "outline" : "primary"}>
                  {access.availabilityComplete ? "Review availability" : "Set availability"}
                </Button>
              </Link>
            </div>
          </div>
          {access.upcomingModules.length ? (
            <div>
              <SectionLabel>Modules that open after setup</SectionLabel>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {access.upcomingModules.map((mod) => (
                  <li key={mod.id}>{mod.label}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {access.planFeatures.length ? (
            <div>
              <SectionLabel>Included with your plan</SectionLabel>
              <ul className="mt-2 space-y-1 text-sm">
                {access.planFeatures.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      ) : null}

      {loading ? (
        <EmptyNote>Loading your dashboard…</EmptyNote>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <StatCard
              label="Plan"
              value={dashboard?.subscription?.planName ?? "None"}
              detail={dashboard?.subscription?.statusLabel ?? "Subscribe to stay on the platform"}
            />
          </div>

          {access.ready ? <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="space-y-3 lg:col-span-2">
              <SectionLabel>Today's appointments</SectionLabel>
              {dashboard?.todayAppointments.length ? (
                dashboard.todayAppointments.map((appointment) => (
                  <div key={appointment.id} className="space-y-2">
                    <AppointmentCard appointment={appointment} perspective="doctor" />
                    <div className="px-1">
                      <AppointmentInvoiceAction
                        appointment={appointment}
                        onUpdated={(updated, note) => {
                          setDashboard((current) =>
                            current
                              ? {
                                  ...current,
                                  todayAppointments: current.todayAppointments.map((row) =>
                                    row.id === updated.id ? updated : row,
                                  ),
                                }
                              : current,
                          );
                          setMessage(note);
                          setError("");
                        }}
                      />
                    </div>
                  </div>
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
                  {quickActions.filter((action) => access.modules.some((mod) => mod.to === action.to)).map((action) => (
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
          </div> : null}
        </>
      )}
    </>
  );
}
