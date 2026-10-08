import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FollowUpDialog } from "@/components/doctor/FollowUpDialog";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Avatar, Badge, Button, EmptyNote, PageHeader, Panel, SectionLabel } from "@/components/ui/primitives";
import {
  doctorAppointmentsApi,
  formatApiError,
  type ApiAppointment,
} from "@/lib/api";
import { initials, statusTone, patients } from "@/lib/mock-data";
import {
  Search,
  Calendar,
  Calendar as CalendarIcon,
  ChevronDown,
  Plus,
  Stethoscope,
  RefreshCw,
  Activity,
  FileText,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/schedule")({
  head: () => ({
    meta: [
      { title: "Appointment Schedule — AI Receptionist" },
      { name: "description", content: "View and manage all patient appointments." },
      { property: "og:title", content: "Appointment Schedule — AI Receptionist" },
      { property: "og:description", content: "View and manage all patient appointments." },
    ],
  }),
  component: DoctorSchedule,
});

const STATUS_OPTIONS = ["All Status", "Confirmed", "Pending", "Completed", "Cancelled"] as const;
const TYPE_OPTIONS = ["All Appointment Types", "Consultation", "Follow-up", "Check-up", "Procedure"] as const;

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
  "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
  "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)",
  "linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)",
  "linear-gradient(135deg, #10B981 0%, #059669 100%)",
  "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
  "linear-gradient(135deg, #10B981 0%, #059669 100%)",
  "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
  "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
  "linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)",
];

function avatarGradientFor(name: string, index: number) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % AVATAR_GRADIENTS.length;
  return AVATAR_GRADIENTS[idx] ?? AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length];
}

function patientPhoneFor(patientName: string, patientId: string) {
  const match = patients.find((p) => p.id === patientId || p.name === patientName);
  return match?.phone ?? "+1 (555) 123-4567";
}

function classifyAppointmentType(appointment: ApiAppointment): {
  label: string;
  icon: React.ReactNode;
} {
  const reason = appointment.reason?.toLowerCase() ?? "";
  if (appointment.isFollowUp || reason.includes("follow-up") || reason.includes("follow up")) {
    return { label: "Follow-up", icon: <RefreshCw className="size-4" strokeWidth={2} /> };
  }
  if (reason.includes("check-up") || reason.includes("checkup") || reason.includes("check up") || reason.includes("annual")) {
    return { label: "Check-up", icon: <Activity className="size-4" strokeWidth={2} /> };
  }
  if (reason.includes("procedure") || reason.includes("surgery") || reason.includes("test")) {
    return { label: "Procedure", icon: <FileText className="size-4" strokeWidth={2} /> };
  }
  return { label: "Consultation", icon: <Stethoscope className="size-4" strokeWidth={2} /> };
}

const TYPE_ICON_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  Consultation: {
    bg: "linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.06))",
    color: "#1D4ED8",
    border: "1px solid rgba(59, 130, 246, 0.18)",
  },
  "Follow-up": {
    bg: "linear-gradient(135deg, rgba(139, 92, 246, 0.12), rgba(124, 58, 237, 0.06))",
    color: "#6D28D9",
    border: "1px solid rgba(139, 92, 246, 0.18)",
  },
  "Check-up": {
    bg: "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.06))",
    color: "#047857",
    border: "1px solid rgba(16, 185, 129, 0.18)",
  },
  Procedure: {
    bg: "linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(217, 119, 6, 0.07))",
    color: "#B45309",
    border: "1px solid rgba(245, 158, 11, 0.22)",
  },
};

const STATUS_LABEL: Record<ApiAppointment["status"], string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

function formatDateDisplay(dateStr: string, startsAt: string) {
  try {
    const d = new Date(startsAt || dateStr);
    const dow = d.toLocaleDateString("en-US", { weekday: "short" });
    const month = d.toLocaleDateString("en-US", { month: "short" });
    const day = d.getDate();
    const year = d.getFullYear();
    return {
      dateLine: `${dow}, ${month} ${day}, ${year}`,
    };
  } catch {
    return { dateLine: dateStr };
  }
}

