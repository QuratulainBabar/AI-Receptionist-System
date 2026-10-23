import { Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FollowUpDialog } from "@/components/doctor/FollowUpDialog";
import {
  Badge,
  Button,
  EmptyNote,
  Field,
  PageHeader,
  Panel,
  SectionLabel,
} from "@/components/ui/primitives";
import {
  doctorAppointmentsApi,
  doctorAvailabilityApi,
  formatApiError,
  type ApiAppointment,
  type ApiDoctorSlot,
} from "@/lib/api";
import { initials, statusTone } from "@/lib/mock-data";
import {
  Search,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Stethoscope,
  RefreshCw,
  Activity,
  FileText,
  MoreHorizontal,
  Check,
  X,
  Pencil,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AppointmentView =
  | "all"
  | "new"
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "follow-ups";

const VIEW_META: Record<
  AppointmentView,
  { title: string; description: string; empty: string }
> = {
  all: {
    title: "All Appointments",
    description: "Search and filter every appointment in your clinic schedule.",
    empty: "No appointments found.",
  },
  new: {
    title: "New Appointments",
    description: "Recently created appointments awaiting your review.",
    empty: "No newly created appointments in the last 7 days.",
  },
  pending: {
    title: "Pending Appointments",
    description: "Confirm or cancel appointments that are still waiting for a decision.",
    empty: "No pending appointments.",
  },
  confirmed: {
    title: "Confirmed Appointments",
    description: "Upcoming confirmed visits. Mark them completed or cancelled when needed.",
    empty: "No confirmed appointments.",
  },
  completed: {
    title: "Completed Appointments",
    description: "Past visits with patient details and appointment history.",
    empty: "No completed appointments yet.",
  },
  cancelled: {
    title: "Cancelled Appointments",
    description: "Cancelled visits with available cancellation details.",
    empty: "No cancelled appointments.",
  },
  "follow-ups": {
    title: "Follow-Up Appointments",
    description: "Follow-ups linked to a previous visit, with prior reference and current status.",
    empty: "No follow-up appointments scheduled.",
  },
};

const STATUS_LABEL: Record<ApiAppointment["status"], string> = {
  confirmed: "Confirmed",
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TYPE_OPTIONS = ["All Types", "Consultation", "Follow-up", "Check-up", "Procedure"] as const;

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
  "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
  "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)",
  "linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)",
  "linear-gradient(135deg, #10B981 0%, #059669 100%)",
  "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
];

function avatarGradientFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!;
}

function classifyAppointmentType(appointment: ApiAppointment) {
  const reason = appointment.reason?.toLowerCase() ?? "";
  if (appointment.isFollowUp || reason.includes("follow-up") || reason.includes("follow up")) {
    return { label: "Follow-up", icon: <RefreshCw className="size-4" strokeWidth={2} /> };
  }
  if (
    reason.includes("check-up") ||
    reason.includes("checkup") ||
    reason.includes("check up") ||
    reason.includes("annual")
  ) {
    return { label: "Check-up", icon: <Activity className="size-4" strokeWidth={2} /> };
  }
  if (reason.includes("procedure") || reason.includes("surgery") || reason.includes("test")) {
    return { label: "Procedure", icon: <FileText className="size-4" strokeWidth={2} /> };
  }
  return { label: "Consultation", icon: <Stethoscope className="size-4" strokeWidth={2} /> };
}

function formatDateDisplay(dateStr: string, startsAt: string) {
  try {
    const d = new Date(startsAt || dateStr);
    return {
      dateLine: d.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    };
  } catch {
    return { dateLine: dateStr };
  }
}

function isNewAppointment(apt: ApiAppointment) {
  const raw = apt.createdAt || apt.startsAt;
  const created = new Date(raw);
  if (Number.isNaN(created.getTime())) return false;
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return created.getTime() >= weekAgo;
}

function matchesView(apt: ApiAppointment, view: AppointmentView) {
  switch (view) {
    case "all":
      return true;
    case "new":
      return isNewAppointment(apt);
    case "pending":
      return apt.status === "pending";
    case "confirmed":
      return apt.status === "confirmed";
    case "completed":
      return apt.status === "completed";
    case "cancelled":
      return apt.status === "cancelled";
    case "follow-ups":
      return Boolean(apt.isFollowUp || apt.followUpOfId);
    default:
      return true;
  }
}

