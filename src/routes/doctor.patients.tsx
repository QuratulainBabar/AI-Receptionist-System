import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Badge,
  Button,
  EmptyNote,
  Field,
  Input,
  PageHeader,
  Panel,
  SectionLabel,
} from "@/components/ui/primitives";
import { doctorPatientsApi, formatApiError, type ApiDoctorPatient } from "@/lib/api";
import { Calendar as DateCalendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { initials } from "@/lib/mock-data";
import {
  Search,
  ChevronDown,
  UserRoundPlus,
  FileText,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/patients")({
  head: () => ({
    meta: [
      { title: "Patient list — AI Receptionist" },
      { name: "description", content: "Browse patients assigned to your clinic and open their files." },
      { property: "og:title", content: "Patient list — AI Receptionist" },
      { property: "og:description", content: "Search patients and review recent conditions." },
    ],
  }),
  component: PatientsLayout,
});

function PatientsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/doctor/patients/$patientId");
  if (isDetail) return <Outlet />;
  return <PatientListPage />;
}

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

const STATUS_OPTIONS = ["All Status", "Active", "Inactive"] as const;
const GENDER_OPTIONS = ["All Genders", "Male", "Female", "Other"] as const;

function PatientListPage() {
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [patients, setPatients] = useState<ApiDoctorPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<ApiDoctorPatient | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("All Status");
  const [genderFilter, setGenderFilter] = useState<string>("All Genders");
  const [sortBy, setSortBy] = useState<string>("Last Visit ↓");
  const [page, setPage] = useState(1);
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const PAGE_SIZE = 10;

  function reloadPatients() {
    setLoading(true);
    return doctorPatientsApi
      .list({ q: appliedQuery || undefined })
      .then((result) => setPatients(result.patients))
      .catch((err) => setError(formatApiError(err, "Unable to load patients.")))
      .finally(() => setLoading(false));
  }

  async function deletePatient(patient: ApiDoctorPatient) {
    const ok = window.confirm(
      `Delete ${patient.name}?\n\nThis permanently removes their patient file and appointments. This cannot be undone.`,
    );
    if (!ok) return;
    setMessage("");
    setError("");
    try {
      const result = await doctorPatientsApi.delete(patient.id);
      setPatients((current) => current.filter((row) => row.id !== patient.id));
      setMessage(result.message || `${patient.name} has been deleted.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to delete patient."));
    }
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void doctorPatientsApi
      .list({ q: appliedQuery || undefined })
      .then((result) => {
        if (!cancelled) setPatients(result.patients);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load patients."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [appliedQuery]);

  const filtered = useMemo(() => {
    return patients
      .slice()
      .filter((p) => {
        if (statusFilter === "Active" && !p.isActive) return false;
        if (statusFilter === "Inactive" && p.isActive) return false;
        if (genderFilter !== "All Genders") {
          const g = (p.gender || "").toLowerCase();
          if (!g.includes(genderFilter.toLowerCase())) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "Name A-Z") return a.name.localeCompare(b.name);
        if (sortBy === "Name Z-A") return b.name.localeCompare(a.name);
        if (sortBy === "Last Visit ↑") {
          return (a.lastVisit || "").localeCompare(b.lastVisit || "");
        }
        return (b.lastVisit || "").localeCompare(a.lastVisit || "");
      });
  }, [patients, statusFilter, genderFilter, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectedDateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <>
      <PageHeader
        title="Patient list"
        description="Open a file to review history, reports and visits."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Choose date"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-[13px] font-semibold text-foreground shadow-sm transition-all hover:bg-secondary"
                >
                  <span className="grid size-[18px] place-items-center text-primary">
                    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="4" width="18" height="18" rx="2" />
                      <path d="M16 2v4M8 2v4M3 10h18" />
                    </svg>
                  </span>
                  {selectedDateLabel}
                  <ChevronDown className="size-4 text-muted-foreground" strokeWidth={2.5} />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-0">
                <DateCalendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (!date) return;
                    setSelectedDate(date);
                    setCalendarOpen(false);
                  }}
                />
              </PopoverContent>
            </Popover>
            <Button type="button" onClick={() => setAddOpen(true)}>
              <UserRoundPlus className="size-4" strokeWidth={2} />
              New Patient
            </Button>
          </div>
        }
      />

      {message ? <p className="mb-4 text-sm text-primary">{message}</p> : null}

      <PatientFormModal
        open={addOpen || Boolean(editingPatient)}
        patient={editingPatient}
        onClose={() => {
          setAddOpen(false);
          setEditingPatient(null);
        }}
        onSaved={(msg) => {
          setMessage(msg);
          setError("");
          setPage(1);
          void reloadPatients();
        }}
      />

      <Panel className="mb-5 p-4">
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-[17px] text-muted-foreground/70"
              strokeWidth={2}
            />
            <input
              type="text"
              value={query}
              placeholder="Search by patient name, phone, or ID..."
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setAppliedQuery(query.trim());
                  setPage(1);
                }
              }}
              className="h-11 w-full rounded-xl border-2 border-transparent bg-input-fill pl-10.5 pr-4 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 transition-all focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:outline-none"
              style={{ boxShadow: "inset 0 1px 2px 0 rgba(15, 23, 42, 0.03)" }}
            />
          </div>

          <FilterSelect
            label={statusFilter}
            options={[...STATUS_OPTIONS]}
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          />
          <FilterSelect
            label={genderFilter}
            options={[...GENDER_OPTIONS]}
            onChange={(v) => {
              setGenderFilter(v);
              setPage(1);
            }}
          />
          <FilterSelect
            label={sortBy}
            options={["Last Visit ↓", "Last Visit ↑", "Name A-Z", "Name Z-A"]}
            onChange={(v) => setSortBy(v)}
          />
        </div>
      </Panel>

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <EmptyNote>Loading patients…</EmptyNote>
      ) : filtered.length === 0 ? (
        <EmptyNote>
          {appliedQuery || statusFilter !== "All Status" || genderFilter !== "All Genders"
            ? "No patients match that search."
            : "No patients yet. Use New Patient to add someone, or wait for a booking."}
        </EmptyNote>
      ) : (
        <Panel className="w-full max-w-full overflow-hidden p-3 sm:p-5">
          <div className="table-scroll -mx-1 w-full max-w-full">
            <table className="w-full min-w-[760px] table-fixed md:min-w-[900px]">
              <thead>
                <tr className="border-b" style={{ borderColor: "#EEF2F7" }}>
                  <th className="px-5 py-3.5 text-left min-w-[200px]">
                    <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                      Patient
                    </SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left min-w-[130px]">
                    <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                      Patient ID
                    </SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left min-w-[160px]">
                    <div className="inline-flex items-center gap-1.5">
                      <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                        Last Visit
                      </SectionLabel>
                      <svg width="10" height="12" viewBox="0 0 10 12" className="text-primary" fill="currentColor">
                        <path d="M5 0L0 6h10L5 0zM5 12L0 6h10l-5 6z" />
                      </svg>
                    </div>
                  </th>
                  <th className="px-3 py-3.5 text-left min-w-[180px]">
                    <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                      Condition
                    </SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left min-w-[110px]">
                    <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                      Status
                    </SectionLabel>
                  </th>
                  <th className="px-5 py-3.5 text-right min-w-[130px]">
                    <SectionLabel className="text-[10.5px]" style={{ letterSpacing: "0.1em" }}>
                      Actions
                    </SectionLabel>
                  </th>
                </tr>
              </thead>
              <tbody>
                {pageItems.map((patient, idx) => {
                  const initialsText = initials(patient.name);
                  const grad = avatarGradientFor(patient.name, idx);
                  const infoPieces = [patient.age ?? "—", patient.gender].filter(Boolean);
                  const infoLine = infoPieces.length > 0 ? infoPieces.join(" · ") : "—";
                  return (
                    <tr
                      key={patient.id}
                      className="border-b transition-colors hover:bg-muted/30"
                      style={{ borderColor: "#F1F5F9" }}
                    >
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center gap-3">
                          <div
                            className="grid size-11 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white shadow-md shadow-black/10"
                            style={{ background: grad }}
                          >
                            {initialsText}
                          </div>
                          <div className="min-w-0 leading-tight">
                            <p className="truncate text-[13.5px] font-semibold text-foreground">
                              {patient.name}
                            </p>
                            <p className="truncate text-[12px] text-muted-foreground mt-0.5">
                              {patient.phone || infoLine}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <span className="font-mono text-[12.5px] font-semibold text-foreground tracking-tight">
                          {patient.reference}
                        </span>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <div className="flex items-center gap-2.5">
                          <div
                            className="grid size-[30px] shrink-0 place-items-center rounded-lg text-primary"
                            style={{
                              background:
                                "linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.06))",
                            }}
                          >
                            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="3" y="4" width="18" height="18" rx="2" />
                              <path d="M16 2v4M8 2v4M3 10h18" />
                            </svg>
                          </div>
                          <div className="min-w-0 leading-tight">
                            <p className="truncate text-[13px] font-semibold text-foreground">
                              {patient.lastVisit === "First visit" ? "First visit" : patient.lastVisit}
                            </p>
                            {patient.lastVisit !== "First visit" ? (
                              <p className="truncate text-[11.5px] text-muted-foreground mt-0.5">
                                {infoLine}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <p
                          className={cn(
                            "text-[13px] truncate",
                            patient.condition ? "text-foreground" : "text-muted-foreground/60",
                          )}
                        >
                          {patient.condition || "—"}
                        </p>
                      </td>
                      <td className="px-3 py-4 align-middle">
                        <Badge
                          tone={patient.isActive ? "success" : "muted"}
                          dot
                        >
                          {patient.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link
                            to="/doctor/patients/$patientId"
                            params={{ patientId: patient.id }}
                            onClick={() => setPage(currentPage)}
                          >
                            <Button size="sm" variant="outline">
                              <FileText className="size-3.5" strokeWidth={2} />
                              View
                            </Button>
                          </Link>
                          <button
                            type="button"
                            aria-label={`Edit ${patient.name}`}
                            title="Edit patient"
                            onClick={() => setEditingPatient(patient)}
                            className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
                          >
                            <Pencil className="size-4" strokeWidth={2.1} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${patient.name}`}
                            title="Delete patient"
                            onClick={() => void deletePatient(patient)}
                            className="grid size-9 shrink-0 place-items-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50"
                          >
                            <Trash2 className="size-4" strokeWidth={2.1} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-3 border-t" style={{ borderColor: "#EEF2F7" }}>
            <p className="text-[12.5px] text-muted-foreground font-medium">
              Showing {Math.min((currentPage - 1) * PAGE_SIZE + 1, filtered.length)} –{" "}
              {Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} patients
            </p>
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, currentPage - 1))}
                disabled={currentPage <= 1}
                className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="size-4" strokeWidth={2} />
              </button>
              {Array.from({ length: totalPages }).slice(0, 5).map((_, i) => {
                const pageNum = i + 1;
                const isActive = pageNum === currentPage;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setPage(pageNum)}
                    className={cn(
                      "grid min-w-[36px] size-9 place-items-center rounded-lg px-2.5 text-[13px] font-bold transition-all",
                      isActive
                        ? "text-white"
                        : "border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                    style={
                      isActive
                        ? {
                            background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #1E40AF 100%)",
                            boxShadow: "0 4px 12px -3px rgba(37, 99, 235, 0.5)",
                          }
                        : undefined
                    }
                  >
                    {pageNum}
                  </button>
                );
              })}
              {totalPages > 5 ? (
                <>
                  <span className="grid size-9 place-items-center text-muted-foreground font-medium">
                    …
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(totalPages)}
                    className={cn(
                      "grid min-w-[36px] size-9 place-items-center rounded-lg px-2.5 text-[13px] font-bold border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground transition-all",
                    )}
                  >
                    {totalPages}
                  </button>
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage >= totalPages}
                className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-all hover:bg-secondary hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="size-4" strokeWidth={2} />
              </button>
            </div>
          </div>
        </Panel>
      )}
    </>
  );
}