function DoctorSchedule() {
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = useState<ApiAppointment | null>(null);

  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("All Status");
  const [typeFilter, setTypeFilter] = useState<string>("All Appointment Types");
  const [doctorFilter, setDoctorFilter] = useState<string>("All Doctors");
  const [page, setPage] = useState(1);
  const [scheduleDate, setScheduleDate] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const PAGE_SIZE = 10;

  useEffect(() => {
    let cancelled = false;
    void doctorAppointmentsApi
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

  const allDoctors = useMemo(() => {
    const set = new Set<string>();
    appointments.forEach((a) => set.add(a.doctorName));
    return Array.from(set);
  }, [appointments]);

  const filtered = useMemo(() => {
    return appointments.filter((apt) => {
      if (searchQ) {
        const q = searchQ.toLowerCase();
        const hay = `${apt.patientName} ${patientPhoneFor(apt.patientName, apt.patientId)} ${apt.reference} ${apt.doctorName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "All Status") {
        if (STATUS_LABEL[apt.status] !== statusFilter) return false;
      }
      if (typeFilter !== "All Appointment Types") {
        const t = classifyAppointmentType(apt).label;
        if (t !== typeFilter) return false;
      }
      if (doctorFilter !== "All Doctors") {
        if (apt.doctorName !== doctorFilter) return false;
      }
      return true;
    });
  }, [appointments, searchQ, statusFilter, typeFilter, doctorFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  async function changeStatus(appointment: ApiAppointment, status: ApiAppointment["status"]) {
    if (appointment.status === status) return;
    setBusyId(appointment.id);
    setError("");
    setMessage("");
    try {
      const result = await doctorAppointmentsApi.updateStatus(appointment.id, status);
      setAppointments((current) =>
        current.map((row) => (row.id === appointment.id ? result.appointment : row)),
      );
      if (status === "completed") setFollowUpFor(result.appointment);
    } catch (err) {
      setError(formatApiError(err, "Unable to update appointment status."));
    } finally {
      setBusyId(null);
    }
  }

  async function requestRecords(appointment: ApiAppointment) {
    setRequestingId(appointment.id);
    setError("");
    setMessage("");
    try {
      const result = await doctorAppointmentsApi.requestRecords(appointment.id);
      setAppointments((current) =>
        current.map((row) =>
          row.id === appointment.id
            ? {
                ...row,
                recordRequest: {
                  status: result.request.status,
                  smsSent: result.request.smsSent,
                  smsError: result.request.smsError,
                  expiresAt: result.request.expiresAt,
                  createdAt: result.request.createdAt,
                  recordsCount: result.request.recordsCount,
                },
              }
            : row,
        ),
      );
      const base = result.message || result.request.message || "Upload link sent to the patient.";
      setMessage(
        result.request.smsSent || !result.request.uploadUrl
          ? base
          : `${base} Link: ${result.request.uploadUrl}`,
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to request medical records."));
    } finally {
      setRequestingId(null);
    }
  }

  async function sendInvoice(appointment: ApiAppointment) {
    setBusyId(appointment.id);
    setError("");
    setMessage("");
    try {
      const result = await doctorAppointmentsApi.sendInvoice(appointment.id);
      setAppointments((current) =>
        current.map((row) => (row.id === appointment.id ? result.appointment : row)),
      );
      setMessage(result.message || "Invoice sent.");
    } catch (err) {
      setError(formatApiError(err, "Unable to send the invoice."));
    } finally {
      setBusyId(null);
    }
  }

  const scheduleDateLabel = useMemo(() => {
    const formatted = scheduleDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const today = new Date();
    const isToday =
      scheduleDate.getFullYear() === today.getFullYear() &&
      scheduleDate.getMonth() === today.getMonth() &&
      scheduleDate.getDate() === today.getDate();
    return isToday ? `Today, ${formatted}` : formatted;
  }, [scheduleDate]);

  return (
    <>
      <PageHeader
        eyebrow="Appointments"
        title="Appointment Schedule"
        description="View and manage all patient appointments. You can filter, search and update appointment details as needed."
        actions={
          <>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Choose schedule date"
                  className="inline-flex h-11 items-center gap-2.5 rounded-xl border border-border bg-card px-4 text-[13px] font-semibold text-foreground shadow-sm transition-all hover:bg-secondary hover:border-primary/30"
                >
                  <CalendarIcon className="size-[17px] text-primary" strokeWidth={2} />
                  <span>{scheduleDateLabel}</span>
                  <ChevronDown className="size-4 text-muted-foreground" strokeWidth={2} />
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
            <Button>
              <Plus className="size-[17px]" strokeWidth={2.2} />
              New Appointment
            </Button>
          </>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {message ? <p className="mb-4 text-sm text-primary">{message}</p> : null}

      <Panel className="mb-5 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(15rem,1.35fr)_minmax(0,0.85fr)]">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              type="text"
              placeholder="Search by patient name, phone, or ID..."
              value={searchQ}
              onChange={(e) => {
                setSearchQ(e.target.value);
                setPage(1);
              }}
              className="h-12 w-full rounded-xl border-2 border-transparent bg-input-fill pl-11 pr-4 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 transition-all focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:outline-none"
              style={{ boxShadow: "inset 0 1px 2px 0 rgba(15, 23, 42, 0.03)" }}
            />
          </div>

          <SelectPill
            value={statusFilter}
            options={STATUS_OPTIONS as unknown as string[]}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          />
          <SelectPill
            value={typeFilter}
            options={TYPE_OPTIONS as unknown as string[]}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          />
          <SelectPill
            value={doctorFilter}
            options={["All Doctors", ...allDoctors]}
            onChange={(v) => {
              setDoctorFilter(v);
              setPage(1);
            }}
          />
        </div>
      </Panel>

      {loading ? (
        <EmptyNote>Loading appointments…</EmptyNote>
      ) : filtered.length === 0 ? (
        <EmptyNote>No appointments match your filters.</EmptyNote>
      ) : (
        <>
          <Panel className="p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr
                    className="border-b"
                    style={{ borderColor: "#EEF2F7" }}
                  >
                    <th className="px-5 py-4 text-left">
                      <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                        Patient
                      </SectionLabel>
                    </th>
                    <th className="px-3 py-4 text-left">
                      <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                        Appointment ID
                      </SectionLabel>
                    </th>
                    <th className="px-3 py-4 text-left">
                      <div className="inline-flex items-center gap-1.5">
                        <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                          Date & Time
                        </SectionLabel>
                        <svg className="size-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 5v14M5 12l7-7 7 7" />
                        </svg>
                      </div>
                    </th>
                    <th className="px-3 py-4 text-left">
                      <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                        Type
                      </SectionLabel>
                    </th>
                    <th className="px-3 py-4 text-left">
                      <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                        Doctor
                      </SectionLabel>
                    </th>
                    <th className="px-3 py-4 text-left">
                      <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                        Status
                      </SectionLabel>
                    </th>
                    <th className="px-5 py-4 text-right">
                      <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                        Actions
                      </SectionLabel>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((apt, i) => {
                    const typeInfo = classifyAppointmentType(apt);
                    const typeStyle = TYPE_ICON_STYLE[typeInfo.label] ?? TYPE_ICON_STYLE["Consultation"]!;
                    const { dateLine } = formatDateDisplay(apt.date, apt.startsAt);
                    const phone = patientPhoneFor(apt.patientName, apt.patientId);
                    return (
                      <tr
                        key={apt.id}
                        className="border-b transition-colors hover:bg-muted/30"
                        style={{ borderColor: "#F1F5F9" }}
                      >
                        <td className="px-5 py-4 align-middle">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="grid size-10 shrink-0 place-items-center rounded-2xl font-bold text-white text-[12.5px]"
                              style={{
                                background: avatarGradientFor(apt.patientName, i),
                                boxShadow: "0 2px 8px -2px rgba(15, 23, 42, 0.2)",
                              }}
                            >
                              {initials(apt.patientName)}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[13.5px] font-semibold text-foreground">
                                {apt.patientName}
                              </p>
                              <p className="truncate text-[12px] text-muted-foreground mt-0.5">
                                {phone}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <span
                            className="font-mono text-[12.5px] font-semibold"
                            style={{ color: "#334155" }}
                          >
                            {apt.reference}
                          </span>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <div className="flex items-start gap-2.5">
                            <div
                              className="grid size-[30px] shrink-0 place-items-center rounded-lg mt-0.5"
                              style={{
                                background:
                                  "linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.05))",
                                color: "#1D4ED8",
                              }}
                            >
                              <Calendar className="size-[15px]" strokeWidth={2} />
                            </div>
                            <div className="leading-tight">
                              <p className="text-[13px] font-semibold text-foreground">
                                {dateLine}
                              </p>
                              <p className="text-[12px] text-muted-foreground mt-0.5">
                                {apt.time}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <div className="inline-flex items-center gap-2 rounded-xl px-2.5 py-1.5" style={{ background: typeStyle.bg, border: typeStyle.border }}>
                            <span style={{ color: typeStyle.color }}>{typeInfo.icon}</span>
                            <span className="text-[12.5px] font-semibold" style={{ color: typeStyle.color }}>
                              {typeInfo.label}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <div className="leading-tight min-w-0">
                            <p className="truncate text-[13px] font-semibold text-foreground">
                              {apt.doctorName}
                            </p>
                            <p className="truncate text-[12px] text-muted-foreground mt-0.5">
                              {apt.speciality}
                            </p>
                          </div>
                        </td>
                        <td className="px-3 py-4 align-middle">
                          <Badge tone={statusTone[apt.status]} dot>
                            {STATUS_LABEL[apt.status]}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 align-middle">
                          <div className="flex items-center justify-end gap-2">
                            <RowActionsDropdown
                              apt={apt}
                              busy={busyId === apt.id}
                              requesting={requestingId === apt.id}
                              onChangeStatus={(s) => void changeStatus(apt, s)}
                              onRequestRecords={() => void requestRecords(apt)}
                              onScheduleNext={() => setFollowUpFor(apt)}
                              onSendInvoice={() => void sendInvoice(apt)}
                            />
                            <Link to="/doctor/patients/$patientId" params={{ patientId: apt.patientId }}>
                              <Button variant="outline" size="sm">
                                View
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-t"
              style={{ borderColor: "#F1F5F9" }}
            >
              <p className="text-[12.5px] text-muted-foreground">
                Showing {(currentPage - 1) * PAGE_SIZE + 1} -{" "}
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}{" "}
                appointments
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ChevronLeft className="size-4" strokeWidth={2} />
                </button>
                {Array.from({ length: totalPages }).map((_, i) => {
                  const pageNum = i + 1;
                  const active = pageNum === currentPage;
                  return (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setPage(pageNum)}
                      className={cn(
                        "grid size-9 min-w-[36px] place-items-center rounded-lg text-[12.5px] font-bold transition-all",
                        active
                          ? "text-white shadow-lg shadow-blue-500/25"
                          : "border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                      )}
                      style={
                        active
                          ? { background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #1E40AF 100%)" }
                          : undefined
                      }
                    >
                      {pageNum > 5 && pageNum < totalPages ? "..." : pageNum}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ChevronRight className="size-4" strokeWidth={2} />
                </button>
              </div>
            </div>
          </Panel>
        </>
      )}

      {followUpFor ? (
        <FollowUpDialog
          parent={followUpFor}
          onClose={() => setFollowUpFor(null)}
          onCreated={(appointment, note) => {
            setAppointments((current) => [...current, appointment]);
            setMessage(note);
            setFollowUpFor(null);
          }}
        />
      ) : null}
    </>
  );
}

function SelectPill({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full appearance-none rounded-xl border-2 border-transparent bg-input-fill pl-4 pr-10 text-[13.5px] font-medium text-foreground transition-all focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:outline-none"
        style={{ boxShadow: "inset 0 1px 2px 0 rgba(15, 23, 42, 0.03)" }}
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
        strokeWidth={2}
      />
    </div>
  );
}

function RowActionsDropdown({
  apt,
  busy,
  requesting,
  onChangeStatus,
  onRequestRecords,
  onScheduleNext,
  onSendInvoice,
}: {
  apt: ApiAppointment;
  busy: boolean;
  requesting: boolean;
  onChangeStatus: (s: ApiAppointment["status"]) => void;
  onRequestRecords: () => void;
  onScheduleNext: () => void;
  onSendInvoice: () => void;
}) {
  const [open, setOpen] = useState(false);
  const terminal = apt.status === "completed" || apt.status === "cancelled";
  const invoice = apt.invoice;
  const paid = invoice?.status === "paid";
  const canSendInvoice = apt.status !== "cancelled" && !paid;
  const actions: Array<{ label: string; onClick: () => void; danger?: boolean; disabled?: boolean; muted?: boolean; separator?: boolean }> = [];

  if (!terminal) {
    if (apt.status !== "confirmed")
      actions.push({ label: "Mark confirmed", onClick: () => onChangeStatus("confirmed") });
    if (apt.status !== "pending")
      actions.push({ label: "Mark pending", onClick: () => onChangeStatus("pending") });
    if (apt.status !== "completed")
      actions.push({ label: "Mark completed", onClick: () => onChangeStatus("completed") });
    if (apt.status !== "cancelled")
      actions.push({ label: "Cancel appointment", onClick: () => onChangeStatus("cancelled"), danger: true });
    actions.push({ separator: true, label: "", onClick: () => {} });
  }
  actions.push({ label: "Request medical records", onClick: onRequestRecords, disabled: requesting });
  actions.push({ label: "Schedule next visit", onClick: onScheduleNext });
  if (canSendInvoice) {
    actions.push({ separator: true, label: "", onClick: () => {} });
    if (invoice) {
      actions.push({
        label:
          invoice.status === "failed"
            ? `Resend invoice${invoice.amountLabel ? ` (${invoice.amountLabel})` : ""}`
            : invoice.status === "paid"
              ? `Invoice paid · ${invoice.amountLabel}`
              : `Resend invoice${invoice.amountLabel ? ` (${invoice.amountLabel})` : ""}`,
        onClick: onSendInvoice,
        muted: invoice.status === "paid",
        disabled: invoice.status === "paid",
      });
    } else {
      actions.push({ label: "Send invoice", onClick: onSendInvoice });
    }
    if (invoice?.hostedInvoiceUrl && !paid) {
      actions.push({
        label: "Open payment link →",
        onClick: () => {
          window.open(invoice.hostedInvoiceUrl, "_blank", "noopener,noreferrer");
        },
      });
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40"
      >
        <MoreHorizontal className="size-4" strokeWidth={2} />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          />
          <div
            className="absolute right-0 z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl"
          >
            {actions.map((a, i) => {
              if (a.separator)
                return (
                  <div
                    key={`sep-${i}`}
                    className="my-1.5 h-px w-full bg-border/80"
                  />
                );
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    a.onClick();
                  }}
                  disabled={a.disabled || busy}
                  className={cn(
                    "block w-full px-4 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-secondary disabled:opacity-40 disabled:pointer-events-none",
                    a.danger ? "text-destructive" : a.muted ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}
