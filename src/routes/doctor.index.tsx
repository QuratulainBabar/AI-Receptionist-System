import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { AppointmentCard } from "@/components/shared/cards";
import { AppointmentInvoiceAction } from "@/components/doctor/AppointmentInvoiceAction";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Button,
  EmptyNote,
  PageHeader,
  Panel,
  SectionLabel,
  Badge,
  CardHeader,
  Avatar,
} from "@/components/ui/primitives";
import { doctorDashboardApi, formatApiError, type ApiDoctorDashboard } from "@/lib/api";
import { useDoctorAccess } from "@/lib/doctor-access";
import { initials, statusTone } from "@/lib/mock-data";
import { getSession } from "@/lib/session";
import {
  Calendar,
  Users,
  Clock,
  FileText,
  Activity,
  Bell,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Brain,
  CheckCircle2,
  AlertTriangle,
  HeartPulse,
  Stethoscope,
  Eye,
  MoreHorizontal,
} from "lucide-react";

export const Route = createFileRoute("/doctor/")({
  validateSearch: (search: Record<string, unknown>) => ({
    checkout: search["checkout"] === "success" ? ("success" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Doctor dashboard — AI Receptionist" },
      {
        name: "description",
        content: "Today's appointments, patient queue and clinic notifications.",
      },
      { property: "og:title", content: "Doctor dashboard — AI Receptionist" },
      {
        property: "og:description",
        content: "See your schedule for today and open patient files.",
      },
    ],
  }),
  component: DoctorDashboard,
});

const quickActions = [
  { to: "/doctor/appointments", label: "All appointments" },
  { to: "/doctor/patients", label: "Patient list" },
  { to: "/doctor/notifications", label: "Notifications" },
  { to: "/doctor/records", label: "History & reports" },
  { to: "/doctor/subscription", label: "Plans" },
] as const;

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function firstNameFromDoctor(name: string) {
  return name.replace(/^Dr\.\s+/i, "").split(" ")[0] || name;
}

const appointmentTrendsData = [
  { day: "Mon", value: 8, trend: 6 },
  { day: "Tue", value: 12, trend: 10 },
  { day: "Wed", value: 14, trend: 12 },
  { day: "Thu", value: 11, trend: 13 },
  { day: "Fri", value: 15, trend: 14 },
  { day: "Sat", value: 18, trend: 16 },
  { day: "Sun", value: 20, trend: 18 },
];

const patientGrowthData = [
  { category: "New", value: 520, color: "#2563EB" },
  { category: "Follow-up", value: 420, color: "#0D9488" },
  { category: "Returning", value: 310, color: "#10B981" },
  { category: "Other", value: 150, color: "#8B5CF6" },
];

const consultationData = [
  { day: "Mon", "In-Person": 12, Telehealth: 4, "Follow-up": 2 },
  { day: "Tue", "In-Person": 14, Telehealth: 6, "Follow-up": 4 },
  { day: "Wed", "In-Person": 10, Telehealth: 8, "Follow-up": 3 },
  { day: "Thu", "In-Person": 15, Telehealth: 5, "Follow-up": 5 },
  { day: "Fri", "In-Person": 18, Telehealth: 7, "Follow-up": 6 },
  { day: "Sat", "In-Person": 16, Telehealth: 10, "Follow-up": 4 },
  { day: "Sun", "In-Person": 14, Telehealth: 12, "Follow-up": 8 },
];

const appointmentStatusData = [
  { name: "Completed", value: 17, color: "#10B981" },
  { name: "Pending", value: 4, color: "#F59E0B" },
  { name: "Cancelled", value: 3, color: "#EF4444" },
];