export function DoctorAppointmentsView({ view }: { view: AppointmentView }) {
  const meta = VIEW_META[view];
  const [appointments, setAppointments] = useState<ApiAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [followUpFor, setFollowUpFor] = useState<ApiAppointment | null>(null);
  const [editFor, setEditFor] = useState<ApiAppointment | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("All Types");
  const [statusFilter, setStatusFilter] = useState<string>("All Status");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
  }, [view]);

  useEffect(() => {
    setPage(1);
    setSearchQ("");
    setTypeFilter("All Types");
    setStatusFilter("All Status");
    setError("");
    setMessage("");
  }, [view]);

  const filtered = useMemo(() => {
    return appointments
      .filter((apt) => matchesView(apt, view))
      .filter((apt) => {
        if (searchQ) {
          const q = searchQ.toLowerCase();
          const hay =
            `${apt.patientName} ${apt.reference} ${apt.doctorName} ${apt.reason} ${apt.mode}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        if (view === "all" && statusFilter !== "All Status") {
          if (STATUS_LABEL[apt.status] !== statusFilter) return false;
        }
        if (typeFilter !== "All Types") {
          if (classifyAppointmentType(apt).label !== typeFilter) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (view === "new") {
          return new Date(b.createdAt || b.startsAt).getTime() - new Date(a.createdAt || a.startsAt).getTime();
        }
        return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
      });
  }, [appointments, view, searchQ, statusFilter, typeFilter]);

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
      setMessage(result.message || `Appointment marked ${STATUS_LABEL[status].toLowerCase()}.`);
      if (status === "completed") setFollowUpFor(result.appointment);
    } catch (err) {
      setError(formatApiError(err, "Unable to update appointment status."));
    } finally {
      setBusyId(null);
    }
  }

  async function deleteAppointment(appointment: ApiAppointment) {
    const ok = window.confirm(
      `Delete appointment ${appointment.reference} for ${appointment.patientName}? This cannot be undone.`,
    );
    if (!ok) return;
    setBusyId(appointment.id);
    setError("");
    setMessage("");
    try {
      const result = await doctorAppointmentsApi.delete(appointment.id);
      setAppointments((current) => current.filter((row) => row.id !== appointment.id));
      setMessage(result.message || `Appointment ${appointment.reference} deleted.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to delete appointment."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Appointments"
        title={meta.title}
        description={meta.description}
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </div>
      ) : null}

      <Panel className="mb-5 border border-sky-100 bg-sky-50/40 p-4">
        <div
          className={cn(
            "grid gap-3",
            view === "all"
              ? "md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]"
              : "md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)]",
          )}
        >
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
              strokeWidth={2}
            />
            <input
              type="text"
              placeholder="Search patient, reference, doctor, or reason…"
              value={searchQ}
              onChange={(e) => {
                setSearchQ(e.target.value);
                setPage(1);
              }}
              className="h-12 w-full rounded-xl border border-sky-200/80 bg-white pl-11 pr-4 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
          {view === "all" ? (
            <SelectPill
              value={statusFilter}
              options={["All Status", "Confirmed", "Pending", "Completed", "Cancelled"]}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
            />
          ) : null}
          <SelectPill
            value={typeFilter}
            options={[...TYPE_OPTIONS]}
            onChange={(v) => {
              setTypeFilter(v);
              setPage(1);
            }}
          />
        </div>
      </Panel>

      {loading ? (
        <EmptyNote>Loading appointments…</EmptyNote>
      ) : filtered.length === 0 ? (
        <EmptyNote>{meta.empty}</EmptyNote>
      ) : (
        <Panel className="overflow-hidden border border-sky-100 p-0">
          <div className="table-scroll">
            <table className="w-full min-w-[960px] md:min-w-[1080px]">
              <thead>
                <tr className="border-b border-sky-100 bg-gradient-to-r from-sky-50 to-blue-50/40">
                  <th className="px-5 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">Patient</SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">Doctor</SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">Date & time</SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">
                      {view === "follow-ups" ? "Previous visit" : "Type"}
                    </SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">
                      {view === "cancelled" ? "Details" : "Status"}
                    </SectionLabel>
                  </th>
                  <th className="px-5 py-3.5 text-right">
                    <SectionLabel className="text-[10.5px]">Actions</SectionLabel>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((apt) => {
                  const typeInfo = classifyAppointmentType(apt);
                  const { dateLine } = formatDateDisplay(apt.date, apt.startsAt);
                  return (
                    <tr
                      key={apt.id}
                      className="border-b border-slate-100 transition-colors hover:bg-sky-50/40"
                    >
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="grid size-10 shrink-0 place-items-center rounded-2xl text-[12.5px] font-bold text-white"
                            style={{ background: avatarGradientFor(apt.patientName) }}
                          >
                            {initials(apt.patientName)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13.5px] font-semibold text-foreground">
                              {apt.patientName}
                            </p>
                            <p className="mt-0.5 truncate font-mono text-[11.5px] text-muted-foreground">
                              {apt.reference}
                            </p>
                            {view === "new" || view === "completed" ? (
                              <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                                {apt.mode} · {apt.reason || "No reason noted"}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <p className="truncate text-[13px] font-semibold text-foreground">
                          {apt.doctorName}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {apt.speciality}
                        </p>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <div className="flex items-start gap-2.5">
                          <div className="mt-0.5 grid size-[30px] shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
                            <Calendar className="size-[15px]" strokeWidth={2} />
                          </div>
                          <div>
                            <p className="text-[13px] font-semibold text-foreground">{dateLine}</p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">{apt.time}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        {view === "follow-ups" ? (
                          <div>
                            <p className="text-[13px] font-semibold text-foreground">
                              {apt.followUpOfReference || "Previous visit"}
                            </p>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                              Follow-up · {apt.mode}
                            </p>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 rounded-xl border border-sky-100 bg-sky-50/70 px-2.5 py-1.5 text-blue-800">
                            {typeInfo.icon}
                            <span className="text-[12.5px] font-semibold">{typeInfo.label}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 align-middle">
                        {view === "cancelled" ? (
                          <div>
                            <Badge tone={statusTone[apt.status]} dot>
                              Cancelled
                            </Badge>
                            <p className="mt-1.5 max-w-[220px] text-[12px] text-muted-foreground">
                              {apt.reason?.trim()
                                ? `Reason: ${apt.reason}`
                                : "No cancellation notes on file."}
                            </p>
                          </div>
                        ) : (
                          <Badge tone={statusTone[apt.status]} dot>
                            {STATUS_LABEL[apt.status]}
                          </Badge>
                        )}
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          {view === "pending" || (view === "new" && apt.status === "pending") ? (
                            <>
                              <Button
                                size="sm"
                                disabled={busyId === apt.id}
                                onClick={() => void changeStatus(apt, "confirmed")}
                              >
                                <Check className="size-3.5" />
                                Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busyId === apt.id}
                                onClick={() => void changeStatus(apt, "cancelled")}
                              >
                                <X className="size-3.5" />
                                Cancel
                              </Button>
                            </>
                          ) : null}
                          {view === "confirmed" ? (
                            <>
                              <Button
                                size="sm"
                                disabled={busyId === apt.id}
                                onClick={() => void changeStatus(apt, "completed")}
                              >
                                Complete
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busyId === apt.id}
                                onClick={() => void changeStatus(apt, "cancelled")}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : null}
                          {view === "completed" ? (
                            <Button size="sm" variant="outline" onClick={() => setFollowUpFor(apt)}>
                              Schedule follow-up
                            </Button>
                          ) : null}
                          {view === "all" || view === "follow-ups" ? (
                            <RowActionsDropdown
                              apt={apt}
                              busy={busyId === apt.id}
                              onChangeStatus={(s) => void changeStatus(apt, s)}
                              onScheduleNext={() => setFollowUpFor(apt)}
                            />
                          ) : null}
                          {apt.status !== "completed" && apt.status !== "cancelled" ? (
                            <button
                              type="button"
                              title="Edit / reschedule"
                              aria-label="Edit appointment"
                              disabled={busyId === apt.id}
                              onClick={() => setEditFor(apt)}
                              className="grid size-9 place-items-center rounded-lg border border-sky-200 bg-white text-blue-700 transition-all hover:bg-sky-50 disabled:opacity-40"
                            >
                              <Pencil className="size-3.5" />
                            </button>
                          ) : null}
                          <button
                            type="button"
                            title="Delete appointment"
                            aria-label="Delete appointment"
                            disabled={busyId === apt.id}
                            onClick={() => void deleteAppointment(apt)}
                            className="grid size-9 place-items-center rounded-lg border border-rose-200 bg-white text-rose-600 transition-all hover:bg-rose-50 disabled:opacity-40"
                          >
                            <Trash2 className="size-3.5" />
                          </button>
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

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-sky-100 px-5 py-4">
            <p className="text-[12.5px] text-muted-foreground">
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="px-2 text-[12.5px] font-semibold text-slate-600">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary disabled:opacity-40"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        </Panel>
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

      {editFor ? (
        <RescheduleDialog
          appointment={editFor}
          busy={busyId === editFor.id}
          onClose={() => setEditFor(null)}
          onSaved={(appointment, note) => {
            setAppointments((current) =>
              current.map((row) => (row.id === appointment.id ? appointment : row)),
            );
            setMessage(note);
            setEditFor(null);
          }}
          onError={(note) => setError(note)}
          setBusy={(busy) => setBusyId(busy ? editFor.id : null)}
        />
      ) : null}
    </>
  );
}

function RescheduleDialog({
  appointment,
  busy,
  onClose,
  onSaved,
  onError,
  setBusy,
}: {
  appointment: ApiAppointment;
  busy: boolean;
  onClose: () => void;
  onSaved: (appointment: ApiAppointment, message: string) => void;
  onError: (message: string) => void;
  setBusy: (busy: boolean) => void;
}) {
  const [slots, setSlots] = useState<ApiDoctorSlot[]>([]);
  const [date, setDate] = useState("");
  const [slotId, setSlotId] = useState("");
  const [loading, setLoading] = useState(true);
  const [localError, setLocalError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void doctorAvailabilityApi
      .list({ includeBooked: false })
      .then((result) => {
        if (cancelled) return;
        const open = result.slots.filter(
          (slot) => !slot.isBooked && new Date(slot.startsAt).getTime() > Date.now(),
        );
        setSlots(open);
        const firstDate = open[0]?.date ?? "";
        setDate(firstDate);
        setSlotId(open.find((slot) => slot.date === firstDate)?.id ?? "");
      })
      .catch((err) => {
        if (!cancelled) setLocalError(formatApiError(err, "Unable to load open slots."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appointment.id]);

  const dates = useMemo(() => [...new Set(slots.map((slot) => slot.date))], [slots]);
  const times = useMemo(() => slots.filter((slot) => slot.date === date), [slots, date]);

  async function submit() {
    if (!slotId) {
      setLocalError("Select a new date and time.");
      return;
    }
    setBusy(true);
    setLocalError("");
    try {
      const result = await doctorAppointmentsApi.reschedule(appointment.id, slotId);
      onSaved(result.appointment, result.message || "Appointment rescheduled.");
    } catch (err) {
      const note = formatApiError(err, "Unable to reschedule appointment.");
      setLocalError(note);
      onError(note);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-foreground/35 p-3 sm:p-4">
      <Panel className="my-4 w-full max-w-lg space-y-4 p-4 sm:my-0 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <SectionLabel>Edit appointment</SectionLabel>
            <p className="mt-1 text-sm font-semibold break-words">
              {appointment.reference} · {appointment.patientName}
            </p>
            <p className="text-xs text-muted-foreground">
              Current: {appointment.date} · {appointment.time}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        {localError ? <p className="text-sm text-destructive">{localError}</p> : null}

        {loading ? (
          <EmptyNote>Loading open times…</EmptyNote>
        ) : slots.length === 0 ? (
          <EmptyNote>No open times available. Add availability first, then reschedule.</EmptyNote>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="New date">
              <select
                className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
                value={date}
                onChange={(e) => {
                  const next = e.target.value;
                  setDate(next);
                  setSlotId(slots.find((slot) => slot.date === next)?.id ?? "");
                }}
              >
                {dates.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="New time">
              <select
                className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
              >
                {times.map((slot) => (
                  <option key={slot.id} value={slot.id}>
                    {slot.time}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={!slotId || loading || busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Panel>
    </div>
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
        className="h-12 w-full appearance-none rounded-xl border border-sky-200/80 bg-white pl-4 pr-10 text-[13.5px] font-medium text-foreground outline-none focus:ring-2 focus:ring-blue-500/25"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function RowActionsDropdown({
  apt,
  busy,
  onChangeStatus,
  onScheduleNext,
}: {
  apt: ApiAppointment;
  busy: boolean;
  onChangeStatus: (s: ApiAppointment["status"]) => void;
  onScheduleNext: () => void;
}) {
  const [open, setOpen] = useState(false);
  const terminal = apt.status === "completed" || apt.status === "cancelled";
  const actions: Array<{ label: string; onClick: () => void; danger?: boolean; separator?: boolean }> =
    [];

  if (!terminal) {
    if (apt.status !== "confirmed")
      actions.push({ label: "Mark confirmed", onClick: () => onChangeStatus("confirmed") });
    if (apt.status !== "pending")
      actions.push({ label: "Mark pending", onClick: () => onChangeStatus("pending") });
    if (apt.status !== "completed")
      actions.push({ label: "Mark completed", onClick: () => onChangeStatus("completed") });
    if (apt.status !== "cancelled")
      actions.push({
        label: "Cancel appointment",
        onClick: () => onChangeStatus("cancelled"),
        danger: true,
      });
    actions.push({ separator: true, label: "", onClick: () => {} });
  }
  actions.push({ label: "Schedule follow-up", onClick: onScheduleNext });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary disabled:opacity-40"
      >
        <MoreHorizontal className="size-4" />
      </button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-label="Close" />
          <div className="absolute right-0 z-20 mt-1.5 w-56 overflow-hidden rounded-xl border border-border bg-card py-1 shadow-xl">
            {actions.map((a, i) =>
              a.separator ? (
                <div key={`sep-${i}`} className="my-1.5 h-px w-full bg-border/80" />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    a.onClick();
                  }}
                  className={cn(
                    "block w-full px-4 py-2.5 text-left text-[13px] font-medium transition-colors hover:bg-secondary",
                    a.danger ? "text-destructive" : "text-foreground",
                  )}
                >
                  {a.label}
                </button>
              ),
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
