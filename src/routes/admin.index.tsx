import { createFileRoute, Link, useRouterState } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import {
  Badge,
  Button,
  EmptyNote,
  PageHeader,
  Panel,
  SectionLabel,
  StatCard,
  CardHeader,
  Avatar,
} from "@/components/ui/primitives";
import { adminApi, formatApiError, type AdminStats, type AdminVoiceCall } from "@/lib/api";
import { initials } from "@/lib/mock-data";
import {
  Stethoscope,
  Users,
  Calendar,
  PhoneCall,
  CreditCard,
  DollarSign,
  Activity,
  ArrowRight,
  Phone,
  Shield,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";

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

const subscriptionGrowthData = [
  { month: "Jan", doctors: 42, revenue: 8400 },
  { month: "Feb", doctors: 58, revenue: 11600 },
  { month: "Mar", doctors: 76, revenue: 15200 },
  { month: "Apr", doctors: 95, revenue: 19000 },
  { month: "May", doctors: 118, revenue: 23600 },
  { month: "Jun", doctors: 142, revenue: 28400 },
];

const appointmentActivityData = [
  { day: "Mon", appointments: 128, calls: 64, bookings: 42 },
  { day: "Tue", appointments: 145, calls: 72, bookings: 55 },
  { day: "Wed", appointments: 162, calls: 88, bookings: 64 },
  { day: "Thu", appointments: 155, calls: 95, bookings: 58 },
  { day: "Fri", appointments: 180, calls: 110, bookings: 78 },
  { day: "Sat", appointments: 140, calls: 85, bookings: 52 },
  { day: "Sun", appointments: 95, calls: 58, bookings: 32 },
];

const doctorActivityData = [
  { name: "Dr. Johnson", appointments: 148, hours: 52, rating: 4.9 },
  { name: "Dr. Williams", appointments: 132, hours: 48, rating: 4.8 },
  { name: "Dr. Davis", appointments: 115, hours: 44, rating: 4.7 },
  { name: "Dr. Brown", appointments: 108, hours: 42, rating: 4.6 },
  { name: "Dr. Miller", appointments: 95, hours: 38, rating: 4.9 },
  { name: "Dr. Garcia", appointments: 88, hours: 35, rating: 4.8 },
];

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

  const kpiData = [
    {
      label: "Doctors",
      value: String(stats?.doctors ?? "—"),
      icon: "doctors" as const,
      trend: "+12%",
      trendLabel: "this month",
      trendPositive: true,
      detail: `${stats?.activeDoctors ?? 0} active`,
      miniChart: [32, 38, 45, 52, 60, 75, 95],
    },
    {
      label: "Patients",
      value: String(stats?.patients ?? "—"),
      icon: "patients" as const,
      trend: "+18%",
      trendLabel: "this month",
      trendPositive: true,
      detail: `${stats?.activePatients ?? 0} active`,
      miniChart: [420, 540, 680, 820, 980, 1120, 1248],
    },
    {
      label: "Voice Calls",
      value: String(stats?.voiceCalls ?? "—"),
      icon: "calls" as const,
      trend: "+24%",
      trendLabel: "this week",
      trendPositive: true,
      detail: `${stats?.phoneBookings ?? 0} with booking`,
      miniChart: [80, 110, 150, 190, 240, 310, 385],
    },
    {
      label: "Appointments",
      value: String(stats?.appointments ?? "—"),
      icon: "appointments" as const,
      trend: "+15%",
      trendLabel: "this week",
      trendPositive: true,
      detail: "All channels",
      miniChart: [180, 220, 280, 340, 420, 500, 580],
    },
    {
      label: "Phone Bookings",
      value: String(stats?.phoneBookings ?? "—"),
      icon: "bookings" as const,
      trend: "+32%",
      trendLabel: "this month",
      trendPositive: true,
      detail: "Calls linked to APT",
      miniChart: [24, 38, 56, 78, 102, 135, 168],
    },
    {
      label: "Subscriptions",
      value: String(stats?.activeSubscriptions ?? "—"),
      icon: "subscriptions" as const,
      trend: "+9.5%",
      trendLabel: "this month",
      trendPositive: true,
      detail: "Active or trialing",
      miniChart: [28, 35, 42, 50, 60, 72, 84],
    },
  ];

  return (
    <>
      <div className="mb-7 flex flex-wrap items-end justify-between gap-5">
        <div className="min-w-0 max-w-3xl">
          <p className="label-mono text-blue-600/80 mb-1">Super Admin Console</p>
          <h1
            className="font-[--font-display] font-extrabold tracking-tight text-foreground text-balance flex items-center gap-3 flex-wrap"
            style={{
              fontSize: "clamp(1.75rem, 3vw, 2.25rem)",
              letterSpacing: "-0.03em",
            }}
          >
            Platform Analytics
            <Shield className="size-8" strokeWidth={2.2} style={{ color: "#1D4ED8" }} />
          </h1>
          <p
            className="mt-2.5 text-[14.5px] leading-relaxed max-w-2xl"
            style={{ color: "#64748B" }}
          >
            Complete overview of doctors, patients, voice calls, appointments and platform revenue —
            all in one elegant place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Link to="/admin/voice-calls">
            <Button variant="outline" size="md" className="rounded-xl">
              <Phone className="size-4.5" strokeWidth={2} />
              Voice calls
            </Button>
          </Link>
          <Link to="/admin/appointments">
            <Button variant="outline" size="md" className="rounded-xl">
              <Calendar className="size-4.5" strokeWidth={2} />
              Appointments
            </Button>
          </Link>
          <Link to="/admin/synthflow">
            <Button variant="outline" size="md" className="rounded-xl">
              <Activity className="size-4.5" strokeWidth={2} />
              Synthflow
            </Button>
          </Link>
          <Link to="/admin/subscriptions">
            <Button variant="outline" size="md" className="rounded-xl">
              <CreditCard className="size-4.5" strokeWidth={2} />
              Subscriptions
            </Button>
          </Link>
          <Link to="/admin/doctors">
            <Button size="md" className="rounded-xl">
              <Stethoscope className="size-4.5" strokeWidth={2} />
              Manage Doctors
            </Button>
          </Link>
        </div>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading && !stats ? (
        <EmptyNote>Loading dashboard…</EmptyNote>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {kpiData.map((k) => (
              <StatCard
                key={k.label}
                label={k.label}
                value={k.value}
                icon={k.icon}
                trend={k.trend}
                trendLabel={k.trendLabel}
                trendPositive={k.trendPositive}
                detail={k.detail}
                miniChart={k.miniChart}
              />
            ))}
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                border: "1px solid #EEF2F7",
                boxShadow: "0 1px 2px 0 rgba(15,23,42,0.03), 0 8px 24px -14px rgba(15,23,42,0.1)",
              }}
            >
              <CardHeader
                title="Subscription Growth"
                subtitle="Doctors enrolled & monthly revenue"
                icon={<CreditCard className="size-5" strokeWidth={2.2} />}
                action={
                  <Link to="/admin/subscriptions">
                    <Button variant="soft" size="sm" className="rounded-xl">
                      View plans
                      <ArrowRight className="size-4" strokeWidth={2.3} />
                    </Button>
                  </Link>
                }
              />
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={subscriptionGrowthData}
                    margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
                  >
                    <defs>
                      <linearGradient id="drGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="rvGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#EEF2F7" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: 12, fill: "#94A3B8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      dy={8}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#94A3B8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      dx={-5}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #E2E8F0",
                        boxShadow: "0 12px 24px -12px rgba(15,23,42,0.18)",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 600 }}
                      iconType="circle"
                      iconSize={10}
                    />
                    <Area
                      type="monotone"
                      dataKey="doctors"
                      name="Doctors"
                      stroke="#2563EB"
                      strokeWidth={2.8}
                      fill="url(#drGrad)"
                    />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Revenue ($)"
                      stroke="#10B981"
                      strokeWidth={2.8}
                      fill="url(#rvGrad)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                border: "1px solid #EEF2F7",
                boxShadow: "0 1px 2px 0 rgba(15,23,42,0.03), 0 8px 24px -14px rgba(15,23,42,0.1)",
              }}
            >
              <CardHeader
                title="Appointment Activity"
                subtitle="Weekly booking channel distribution"
                icon={<Calendar className="size-5" strokeWidth={2.2} />}
                action={
                  <Link to="/admin/appointments">
                    <Button variant="soft" size="sm" className="rounded-xl">
                      All appointments
                      <ArrowRight className="size-4" strokeWidth={2.3} />
                    </Button>
                  </Link>
                }
              />
              <div className="h-[240px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={appointmentActivityData}
                    margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#EEF2F7" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 12, fill: "#94A3B8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      dy={8}
                    />
                    <YAxis
                      tick={{ fontSize: 12, fill: "#94A3B8", fontWeight: 600 }}
                      axisLine={false}
                      tickLine={false}
                      dx={-5}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 14,
                        border: "1px solid #E2E8F0",
                        boxShadow: "0 12px 24px -12px rgba(15,23,42,0.18)",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: 10, fontSize: 12, fontWeight: 600 }}
                      iconType="circle"
                      iconSize={10}
                    />
                    <Bar
                      dataKey="appointments"
                      name="Appointments"
                      fill="#2563EB"
                      radius={[8, 8, 0, 0]}
                      barSize={18}
                    />
                    <Bar
                      dataKey="calls"
                      name="AI Calls"
                      fill="#0D9488"
                      radius={[8, 8, 0, 0]}
                      barSize={18}
                    />
                    <Bar
                      dataKey="bookings"
                      name="Bookings"
                      fill="#8B5CF6"
                      radius={[8, 8, 0, 0]}
                      barSize={18}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                border: "1px solid #EEF2F7",
                boxShadow: "0 1px 2px 0 rgba(15,23,42,0.03), 0 8px 24px -14px rgba(15,23,42,0.1)",
              }}
            >
              <CardHeader
                title="Recent Synthflow Voice Calls"
                subtitle="Automatically recorded from the AI receptionist agent"
                icon={<PhoneCall className="size-5" strokeWidth={2.2} />}
                action={
                  <Link to="/admin/voice-calls">
                    <Button variant="soft" size="sm" className="rounded-xl">
                      View all calls
                      <ArrowRight className="size-4" strokeWidth={2.3} />
                    </Button>
                  </Link>
                }
              />

              {!recentCalls.length ? (
                <p className="mt-4 text-sm text-muted-foreground text-center py-10">
                  No voice calls recorded yet.
                </p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-[#F1F5F9]">
                  <div className="overflow-x-auto max-h-[360px] scrollbar-thin">
                    <table className="w-full min-w-full text-sm">
                      <thead
                        style={{
                          background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)",
                          position: "sticky",
                          top: 0,
                        }}
                      >
                        <tr>
                          <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            Caller
                          </th>
                          <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            Phone
                          </th>
                          <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            Status
                          </th>
                          <th className="text-left px-4 py-3 text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            Appointment
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {recentCalls.map((call) => (
                          <tr
                            key={call.id}
                            className="border-t border-[#F1F5F9] transition-colors hover:bg-muted/30"
                          >
                            <td className="py-3 px-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <Avatar
                                  label={initials(call.callerName || call.patientName || "UC")}
                                  size="sm"
                                  className="size-9"
                                />
                                <div className="min-w-0">
                                  <p className="text-[13px] font-bold text-foreground truncate">
                                    {call.callerName || call.patientName || "Unknown"}
                                  </p>
                                  <p className="text-[11px] font-mono text-muted-foreground/80">
                                    {formatWhen(call.endedAt || call.startedAt || call.createdAt)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="py-3 px-4 font-mono text-[12px] font-semibold text-muted-foreground">
                              {call.fromNumber || "—"}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                tone={call.status === "COMPLETED" ? "success" : "muted"}
                                dot
                                className="px-2.5 py-0.5 rounded-full text-[10px]"
                              >
                                {call.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              {call.appointmentReference ? (
                                <div className="min-w-0">
                                  <p className="text-[12.5px] font-bold text-foreground truncate">
                                    {call.appointmentReference}
                                  </p>
                                  {call.appointmentDate ? (
                                    <p className="text-[11px] text-muted-foreground/80">
                                      {call.appointmentDate} · {call.appointmentTime}
                                    </p>
                                  ) : null}
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
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

            <div
              className="rounded-2xl p-5"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                border: "1px solid #EEF2F7",
                boxShadow: "0 1px 2px 0 rgba(15,23,42,0.03), 0 8px 24px -14px rgba(15,23,42,0.1)",
              }}
            >
              <CardHeader
                title="Top Performing Doctors"
                subtitle="This week's activity & ratings"
                icon={<Stethoscope className="size-5" strokeWidth={2.2} />}
                action={
                  <Link to="/admin/doctors">
                    <Button variant="soft" size="sm" className="rounded-xl">
                      Manage doctors
                      <ArrowRight className="size-4" strokeWidth={2.3} />
                    </Button>
                  </Link>
                }
              />
              <div className="space-y-3 mt-2">
                {doctorActivityData.map((d, i) => (
                  <div
                    key={d.name}
                    className="flex items-center gap-4 rounded-2xl p-3.5 transition-all hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-sm"
                    style={{ border: "1px solid #F1F5F9" }}
                  >
                    <div
                      className="grid size-9 shrink-0 place-items-center rounded-xl text-[12px] font-extrabold"
                      style={{
                        background:
                          i === 0
                            ? "linear-gradient(135deg, #F59E0B, #D97706)"
                            : i === 1
                              ? "linear-gradient(135deg, #94A3B8, #64748B)"
                              : i === 2
                                ? "linear-gradient(135deg, #CD7F32, #A6662A)"
                                : "linear-gradient(135deg, #F1F5F9, #E2E8F0)",
                        color: i < 3 ? "#FFFFFF" : "#94A3B8",
                        boxShadow: i < 3 ? "0 4px 12px -4px rgba(15,23,42,0.25)" : "none",
                      }}
                    >
                      #{i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <p className="text-[13.5px] font-bold text-foreground truncate">{d.name}</p>
                        <Badge tone="accent" dot className="px-2 py-0.5 rounded-full text-[10px]">
                          ⭐ {d.rating.toFixed(1)}
                        </Badge>
                      </div>
                      <div className="mt-1.5 flex items-center gap-4 flex-wrap">
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                          <Calendar className="size-3.5" />
                          {d.appointments} apts
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted-foreground">
                          <Clock className="size-3.5" />
                          {d.hours} hrs
                        </span>
                      </div>
                    </div>
                    <div className="w-24 shrink-0">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${(d.appointments / 148) * 100}%`,
                            background:
                              i < 2
                                ? "linear-gradient(90deg, #10B981, #059669)"
                                : "linear-gradient(90deg, #3B82F6, #1D4ED8)",
                          }}
                        />
                      </div>
                      <p className="mt-1 text-right text-[10.5px] font-bold text-muted-foreground/80">
                        {Math.round((d.appointments / 148) * 100)}%
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Voice Calls",
                desc: "Review inbound AI receptionist calls and see which calls produced a booking.",
                to: "/admin/voice-calls",
                icon: <PhoneCall className="size-5" strokeWidth={2.3} />,
                tone: "primary",
              },
              {
                title: "Appointments",
                desc: "Browse all appointment references, doctors, patients, and visit reasons.",
                to: "/admin/appointments",
                icon: <Calendar className="size-5" strokeWidth={2.3} />,
                tone: "info",
              },
              {
                title: "Doctors",
                desc: "Search accounts, review details and activate or deactivate access.",
                to: "/admin/doctors",
                icon: <Stethoscope className="size-5" strokeWidth={2.3} />,
                tone: "success",
              },
              {
                title: "Patients",
                desc: "Browse patient accounts and manage active status and records.",
                to: "/admin/patients",
                icon: <Users className="size-5" strokeWidth={2.3} />,
                tone: "accent",
              },
              {
                title: "Subscriptions",
                desc: "Manage Stripe subscription plans, pricing and billing status.",
                to: "/admin/subscriptions",
                icon: <DollarSign className="size-5" strokeWidth={2.3} />,
                tone: "warning",
              },
              {
                title: "Synthflow AI",
                desc: "Configure voice AI agent settings, phone numbers and call flow.",
                to: "/admin/synthflow",
                icon: <Activity className="size-5" strokeWidth={2.3} />,
                tone: "primary",
              },
              {
                title: "Billing Overview",
                desc: "Track platform revenue, MRR, churn and payment issues.",
                to: "/admin/subscriptions",
                icon: <CreditCard className="size-5" strokeWidth={2.3} />,
                tone: "success",
              },
              {
                title: "Platform Health",
                desc: "System status, API health, call success rates and error monitoring.",
                to: "/admin/voice-calls",
                icon: <CheckCircle2 className="size-5" strokeWidth={2.3} />,
                tone: "info",
              },
            ].map((card, i) => (
              <Link key={i} to={card.to}>
                <div
                  className="group h-full rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1 cursor-pointer"
                  style={{
                    background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                    border: "1px solid #EEF2F7",
                    boxShadow:
                      "0 1px 2px 0 rgba(15,23,42,0.03), 0 8px 20px -16px rgba(15,23,42,0.12)",
                  }}
                >
                  <div
                    className="grid size-11 place-items-center rounded-2xl mb-4 transition-transform group-hover:scale-110"
                    style={{
                      background:
                        card.tone === "primary"
                          ? "linear-gradient(135deg, rgba(59, 130, 246, 0.14), rgba(59, 130, 246, 0.06))"
                          : card.tone === "success"
                            ? "linear-gradient(135deg, rgba(16, 185, 129, 0.14), rgba(16, 185, 129, 0.06))"
                            : card.tone === "warning"
                              ? "linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(245, 158, 11, 0.06))"
                              : card.tone === "accent"
                                ? "linear-gradient(135deg, rgba(139, 92, 246, 0.14), rgba(139, 92, 246, 0.06))"
                                : "linear-gradient(135deg, rgba(14, 165, 233, 0.14), rgba(14, 165, 233, 0.06))",
                      color:
                        card.tone === "primary"
                          ? "#1D4ED8"
                          : card.tone === "success"
                            ? "#047857"
                            : card.tone === "warning"
                              ? "#B45309"
                              : card.tone === "accent"
                                ? "#6D28D9"
                                : "#0369A1",
                    }}
                  >
                    {card.icon}
                  </div>
                  <h4 className="font-[--font-display] text-[14.5px] font-extrabold tracking-tight text-foreground mb-1.5">
                    {card.title}
                  </h4>
                  <p
                    className="text-[12.5px] leading-relaxed text-muted-foreground mb-4"
                    style={{ color: "#64748B" }}
                  >
                    {card.desc}
                  </p>
                  <span className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-blue-600 transition-all group-hover:gap-2.5">
                    Open module
                    <ArrowRight className="size-4" strokeWidth={2.5} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