function FilterSelect({
  label,
  options,
  onChange,
}: {
  label: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative w-full">
      <select
        value={label}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 w-full appearance-none rounded-xl border-2 border-transparent bg-input-fill px-3.5 pr-9 text-[13.5px] font-semibold text-foreground transition-all focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:outline-none"
        style={{ boxShadow: "inset 0 1px 2px 0 rgba(15, 23, 42, 0.03)" }}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
        strokeWidth={2.5}
      />
    </div>
  );
}

type AddPatientForm = {
  fullName: string;
  phone: string;
  email: string;
  age: string;
  gender: string;
  condition: string;
};

const emptyAddPatientForm = (): AddPatientForm => ({
  fullName: "",
  phone: "",
  email: "",
  age: "",
  gender: "",
  condition: "",
});

function PatientFormModal({
  open,
  patient,
  onClose,
  onSaved,
}: {
  open: boolean;
  patient: ApiDoctorPatient | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const isEdit = Boolean(patient);
  const [form, setForm] = useState<AddPatientForm>(emptyAddPatientForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    if (patient) {
      const gender =
        patient.gender && patient.gender !== "—" ? patient.gender : "";
      setForm({
        fullName: patient.name || "",
        phone: patient.phone || "",
        email: patient.email || "",
        age: patient.age != null ? String(patient.age) : "",
        gender,
        condition: patient.condition || "",
      });
    } else {
      setForm(emptyAddPatientForm());
    }
    setError("");
  }, [open, patient]);

  if (!open) return null;

  function setField<K extends keyof AddPatientForm>(key: K, value: AddPatientForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const fullName = form.fullName.trim().replace(/\s+/g, " ");
    if (fullName.length < 2) {
      setError("Full name is required.");
      return;
    }
    if (form.phone.replace(/\D/g, "").length < 10) {
      setError("Phone number must include at least 10 digits.");
      return;
    }

    const ageValue = form.age.trim() ? Number(form.age) : null;
    if (form.age.trim() && (!Number.isFinite(ageValue) || (ageValue ?? 0) < 1)) {
      setError("Enter a valid age, or leave it blank.");
      return;
    }

    const payload = {
      fullName,
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      age: ageValue,
      gender: form.gender.trim() || undefined,
      condition: form.condition.trim() || undefined,
    };

    setSaving(true);
    try {
      if (patient) {
        const result = await doctorPatientsApi.update(patient.id, payload);
        onSaved(result.message || `${fullName} was updated.`);
      } else {
        const result = await doctorPatientsApi.create(payload);
        onSaved(result.message || `${fullName} was added to your patient list.`);
      }
      onClose();
    } catch (err) {
      setError(formatApiError(err, isEdit ? "Unable to update patient." : "Unable to add patient."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-3 sm:p-6">
      <div className="my-4 w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl sm:my-8">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-jakarta text-lg font-bold text-slate-900">
              {isEdit ? "Edit patient" : "New patient"}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">
              {isEdit
                ? "Update this patient file for your clinic list."
                : "Add a patient to your clinic list. They can book later with the same phone number."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close"
          >
            <X className="size-4" strokeWidth={2.2} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-4 py-5 sm:px-5">
          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Field label="Full name">
            <Input
              value={form.fullName}
              onChange={(e) => setField("fullName", e.target.value)}
              placeholder="e.g. Sarah Ahmed"
              autoFocus
            />
          </Field>

          <Field label="Phone">
            <Input
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              placeholder="e.g. 03001234567"
              inputMode="tel"
            />
          </Field>

          <Field label="Email (optional)">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              placeholder="patient@email.com"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Age (optional)">
              <Input
                value={form.age}
                onChange={(e) => setField("age", e.target.value)}
                placeholder="32"
                inputMode="numeric"
              />
            </Field>
            <Field label="Gender (optional)">
              <select
                value={form.gender}
                onChange={(e) => setField("gender", e.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3.5 text-[13.5px] text-foreground"
              >
                <option value="">Select</option>
                <option value="Female">Female</option>
                <option value="Male">Male</option>
                <option value="Other">Other</option>
              </select>
            </Field>
          </div>

          <Field label="Condition / reason (optional)">
            <Input
              value={form.condition}
              onChange={(e) => setField("condition", e.target.value)}
              placeholder="e.g. Hypertension follow-up"
            />
          </Field>

          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {isEdit ? (
                <Pencil className="size-4" strokeWidth={2} />
              ) : (
                <UserRoundPlus className="size-4" strokeWidth={2} />
              )}
              {saving ? "Saving…" : isEdit ? "Save changes" : "Add patient"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
