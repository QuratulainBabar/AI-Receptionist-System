import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge, Button, EmptyNote, Avatar } from "@/components/ui/primitives";
import {
  adminApi,
  formatApiError,
  type AdminStats,
  type AdminVoiceCall,
  type ApiAdminDoctor,
} from "@/lib/api";
import { initials } from "@/lib/mock-data";
import { getSession } from "@/lib/session";
import {
  Stethoscope,
  Calendar,
  PhoneCall,
  CreditCard,
  Wallet,
  ArrowRight,
  AlertCircle,
  Settings,
  Activity,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [{ title: "Super Admin dashboard — AI Receptionist" }],
  }),
  component: AdminDashboard,
});

const CARD_STYLE = {
  background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
  border: "1px solid #EEF2F7",
  boxShadow: "0 1px 2px 0 rgba(15,23,42,0.03), 0 10px 28px -16px rgba(15,23,42,0.12)",
} as const;

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function firstName(name: string) {
  return name.replace(/^Dr\.\s+/i, "").split(/\s+/)[0] || name;
}

function AdminDashboard() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const session = getSession();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [recentCalls, setRecentCalls] = useState<AdminVoiceCall[]>([]);
  const [doctors, setDoctors] = useState<ApiAdminDoctor[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [statsResult, callsResult, doctorsResult] = await Promise.all([
        adminApi.stats(),
        adminApi.listVoiceCalls({ limit: 5 }),
        adminApi.listDoctors({ status: "all" }),
      ]);
      setStats(statsResult.stats);
      setRecentCalls(callsResult.calls);
      setDoctors(doctorsResult.users);
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

  const welcomeName = firstName(session?.name || "Admin");
  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const platformBars = useMemo(() => {
    if (!stats) return [];
    return [
      { name: "Doctors", value: stats.doctors, fill: "#2563EB" },
      { name: "Calls", value: stats.voiceCalls ?? 0, fill: "#6366F1" },
      { name: "Appts", value: stats.appointments ?? 0, fill: "#8B5CF6" },
      { name: "Subs", value: stats.activeSubscriptions ?? 0, fill: "#10B981" },
    ];
  }, [stats]);

  const statusDonut = useMemo(() => {
    if (!stats) return [];
    const rows = [
      { name: "Active doctors", value: stats.activeDoctors, color: "#2563EB" },
      { name: "Inactive doctors", value: stats.inactiveDoctors, color: "#94A3B8" },
      { name: "Active subscriptions", value: stats.activeSubscriptions ?? 0, color: "#10B981" },
      { name: "Phone bookings", value: stats.phoneBookings ?? 0, color: "#F59E0B" },
    ].filter((row) => row.value > 0);
    return rows;
  }, [stats]);

  const statusTotal = statusDonut.reduce((sum, row) => sum + row.value, 0);

  const topDoctors = useMemo(() => {
    return [...doctors]
      .sort((a, b) => (b.totalAppointments || 0) - (a.totalAppointments || 0))
      .slice(0, 6);
  }, [doctors]);

  const maxDoctorAppts = Math.max(1, ...topDoctors.map((d) => d.totalAppointments || 0));

  const kpiCards = [
    {
      label: "Total doctors",
      value: String(stats?.doctors ?? "—"),
      detail: `${stats?.activeDoctors ?? 0} active`,
      icon: <Stethoscope className="size-5" strokeWidth={2.2} />,
      iconBg: "rgba(37,99,235,0.12)",
      iconColor: "#2563EB",
    },
    {
      label: "Active subscriptions",
      value: String(stats?.activeSubscriptions ?? "—"),
      detail: `${stats?.inactiveDoctors ?? 0} inactive doctors`,
      icon: <CreditCard className="size-5" strokeWidth={2.2} />,
      iconBg: "rgba(16,185,129,0.12)",
      iconColor: "#10B981",
    },
    {
      label: "Voice calls",
      value: String(stats?.voiceCalls ?? "—"),
      detail: `${stats?.phoneBookings ?? 0} phone bookings`,
      icon: <PhoneCall className="size-5" strokeWidth={2.2} />,
      iconBg: "rgba(99,102,241,0.12)",
      iconColor: "#6366F1",
    },
    {
      label: "Appointments",
      value: String(stats?.appointments ?? "—"),
      detail: "Platform booking total",
      icon: <Calendar className="size-5" strokeWidth={2.2} />,
      iconBg: "rgba(139,92,246,0.12)",
      iconColor: "#8B5CF6",
    },
  ];

  return (
    <>
      <section
        className="relative mb-6 overflow-hidden rounded-[18px] px-4 py-5 sm:rounded-[22px] sm:px-7 sm:py-7"
        style={{
          background: "linear-gradient(115deg, #0B1E4B 0%, #123A8A 48%, #1D4ED8 100%)",
          boxShadow: "0 18px 40px -24px rgba(29, 78, 216, 0.55)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 88% 18%, rgba(147,197,253,0.35) 0%, transparent 42%), radial-gradient(circle at 8% 90%, rgba(99,102,241,0.28) 0%, transparent 45%)",
          }}
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-5">
          <div className="min-w-0 max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/90">
              Platform overview
            </p>
            <h1 className="mt-2 font-jakarta text-[clamp(1.4rem,3vw,2.35rem)] font-extrabold tracking-tight text-white">
              Welcome back, {welcomeName} 👋
            </h1>
            <p className="mt-2 max-w-md text-[12.5px] leading-snug text-blue-100/80">
              Clinics, voice calls, appointments, and subscriptions at a glance.
            </p>
            <p className="mt-3 text-[12.5px] font-semibold text-blue-200/75">{todayLabel}</p>
          </div>
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:gap-2.5">
            <Link to="/admin/doctors" className="min-w-0 flex-1 sm:flex-none">
              <Button
                size="md"
                className="w-full rounded-xl border border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white sm:w-auto [&_svg]:text-white"
              >
                <Stethoscope className="size-4.5 text-white" strokeWidth={2} />
                Doctors
              </Button>
            </Link>
            <Link to="/admin/earnings" className="min-w-0 flex-1 sm:flex-none">
              <Button
                size="md"
                className="w-full rounded-xl border border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white sm:w-auto [&_svg]:text-white"
              >
                <Wallet className="size-4.5 text-white" strokeWidth={2} />
                Earnings
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading && !stats ? (
        <EmptyNote>Loading dashboard…</EmptyNote>
      ) : (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
            {kpiCards.map((card) => (
              <div
                key={card.label}
                className="min-w-0 rounded-[18px] p-4 transition-all duration-300 hover:-translate-y-0.5 sm:p-5"
                style={CARD_STYLE}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500">
                      {card.label}
                    </p>
                    <p className="mt-2.5 font-jakarta text-[clamp(1.7rem,2.6vw,2.05rem)] font-extrabold leading-none tracking-tight text-slate-900">
                      {card.value}
                    </p>
                    <p className="mt-2.5 text-[12.5px] font-semibold text-slate-500">{card.detail}</p>
                  </div>
                  <div
                    className="grid size-11 shrink-0 place-items-center rounded-2xl"
                    style={{ background: card.iconBg, color: card.iconColor }}
                  >
                    {card.icon}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 grid min-w-0 gap-4 xl:grid-cols-[1.35fr_1fr]">
            <div className="min-w-0 rounded-[18px] p-4 sm:p-5" style={CARD_STYLE}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-jakarta text-[16px] font-bold text-slate-900">
                    Platform metrics
                  </h2>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    Current totals across the live clinic system
                  </p>
                </div>
                <Link to="/admin/subscriptions">
                  <Button variant="soft" size="sm" className="rounded-xl gap-1.5">
                    Subscriptions
                    <ArrowRight className="size-3.5" />
                  </Button>
                </Link>
              </div>
              {platformBars.some((row) => row.value > 0) ? (
                <div className="chart-box h-[200px] sm:h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={platformBars} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="adminBarGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#3B82F6" stopOpacity={1} />
                          <stop offset="100%" stopColor="#1D4ED8" stopOpacity={0.85} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#EEF2F7" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 12, fill: "#94A3B8", fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                        dy={8}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 12, fill: "#94A3B8", fontWeight: 600 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "rgba(37,99,235,0.04)" }}
                        contentStyle={{
                          borderRadius: 14,
                          border: "1px solid #E2E8F0",
                          boxShadow: "0 12px 24px -12px rgba(15,23,42,0.18)",
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      />
                      <Bar dataKey="value" name="Count" radius={[10, 10, 4, 4]} barSize={36}>
                        {platformBars.map((row) => (
                          <Cell key={row.name} fill={row.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyNote>No platform metrics available yet.</EmptyNote>
              )}
            </div>

            <div className="min-w-0 rounded-[18px] p-4 sm:p-5" style={CARD_STYLE}>
              <div className="mb-4">
                <h2 className="font-jakarta text-[16px] font-bold text-slate-900">Platform status</h2>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  Doctors, subscriptions, and booking activity
                </p>
              </div>
              {statusDonut.length ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="relative mx-auto h-[160px] w-[160px] shrink-0 sm:h-[180px] sm:w-[180px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusDonut}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={58}
                          outerRadius={82}
                          paddingAngle={3}
                          strokeWidth={0}
                        >
                          {statusDonut.map((entry) => (
                            <Cell key={entry.name} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: 12,
                            border: "1px solid #E2E8F0",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute inset-0 grid place-items-center">
                      <div className="text-center">
                        <p className="font-jakarta text-xl font-extrabold text-slate-900">
                          {statusTotal}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Total
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1 space-y-3">
                    {statusDonut.map((row) => {
                      const pct = statusTotal ? Math.round((row.value / statusTotal) * 100) : 0;
                      return (
                        <div key={row.name}>
                          <div className="mb-1 flex items-center justify-between gap-2 text-[12.5px]">
                            <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                              <span
                                className="size-2.5 rounded-full"
                                style={{ background: row.color }}
                              />
                              {row.name}
                            </span>
                            <span className="font-bold text-slate-900">
                              {row.value}
                              <span className="ml-1 font-semibold text-slate-400">({pct}%)</span>
                            </span>
                          </div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full"
                              style={{ width: `${pct}%`, background: row.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <EmptyNote>No account status data yet.</EmptyNote>
              )}
            </div>
          </div>

          <div className="mt-6 min-w-0 rounded-[18px] p-4 sm:p-5" style={CARD_STYLE}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-jakarta text-[16px] font-bold text-slate-900">
                  Top doctors by appointments
                </h2>
                <p className="mt-0.5 text-[13px] text-slate-500">
                  Ranked from live clinic appointment totals
                </p>
              </div>
              <Link to="/admin/doctors">
                <Button variant="soft" size="sm" className="rounded-xl gap-1.5">
                  Manage doctors
                  <ArrowRight className="size-3.5" />
                </Button>
              </Link>
            </div>
            {!topDoctors.length ? (
              <EmptyNote>No doctors on the platform yet.</EmptyNote>
            ) : (
              <div className="space-y-3">
                {topDoctors.map((doctor, index) => {
                  const appts = doctor.totalAppointments || 0;
                  const pct = Math.round((appts / maxDoctorAppts) * 100);
                  return (
                    <div
                      key={doctor.id}
                      className="grid items-center gap-3 rounded-2xl border border-slate-100 px-3.5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(120px,1.4fr)_auto]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="grid size-8 shrink-0 place-items-center rounded-xl text-[11px] font-extrabold text-white"
                          style={{
                            background:
                              index === 0
                                ? "linear-gradient(135deg,#2563EB,#1D4ED8)"
                                : index === 1
                                  ? "linear-gradient(135deg,#0D9488,#0F766E)"
                                  : index === 2
                                    ? "linear-gradient(135deg,#6366F1,#4F46E5)"
                                    : "linear-gradient(135deg,#94A3B8,#64748B)",
                          }}
                        >
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-bold text-slate-900">
                            {doctor.fullName}
                          </p>
                          <p className="truncate text-[12px] text-slate-500">
                            {doctor.specialty || "Specialty not set"}
                            {doctor.clinic ? ` · ${doctor.clinic}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: "linear-gradient(90deg,#3B82F6,#1D4ED8)",
                            }}
                          />
                        </div>
                      </div>
                      <div className="text-right text-[12.5px] font-bold text-slate-700">
                        {appts} appointments
                        {doctor.upcomingAppointments ? (
                          <span className="ml-1 font-semibold text-slate-400">
                            · {doctor.upcomingAppointments} upcoming
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-6 min-w-0 rounded-[18px] p-4 sm:p-5" style={CARD_STYLE}>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <span
                  className="grid size-10 shrink-0 place-items-center rounded-2xl"
                  style={{ background: "rgba(37,99,235,0.1)", color: "#2563EB" }}
                >
                  <PhoneCall className="size-5" strokeWidth={2.2} />
                </span>
                <div>
                  <h2 className="font-jakarta text-[16px] font-bold text-slate-900">
                    Recent Synthflow voice calls
                  </h2>
                  <p className="mt-0.5 text-[13px] text-slate-500">
                    Automatically recorded from the AI receptionist agent
                  </p>
                </div>
              </div>
            </div>

            {!recentCalls.length ? (
              <p className="py-10 text-center text-sm text-slate-500">No voice calls recorded yet.</p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-slate-100">
                <div className="table-scroll">
                  <table className="w-full min-w-[560px] text-sm sm:min-w-[640px]">
                    <thead
                      style={{
                        background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)",
                        position: "sticky",
                        top: 0,
                      }}
                    >
                      <tr>
                        {["Caller", "Phone", "Status", "Appointment"].map((heading) => (
                          <th
                            key={heading}
                            className="px-4 py-3 text-left text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-500"
                          >
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {recentCalls.map((call) => (
                        <tr
                          key={call.id}
                          className="border-t border-slate-100 transition-colors hover:bg-slate-50/80"
                        >
                          <td className="px-4 py-3.5">
                            <div className="flex min-w-0 items-center gap-3">
                              <Avatar
                                label={initials(call.callerName || call.patientName || "UC")}
                                size="sm"
                                className="size-9"
                              />
                              <div className="min-w-0">
                                <p className="truncate text-[13px] font-bold text-slate-900">
                                  {call.callerName || call.patientName || "Unknown"}
                                </p>
                                <p className="font-mono text-[11px] text-slate-400">
                                  {formatWhen(call.endedAt || call.startedAt || call.createdAt)}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 font-mono text-[12px] font-semibold text-slate-600">
                            {call.fromNumber || "—"}
                          </td>
                          <td className="px-4 py-3.5">
                            <Badge
                              tone={call.status === "COMPLETED" ? "success" : "muted"}
                              dot
                              className="rounded-full px-2.5 py-0.5 text-[10px]"
                            >
                              {call.status}
                            </Badge>
                          </td>
                          <td className="px-4 py-3.5">
                            {call.appointmentReference ? (
                              <div className="min-w-0">
                                <p className="truncate text-[12.5px] font-bold text-slate-900">
                                  {call.appointmentReference}
                                </p>
                                {call.appointmentDate ? (
                                  <p className="text-[11px] text-slate-400">
                                    {call.appointmentDate} · {call.appointmentTime}
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-slate-400">
                                <AlertCircle className="size-3.5" />
                                No booking
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="mt-7">
            <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Quick actions
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  to: "/admin/doctors" as const,
                  label: "Doctors",
                  icon: <Stethoscope className="size-5" strokeWidth={2.2} />,
                },
                {
                  to: "/admin/earnings" as const,
                  label: "Earnings",
                  icon: <Wallet className="size-5" strokeWidth={2.2} />,
                },
                {
                  to: "/admin/subscriptions" as const,
                  label: "Subscriptions",
                  icon: <CreditCard className="size-5" strokeWidth={2.2} />,
                },
                {
                  to: "/admin/settings" as const,
                  label: "Settings",
                  icon: <Settings className="size-5" strokeWidth={2.2} />,
                },
              ].map((action) => (
                <Link key={action.to} to={action.to}>
                  <div
                    className="flex items-center gap-3 rounded-[18px] p-4 transition-all duration-300 hover:-translate-y-0.5"
                    style={CARD_STYLE}
                  >
                    <span
                      className="grid size-11 place-items-center rounded-2xl"
                      style={{ background: "rgba(37,99,235,0.1)", color: "#2563EB" }}
                    >
                      {action.icon}
                    </span>
                    <span className="text-[14px] font-bold text-slate-800">{action.label}</span>
                    <Activity className="ml-auto size-4 text-slate-300" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
