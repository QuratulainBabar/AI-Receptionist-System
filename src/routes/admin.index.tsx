import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel, StatCard } from "@/components/ui/primitives";
import { adminApi, formatApiError, type AdminStats, type AdminVoiceCall } from "@/lib/api";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Super Admin dashboard — AI Receptionist" }],
  }),
  component: AdminDashboard,
});

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function AdminDashboard() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<AdminVoiceCall[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsResult, callsResult] = await Promise.all([
        adminApi.stats(),
        adminApi.listVoiceCalls({ limit: 8 }),
      ]);
      setStats(statsResult.stats);
      setRecentCalls(callsResult.calls);
    } catch (err) {
      setError(formatApiError(err, "Unable to load admin stats."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats, pathname]);

  useEffect(() => {
    function onFocus() {
      void loadStats();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadStats]);

  const inactiveTotal = (stats?.inactiveDoctors ?? 0) + (stats?.inactivePatients ?? 0);

  return (
    <>
      <PageHeader
        eyebrow="Super Admin"
        title="Dashboard"
        description="Overview of doctors, patients, phone calls, and appointments."
        actions={
          <>
            <Link to="/admin/voice-calls">
              <Button variant="outline">Voice calls</Button>
            </Link>
            <Link to="/admin/appointments">
              <Button variant="outline">Appointments</Button>
            </Link>
            <Link to="/admin/synthflow">
              <Button variant="outline">Synthflow</Button>
            </Link>
            <Link to="/admin/patients">
              <Button>Patients</Button>
            </Link>
          </>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading && !stats ? (
        <EmptyNote>Loading dashboard…</EmptyNote>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              label="Doctors"
              value={String(stats?.doctors ?? "—")}
              detail={`${stats?.activeDoctors ?? 0} active`}
            />
            <StatCard
              label="Patients"
              value={String(stats?.patients ?? "—")}
              detail={`${stats?.activePatients ?? 0} active`}
            />
            <StatCard
              label="Voice calls"
              value={String(stats?.voiceCalls ?? "—")}
              detail={`${stats?.phoneBookings ?? 0} with booking`}
            />
            <StatCard
              label="Appointments"
              value={String(stats?.appointments ?? "—")}
              detail="All channels"
            />
            <StatCard
              label="Phone bookings"
              value={String(stats?.phoneBookings ?? "—")}
              detail="Calls linked to APT"
            />
            <StatCard
              label="Inactive accounts"
              value={String(inactiveTotal)}
              detail={`${stats?.inactiveDoctors ?? 0} doctors · ${stats?.inactivePatients ?? 0} patients`}
            />
          </div>

          <Panel className="mt-6 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <SectionLabel>Recent Synthflow calls</SectionLabel>
                <p className="mt-1 text-sm text-muted-foreground">
                  Automatically recorded from the AI receptionist agent.
                </p>
              </div>
              <Link to="/admin/voice-calls">
                <Button variant="soft" size="sm">
                  View all calls
                </Button>
              </Link>
            </div>

            {!recentCalls.length ? (
              <p className="mt-4 text-sm text-muted-foreground">No voice calls recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="pb-2 pr-3 font-medium">When</th>
                      <th className="pb-2 pr-3 font-medium">Caller</th>
                      <th className="pb-2 pr-3 font-medium">Phone</th>
                      <th className="pb-2 pr-3 font-medium">Status</th>
                      <th className="pb-2 font-medium">Appointment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCalls.map((call) => (
                      <tr key={call.id} className="border-t border-border">
                        <td className="whitespace-nowrap py-2 pr-3">
                          {formatWhen(call.endedAt || call.startedAt || call.createdAt)}
                        </td>
                        <td className="py-2 pr-3">{call.callerName || call.patientName || "—"}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{call.fromNumber || "—"}</td>
                        <td className="py-2 pr-3">
                          <Badge tone={call.status === "COMPLETED" ? "success" : "muted"}>{call.status}</Badge>
                        </td>
                        <td className="py-2">
                          {call.appointmentReference ? (
                            <span>
                              {call.appointmentReference}
                              {call.appointmentDate ? (
                                <span className="block text-xs text-muted-foreground">
                                  {call.appointmentDate} · {call.appointmentTime}
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Panel className="p-4">
              <SectionLabel>Voice calls</SectionLabel>
              <p className="mt-2 text-sm text-muted-foreground">
                Review inbound AI receptionist calls and see which calls produced a booking.
              </p>
              <Link to="/admin/voice-calls">
                <Button variant="soft" size="sm" className="mt-3">
                  Open voice calls
                </Button>
              </Link>
            </Panel>
            <Panel className="p-4">
              <SectionLabel>Appointments</SectionLabel>
              <p className="mt-2 text-sm text-muted-foreground">
                Browse all appointment references, doctors, patients, and visit reasons.
              </p>
              <Link to="/admin/appointments">
                <Button variant="soft" size="sm" className="mt-3">
                  Open appointments
                </Button>
              </Link>
            </Panel>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Panel className="p-4">
              <SectionLabel>Doctors</SectionLabel>
              <p className="mt-2 text-sm text-muted-foreground">
                Search accounts, review details and activate or deactivate access.
              </p>
              <Link to="/admin/doctors">
                <Button variant="soft" size="sm" className="mt-3">
                  Open doctors
                </Button>
              </Link>
            </Panel>
            <Panel className="p-4">
              <SectionLabel>Patients</SectionLabel>
              <p className="mt-2 text-sm text-muted-foreground">
                Browse patient accounts and manage active status.
              </p>
              <Link to="/admin/patients">
                <Button variant="soft" size="sm" className="mt-3">
                  Open patients
                </Button>
              </Link>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