function DoctorDashboard() {
  const session = getSession();
  const access = useDoctorAccess();
  const search = Route.useSearch();
  const [dashboard, setDashboard] = useState<ApiDoctorDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [scheduleDate, setScheduleDate] = useState(() => new Date(2026, 3, 28));
  const [calendarOpen, setCalendarOpen] = useState(false);

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

  const scheduleDateLabel = scheduleDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  function shiftScheduleDate(days: number) {
    setScheduleDate((current) => {
      const next = new Date(current);
      next.setDate(next.getDate() + days);
      return next;
    });
  }

  const todayAppointmentsCount = dashboard?.todayVisitsCount ?? 0;
  const totalPatients = dashboard?.patientsCount ?? 0;
  const awaitingConfirmCount = dashboard?.awaitingConfirmCount ?? 0;
  const unreadAlerts = dashboard?.unreadAlerts ?? 0;
  const clinicLabel = dashboard?.clinic?.trim() || "Your clinic";
  const specialtyLabel = dashboard?.speciality?.trim() || "";
  const todayFullLabel = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const samplePatients = [
    {
      name: "Emma Watson",
      age: 32,
      gender: "Female",
      lastVisit: "Today, 09:15 AM",
      bp: "118/76",
      hr: "72 bpm",
      status: "Good",
    },
    {
      name: "John Miller",
      age: 45,
      gender: "Male",
      lastVisit: "Yesterday, 08:40 AM",
      bp: "132/84",
      hr: "68 bpm",
      status: "Good",
    },
    {
      name: "Sophia Brown",
      age: 28,
      gender: "Female",
      lastVisit: "Yesterday, 04:20 PM",
      bp: "124/80",
      hr: "76 bpm",
      status: "Good",
    },
    {
      name: "Michael Davis",
      age: 51,
      gender: "Male",
      lastVisit: "Apr 26, 2026",
      bp: "138/88",
      hr: "82 bpm",
      status: "Watch",
    },
    {
      name: "Olivia Martinez",
      age: 29,
      gender: "Female",
      lastVisit: "Apr 26, 2026",
      bp: "116/74",
      hr: "70 bpm",
      status: "Good",
    },
  ];

  return (
    <>
      <section
        className="relative mb-4 overflow-hidden rounded-[22px] px-5 py-6 sm:px-7 sm:py-7"
        style={{
          background: "linear-gradient(115deg, #0B1E4B 0%, #123A8A 48%, #1D4ED8 100%)",
          boxShadow: "0 18px 40px -24px rgba(29, 78, 216, 0.5)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "radial-gradient(circle at 88% 18%, rgba(147,197,253,0.35) 0%, transparent 42%), radial-gradient(circle at 8% 90%, rgba(99,102,241,0.25) 0%, transparent 45%)",
          }}
        />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 max-w-2xl">
            <h1 className="font-jakarta text-[clamp(1.55rem,2.8vw,2.1rem)] font-extrabold tracking-tight text-white">
              {greeting}, Dr. {firstName} 👋
            </h1>
            <p className="mt-2 text-[13px] leading-snug text-blue-100/85">
              {specialtyLabel
                ? `${specialtyLabel} · ${clinicLabel}`
                : "Here's what's happening with your practice today."}
            </p>
            <p className="mt-3 inline-flex items-center gap-2 text-[12.5px] font-semibold text-blue-200/80">
              <Calendar className="size-3.5" strokeWidth={2.2} />
              {todayFullLabel}
            </p>
          </div>
          {access.ready ? (
            <div className="flex flex-wrap items-center gap-2.5">
              <Link to="/doctor/appointments">
                <Button
                  size="md"
                  className="rounded-xl border border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white [&_svg]:text-white"
                >
                  <Calendar className="size-4.5 text-white" strokeWidth={2} />
                  Appointments
                </Button>
              </Link>
              <Link to="/doctor/patients">
                <Button
                  size="md"
                  className="rounded-xl border border-white/30 bg-white/15 text-white hover:bg-white/25 hover:text-white [&_svg]:text-white"
                >
                  <Stethoscope className="size-4.5 text-white" strokeWidth={2} />
                  Patients
                </Button>
              </Link>
            </div>
          ) : null}
        </div>
      </section>

      <div
        className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3.5 shadow-sm"
        style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.03), 0 8px 22px -16px rgba(15,23,42,0.12)" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-10 w-1 shrink-0 rounded-full bg-emerald-500" aria-hidden />
          <div className="min-w-0">
            <p className="truncate font-jakarta text-[15px] font-bold text-slate-900">{clinicLabel}</p>
            <p className="text-[12.5px] text-slate-500">
              {access.ready ? "Accepting appointments" : "Finish setup to open booking"}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${
            access.ready ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          <span
            className={`size-1.5 rounded-full ${access.ready ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          {access.ready ? "Live" : "Setup"}
        </span>
      </div>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-primary">{message}</p> : null}
      {search.checkout === "success" ? (
        <p className="mb-4 text-sm text-primary">
          Payment received. Your clinic account is enrolled.
        </p>
      ) : null}

      {!access.ready ? (
        <Panel className="mb-6 space-y-4 p-6">
          <div>
            <p className="text-sm font-bold">Finish setup to use the clinic</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {access.planName ? `${access.planName} is active.` : "Your plan is active."} Complete
              your profile and availability, then the rest of the portal opens.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div
              className="rounded-2xl border p-4.5 transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{
                borderColor: "#E2E8F0",
                background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
              }}
            >
              <p className="text-sm font-bold text-foreground">1. Profile</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {access.profileComplete
                  ? "Specialty and clinic are saved."
                  : "Add your specialty and clinic."}
              </p>
              <Link to="/doctor/profile">
                <Button
                  size="sm"
                  className="mt-4 rounded-xl"
                  variant={access.profileComplete ? "outline" : "primary"}
                >
                  {access.profileComplete ? "Review profile" : "Complete profile"}
                </Button>
              </Link>
            </div>
            <div
              className="rounded-2xl border p-4.5 transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{
                borderColor: "#E2E8F0",
                background: "linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)",
              }}
            >
              <p className="text-sm font-bold text-foreground">2. Availability</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {access.availabilityComplete
                  ? "Open slots are on your calendar."
                  : "Save weekly hours so patients can book."}
              </p>
              <Link to="/doctor/availability">
                <Button
                  size="sm"
                  className="mt-4 rounded-xl"
                  variant={access.availabilityComplete ? "outline" : "primary"}
                >
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
          <div className="mb-3">
            <h2 className="font-jakarta text-[15px] font-bold text-slate-900">Practice overview</h2>
            <p className="text-[12.5px] text-slate-500">Key clinic metrics for today</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Today's appointments",
                value: String(todayAppointmentsCount),
                detail: "Visits on your schedule today",
                icon: <Calendar className="size-5" strokeWidth={2.2} />,
                iconBg: "rgba(37,99,235,0.12)",
                iconColor: "#2563EB",
                valueColor: "#0F172A",
              },
              {
                label: "Total patients",
                value: String(totalPatients),
                detail: "Patients linked to your clinic",
                icon: <Users className="size-5" strokeWidth={2.2} />,
                iconBg: "rgba(13,148,136,0.12)",
                iconColor: "#0D9488",
                valueColor: "#047857",
              },
              {
                label: "Awaiting confirmation",
                value: String(awaitingConfirmCount),
                detail: "Pending appointment requests",
                icon: <Clock className="size-5" strokeWidth={2.2} />,
                iconBg: "rgba(139,92,246,0.12)",
                iconColor: "#7C3AED",
                valueColor: "#6D28D9",
              },
              {
                label: "Unread alerts",
                value: String(unreadAlerts),
                detail: "Notifications needing attention",
                icon: <Bell className="size-5" strokeWidth={2.2} />,
                iconBg: "rgba(245,158,11,0.14)",
                iconColor: "#D97706",
                valueColor: "#B45309",
              },
            ].map((card) => (
              <div
                key={card.label}
                className="rounded-[18px] border border-slate-200/90 bg-white p-5 transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  boxShadow:
                    "0 1px 2px 0 rgba(15,23,42,0.03), 0 10px 28px -16px rgba(15,23,42,0.12)",
                }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-slate-500">
                      {card.label}
                    </p>
                    <p
                      className="mt-2.5 font-jakarta text-[clamp(1.65rem,2.5vw,2rem)] font-extrabold leading-none tracking-tight"
                      style={{ color: card.valueColor }}
                    >
                      {card.value}
                    </p>
                    <p className="mt-2.5 text-[12px] font-medium text-slate-500">{card.detail}</p>
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

          <div className="mt-6 grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
            <div className="lg:col-span-2 xl:col-span-2 space-y-4">
              <div
                className="rounded-2xl p-5"
                style={{
                  background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                  border: "1px solid #EEF2F7",
                  boxShadow:
                    "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -14px rgba(15, 23, 42, 0.1)",
                }}
              >
                <CardHeader
                  title="Appointment Trends"
                  subtitle="Weekly appointments"
                  icon={<Calendar className="size-5" strokeWidth={2.2} />}
                  action={
                    <select className="h-9 rounded-xl border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                      <option>This Week</option>
                      <option>This Month</option>
                      <option>This Quarter</option>
                    </select>
                  }
                />
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={appointmentTrendsData}
                      margin={{ top: 5, right: 20, left: -15, bottom: 5 }}
                    >
                      <defs>
                        <linearGradient id="apptGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity={0.22} />
                          <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#EEF2F7" />
                      <XAxis
                        dataKey="day"
                        tick={{
                          fontSize: 12,
                          fill: "#94A3B8",
                          fontWeight: 600,
                        }}
                        axisLine={false}
                        tickLine={false}
                        dy={8}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: "#94A3B8",
                          fontWeight: 600,
                        }}
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
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#2563EB"
                        strokeWidth={3}
                        dot={{
                          fill: "#FFFFFF",
                          stroke: "#2563EB",
                          strokeWidth: 2.5,
                          r: 5,
                        }}
                        activeDot={{
                          fill: "#2563EB",
                          stroke: "#FFFFFF",
                          strokeWidth: 3,
                          r: 7,
                        }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div
                className="rounded-2xl p-5"
                style={{
                  background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                  border: "1px solid #EEF2F7",
                  boxShadow:
                    "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -14px rgba(15, 23, 42, 0.1)",
                }}
              >
                <CardHeader
                  title="Patient Growth"
                  subtitle="Total patients by category"
                  icon={<Users className="size-5" strokeWidth={2.2} />}
                  action={
                    <select className="h-9 rounded-xl border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                      <option>This Month</option>
                      <option>Last Month</option>
                      <option>This Year</option>
                    </select>
                  }
                />
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={patientGrowthData}
                      margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#EEF2F7" />
                      <XAxis
                        dataKey="category"
                        tick={{
                          fontSize: 12,
                          fill: "#94A3B8",
                          fontWeight: 600,
                        }}
                        axisLine={false}
                        tickLine={false}
                        dy={8}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: "#94A3B8",
                          fontWeight: 600,
                        }}
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
                      <Bar dataKey="value" radius={[10, 10, 0, 0]} barSize={50}>
                        {patientGrowthData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="lg:col-span-2 xl:col-span-2 space-y-4">
              <div
                className="rounded-2xl p-5"
                style={{
                  background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                  border: "1px solid #EEF2F7",
                  boxShadow:
                    "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -14px rgba(15, 23, 42, 0.1)",
                }}
              >
                <CardHeader
                  title="Consultation Trends"
                  subtitle="Consultation types"
                  icon={<Stethoscope className="size-5" strokeWidth={2.2} />}
                  action={
                    <select className="h-9 rounded-xl border border-border bg-card px-3 text-[12.5px] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/20">
                      <option>This Week</option>
                      <option>This Month</option>
                    </select>
                  }
                />
                <div className="h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={consultationData}
                      margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#EEF2F7" />
                      <XAxis
                        dataKey="day"
                        tick={{
                          fontSize: 12,
                          fill: "#94A3B8",
                          fontWeight: 600,
                        }}
                        axisLine={false}
                        tickLine={false}
                        dy={8}
                      />
                      <YAxis
                        tick={{
                          fontSize: 12,
                          fill: "#94A3B8",
                          fontWeight: 600,
                        }}
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
                      <Line
                        type="monotone"
                        dataKey="In-Person"
                        stroke="#2563EB"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="Telehealth"
                        stroke="#0D9488"
                        strokeWidth={2.5}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="Follow-up"
                        stroke="#8B5CF6"
                        strokeWidth={2.5}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div
                className="rounded-2xl p-5"
                style={{
                  background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                  border: "1px solid #EEF2F7",
                  boxShadow:
                    "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -14px rgba(15, 23, 42, 0.1)",
                }}
              >
                <CardHeader
                  title="Appointment Status"
                  icon={<Activity className="size-5" strokeWidth={2.2} />}
                />
                <div className="flex items-center justify-between gap-6 h-[220px]">
                  <div className="flex-1 h-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={appointmentStatusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={62}
                          outerRadius={85}
                          dataKey="value"
                          strokeWidth={4}
                          stroke="#FFFFFF"
                        >
                          {appointmentStatusData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            borderRadius: 14,
                            border: "1px solid #E2E8F0",
                            boxShadow: "0 12px 24px -12px rgba(15,23,42,0.18)",
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-4 flex-1">
                    {appointmentStatusData.map((s) => {
                      const total = appointmentStatusData.reduce((a, b) => a + b.value, 0);
                      const pct = Math.round((s.value / total) * 100);
                      return (
                        <div key={s.name} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <span
                                className="size-2.5 rounded-full"
                                style={{ backgroundColor: s.color }}
                              />
                              <span className="text-[13px] font-bold text-foreground">
                                {s.name}
                              </span>
                            </div>
                            <span className="text-[13px] font-bold text-muted-foreground">
                              {pct}% ({s.value})
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background: s.color,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div
              className="lg:col-span-1 rounded-2xl p-5 overflow-hidden relative"
              style={{
                background: "linear-gradient(135deg, #0B1E4B 0%, #1D4ED8 45%, #1E40AF 100%)",
                boxShadow: "0 16px 40px -16px rgba(29, 78, 216, 0.55)",
              }}
            >
              <div
                className="absolute inset-0 pointer-events-none opacity-40"
                style={{
                  backgroundImage: `
                    radial-gradient(circle at 90% 10%, rgba(96, 165, 250, 0.45) 0%, transparent 50%),
                    radial-gradient(circle at 10% 90%, rgba(139, 92, 246, 0.35) 0%, transparent 50%)
                  `,
                }}
              />
              <div className="absolute -bottom-8 -right-8 pointer-events-none opacity-20">
                <Brain className="size-40" strokeWidth={1.2} />
              </div>
              <div className="relative z-10">
                <div className="flex items-start gap-3 mb-5">
                  <div
                    className="grid size-11 place-items-center rounded-2xl"
                    style={{
                      background: "rgba(255, 255, 255, 0.15)",
                      border: "1px solid rgba(255, 255, 255, 0.2)",
                      backdropFilter: "blur(10px)",
                    }}
                  >
                    <Brain className="size-5.5 text-white" strokeWidth={2.3} />
                  </div>
                  <div>
                    <h3 className="font-jakarta text-[17px] font-extrabold tracking-tight text-white">
                      AI Receptionist Insights
                    </h3>
                    <p className="mt-1 text-[12.5px] text-blue-100/80">
                      Smart insights to keep your practice running smoothly.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      icon: <Calendar className="size-4.5" strokeWidth={2.3} />,
                      label: "18 appointments need confirmation",
                      count: "18",
                    },
                    {
                      icon: <Users className="size-4.5" strokeWidth={2.3} />,
                      label: "4 patients require follow-up",
                      count: "4",
                    },
                    {
                      icon: <AlertTriangle className="size-4.5" strokeWidth={2.3} />,
                      label: "2 doctors have schedule conflicts",
                      count: "2",
                    },
                    {
                      icon: <Clock className="size-4.5" strokeWidth={2.3} />,
                      label: "Average waiting time reduced by 22%",
                      count: "-22%",
                    },
                  ].map((item, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 rounded-2xl p-3.5 transition-all hover:bg-white/5"
                      style={{
                        background: "rgba(255, 255, 255, 0.07)",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                      }}
                    >
                      <div
                        className="grid size-8 place-items-center rounded-xl shrink-0"
                        style={{
                          background: "rgba(255,255,255,0.12)",
                          color: "#FFFFFF",
                        }}
                      >
                        {item.icon}
                      </div>
                      <span className="flex-1 text-[13px] font-semibold text-white leading-snug">
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  className="mt-6 w-full h-11 rounded-xl font-bold text-[13.5px] text-blue-900 flex items-center justify-center gap-2 transition-all hover:-translate-y-0.5 hover:shadow-lg"
                  style={{
                    background: "linear-gradient(135deg, #FFFFFF 0%, #F0F7FF 100%)",
                    boxShadow: "0 8px 20px -8px rgba(0,0,0,0.25)",
                  }}
                >
                  View All Insights
                  <ArrowRight className="size-4.5" strokeWidth={2.5} />
                </button>
              </div>
            </div>

            <div
              className="lg:col-span-2 xl:col-span-2 rounded-2xl p-5"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                border: "1px solid #EEF2F7",
                boxShadow:
                  "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -14px rgba(15, 23, 42, 0.1)",
              }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                <CardHeader
                  title="Upcoming Appointments"
                  subtitle="Today's schedule · 5 appointments"
                  icon={<Calendar className="size-5" strokeWidth={2.2} />}
                />
                <div className="flex items-center gap-2 shrink-0">
                  <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 transition-colors hover:bg-secondary"
                        aria-label="Choose schedule date"
                      >
                        <Calendar className="size-4 text-muted-foreground" strokeWidth={2} />
                        <span className="text-[13px] font-bold text-foreground">
                          {scheduleDateLabel}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-auto p-0">
                      <DateCalendar
                        mode="single"
                        selected={scheduleDate}
                        onSelect={(date) => {
                          if (!date) return;
                          setScheduleDate(date);
                          setCalendarOpen(false);
                        }}
                      />
                    </PopoverContent>
                  </Popover>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    aria-label="Previous day"
                    onClick={() => shiftScheduleDate(-1)}
                  >
                    <ChevronLeft className="size-4.5" strokeWidth={2.3} />
                  </button>
                  <button
                    type="button"
                    className="grid size-9 place-items-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                    aria-label="Next day"
                    onClick={() => shiftScheduleDate(1)}
                  >
                    <ChevronRight className="size-4.5" strokeWidth={2.3} />
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-[#F1F5F9]">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-full text-sm">
                    <thead>
                      <tr
                        style={{
                          background: "linear-gradient(180deg, #F8FAFC 0%, #F1F5F9 100%)",
                        }}
                      >
                        <th className="text-left px-4.5 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          Time
                        </th>
                        <th className="text-left px-4.5 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          Patient
                        </th>
                        <th className="text-left px-4.5 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          Consultation Type
                        </th>
                        <th className="text-left px-4.5 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          Status
                        </th>
                        <th className="text-right px-4.5 py-3.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        {
                          time: "09:00 AM",
                          name: "Emma Watson",
                          age: "32 years · Female",
                          type: "General Consultation",
                          status: "Confirmed",
                        },
                        {
                          time: "09:30 AM",
                          name: "John Miller",
                          age: "45 years · Male",
                          type: "Telehealth",
                          status: "Pending",
                        },
                        {
                          time: "10:00 AM",
                          name: "Sophia Brown",
                          age: "28 years · Female",
                          type: "Follow-up Visit",
                          status: "Completed",
                        },
                        {
                          time: "10:30 AM",
                          name: "Michael Davis",
                          age: "51 years · Male",
                          type: "General Consultation",
                          status: "Confirmed",
                        },
                        {
                          time: "11:00 AM",
                          name: "Olivia Martinez",
                          age: "29 years · Female",
                          type: "Telehealth",
                          status: "Pending",
                        },
                      ].map((apt, i) => (
                        <tr
                          key={i}
                          className="border-t border-[#F1F5F9] transition-colors hover:bg-muted/30"
                        >
                          <td className="px-4.5 py-4">
                            <span className="font-mono text-[13px] font-bold text-foreground">
                              {apt.time}
                            </span>
                          </td>
                          <td className="px-4.5 py-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <Avatar label={initials(apt.name)} size="md" className="size-10" />
                              <div className="min-w-0">
                                <p className="text-[13.5px] font-bold text-foreground truncate">
                                  {apt.name}
                                </p>
                                <p className="text-[12px] text-muted-foreground">{apt.age}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4.5 py-4 text-[13px] font-medium text-muted-foreground">
                            {apt.type}
                          </td>
                          <td className="px-4.5 py-4">
                            <Badge
                              tone={
                                apt.status === "Completed"
                                  ? "success"
                                  : apt.status === "Pending"
                                    ? "warning"
                                    : "primary"
                              }
                              dot
                              className="px-3 py-1 rounded-full"
                            >
                              {apt.status}
                            </Badge>
                          </td>
                          <td className="px-4.5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg !h-8 px-3 text-[12px]"
                              >
                                <Eye className="size-3.5" strokeWidth={2} />
                                View
                              </Button>
                              <button
                                type="button"
                                className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                              >
                                <MoreHorizontal className="size-4" strokeWidth={2.3} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {dashboard?.todayAppointments?.length ? (
                <div className="mt-4 space-y-2">
                  {dashboard.todayAppointments.slice(0, 2).map((appointment) => (
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
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <div
              className="lg:col-span-2 rounded-2xl p-5"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                border: "1px solid #EEF2F7",
                boxShadow:
                  "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -14px rgba(15, 23, 42, 0.1)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
                <CardHeader
                  title="Recent Patients"
                  subtitle="Latest patient activity"
                  icon={<Users className="size-5" strokeWidth={2.2} />}
                />
                <Link to="/doctor/patients">
                  <Button variant="outline" size="sm" className="rounded-xl">
                    View All
                    <ArrowRight className="size-4" strokeWidth={2.3} />
                  </Button>
                </Link>
              </div>

              <div className="space-y-2">
                {samplePatients.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-4 rounded-2xl p-3.5 transition-all hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-sm"
                    style={{ border: "1px solid #F1F5F9" }}
                  >
                    <Avatar label={initials(p.name)} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-bold text-foreground truncate">{p.name}</p>
                      <p className="text-[12px] text-muted-foreground">
                        {p.age} years · {p.gender}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/80">
                        Last visit: {p.lastVisit}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-3">
                      <div className="text-right leading-tight">
                        <p className="text-[12px] font-bold text-foreground flex items-center justify-end gap-1.5">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: "#2563EB" }}
                          />
                          BP {p.bp}
                        </p>
                        <p className="mt-0.5 text-[12px] font-bold text-muted-foreground flex items-center justify-end gap-1.5">
                          <span
                            className="size-1.5 rounded-full"
                            style={{ backgroundColor: "#0D9488" }}
                          />
                          HR {p.hr}
                        </p>
                      </div>
                      <Badge
                        tone={p.status === "Watch" ? "warning" : "success"}
                        dot
                        className="px-3 py-1 rounded-full text-[11px]"
                      >
                        {p.status}
                      </Badge>
                    </div>
                    <button
                      type="button"
                      className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-all hover:bg-primary hover:text-white group"
                    >
                      <ArrowRight
                        className="size-4.5 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={2.3}
                      />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div
              className="lg:col-span-1 rounded-2xl p-5 flex flex-col"
              style={{
                background: "linear-gradient(180deg, #FFFFFF 0%, #FCFCFF 100%)",
                border: "1px solid #EEF2F7",
                boxShadow:
                  "0 1px 2px 0 rgba(15, 23, 42, 0.03), 0 8px 24px -14px rgba(15, 23, 42, 0.1)",
              }}
            >
              <CardHeader
                title="Clinic Health"
                subtitle="Practice metrics summary"
                icon={<HeartPulse className="size-5" strokeWidth={2.2} />}
              />
              <div className="space-y-4 mt-2 flex-1">
                {[
                  {
                    label: "Confirmations Rate",
                    value: "94%",
                    pct: 94,
                    color: "#10B981",
                  },
                  {
                    label: "No-Shows",
                    value: "4.2%",
                    pct: 96,
                    color: "#0D9488",
                  },
                  {
                    label: "Avg. Wait Time",
                    value: "7.8 min",
                    pct: 82,
                    color: "#3B82F6",
                  },
                  {
                    label: "Patient Satisfaction",
                    value: "4.8/5",
                    pct: 96,
                    color: "#8B5CF6",
                  },
                ].map((m, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[12.5px] font-semibold text-muted-foreground">
                        {m.label}
                      </span>
                      <span className="text-[13px] font-extrabold" style={{ color: m.color }}>
                        {m.value}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${m.pct}%`,
                          background: `linear-gradient(90deg, ${m.color}, ${m.color}dd)`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div
                className="mt-6 rounded-2xl p-4.5 flex items-center gap-3"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(16, 185, 129, 0.02))",
                  border: "1px solid rgba(16, 185, 129, 0.2)",
                }}
              >
                <div
                  className="grid size-10 place-items-center rounded-xl"
                  style={{
                    background: "linear-gradient(135deg, #10B981, #059669)",
                    color: "#FFFFFF",
                    boxShadow: "0 4px 12px -4px rgba(16, 185, 129, 0.6)",
                  }}
                >
                  <CheckCircle2 className="size-5" strokeWidth={2.4} />
                </div>
                <div className="flex-1">
                  <p className="text-[13px] font-extrabold" style={{ color: "#047857" }}>
                    Better data. Healthier lives.
                  </p>
                  <p className="mt-0.5 text-[12px] text-emerald-700/80">
                    AI-powered tools for a smarter healthcare future.
                  </p>
                </div>
                <ArrowRight className="size-4.5 text-emerald-700/60" strokeWidth={2.3} />
              </div>
            </div>
          </div>

          {access.ready ? (
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <section className="space-y-3 lg:col-span-2">
                <SectionLabel>Today's appointments</SectionLabel>
                {dashboard?.todayAppointments.length ? (
                  dashboard.todayAppointments.map((appointment) => (
                    <div key={appointment.id} className="space-y-2">
                      <AppointmentCard appointment={appointment} perspective="doctor" />
                    </div>
                  ))
                ) : (
                  <EmptyNote>
                    No visits scheduled for today.{" "}
                    <Link
                      to="/doctor/appointments"
                      className="font-bold text-blue-600 underline-offset-2 hover:underline"
                    >
                      Open all appointments
                    </Link>
                    .
                  </EmptyNote>
                )}
              </section>

              <aside className="space-y-4">
                <Panel className="p-5">
                  <SectionLabel>Quick actions</SectionLabel>
                  <div className="mt-3 grid grid-cols-2 gap-2.5">
                    {quickActions
                      .filter((action) => access.modules.some((mod) => mod.to === action.to))
                      .map((action) => (
                        <Link key={action.to} to={action.to}>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-auto w-full justify-start py-3 text-left rounded-xl"
                          >
                            {action.label}
                          </Button>
                        </Link>
                      ))}
                  </div>
                </Panel>

                <Panel className="p-5">
                  <SectionLabel>Latest notifications</SectionLabel>
                  {dashboard?.latestNotifications.length ? (
                    <ul className="mt-3 space-y-3">
                      {dashboard.latestNotifications.slice(0, 2).map((note) => (
                        <li
                          key={note.id}
                          className="p-3 -mx-1 rounded-xl transition-colors hover:bg-muted/50"
                        >
                          <p className="text-[13px] font-bold text-foreground">{note.title}</p>
                          <p className="mt-0.5 text-[12px] text-muted-foreground leading-relaxed">
                            {note.detail}
                          </p>
                          <p className="mt-1 font-mono text-[10.5px] text-muted-foreground/70">
                            {note.time}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No alerts yet.</p>
                  )}
                  <Link to="/doctor/notifications">
                    <Button variant="soft" size="sm" className="mt-4 w-full rounded-xl">
                      View all notifications
                    </Button>
                  </Link>
                </Panel>
              </aside>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
