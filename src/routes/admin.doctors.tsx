import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  EmptyNote,
  Input,
  PageHeader,
  Panel,
} from "@/components/ui/primitives";
import { AddDoctorModal } from "@/components/admin/AddDoctorModal";
import {
  adminApi,
  formatApiError,
  type ApiAdminDoctor,
  type ApiAdminDoctorSummary,
} from "@/lib/api";
import { Eye, Pause, Pencil, Play, Plus, Search, Stethoscope, Trash2, UserCheck, UserX } from "lucide-react";

export const Route = createFileRoute("/admin/doctors")({
  head: () => ({
    meta: [{ title: "Manage doctors — Super Admin" }],
  }),
  component: AdminDoctorsLayout,
});

function AdminDoctorsLayout() {
  const matches = useMatches();
  const isDetail = matches.some((match) => match.routeId === "/admin/doctors/$userId");
  if (isDetail) return <Outlet />;
  return <AdminDoctorsPage />;
}

function formatJoined(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function AdminDoctorsPage() {
  const [users, setUsers] = useState<ApiAdminDoctor[]>([]);
  const [summary, setSummary] = useState<ApiAdminDoctorSummary>({
    total: 0,
    active: 0,
    inactive: 0,
  });
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [specialty, setSpecialty] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  async function load(nextQ = appliedQ, nextStatus = status) {
    setLoading(true);
    setError("");
    try {
      const result = await adminApi.listDoctors({
        q: nextQ || undefined,
        status: nextStatus,
      });
      setUsers(result.users);
      setSummary(result.summary);
    } catch (err) {
      setError(formatApiError(err, "Unable to load doctors."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const specialtyOptions = useMemo(() => {
    const names = new Set<string>();
    for (const user of users) {
      if (user.specialty?.trim()) names.add(user.specialty.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [users]);

  const visibleUsers = useMemo(() => {
    if (specialty === "all") return users;
    return users.filter(
      (user) => (user.specialty || "").trim().toLowerCase() === specialty.toLowerCase(),
    );
  }, [specialty, users]);

  async function toggleStatus(user: ApiAdminDoctor) {
    setNotice("");
    setError("");
    try {
      const result = await adminApi.setStatus(user.id, !user.isActive);
      setUsers((current) =>
        current.map((item) =>
          item.id === user.id ? { ...item, ...result.user, isActive: result.user.isActive } : item,
        ),
      );
      setSummary((current) => {
        const activating = result.user.isActive;
        return {
          total: current.total,
          active: current.active + (activating ? 1 : -1),
          inactive: current.inactive + (activating ? -1 : 1),
        };
      });
      setNotice(
        result.user.isActive
          ? `${user.fullName} is now active.`
          : `${user.fullName} is now inactive.`,
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to update status."));
    }
  }

  async function deleteDoctor(user: ApiAdminDoctor) {
    const ok = window.confirm(
      `Delete ${user.fullName}?\n\nThis permanently removes their account, appointments, and clinic data. This cannot be undone.`,
    );
    if (!ok) return;
    setNotice("");
    setError("");
    try {
      const result = await adminApi.deleteDoctor(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setSummary((current) => ({
        total: Math.max(0, current.total - 1),
        active: user.isActive ? Math.max(0, current.active - 1) : current.active,
        inactive: user.isActive ? current.inactive : Math.max(0, current.inactive - 1),
      }));
      setNotice(result.message || `${user.fullName} has been deleted.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to delete doctor."));
    }
  }

  function runSearch() {
    setAppliedQ(q);
    setSpecialty("all");
    void load(q, status);
  }

  const cards = [
    {
      label: "Total doctors",
      value: summary.total,
      icon: <Stethoscope className="size-5" strokeWidth={2.2} />,
      tint: "rgba(37,99,235,0.12)",
      color: "#1D4ED8",
    },
    {
      label: "Active doctors",
      value: summary.active,
      icon: <UserCheck className="size-5" strokeWidth={2.2} />,
      tint: "rgba(16,185,129,0.12)",
      color: "#047857",
    },
    {
      label: "Inactive doctors",
      value: summary.inactive,
      icon: <UserX className="size-5" strokeWidth={2.2} />,
      tint: "rgba(244,63,94,0.1)",
      color: "#BE123C",
    },
  ];

  return (
    <>
      <PageHeader
        title="Doctors"
        description="Manage clinic doctor accounts, profiles, and portal access."
        actions={
          <Button type="button" className="rounded-xl gap-2" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" strokeWidth={2.2} />
            Add doctor
          </Button>
        }
      />

      <AddDoctorModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(message) => {
          setNotice(message);
          setError("");
          void load(appliedQ, status);
        }}
      />

      <div className="mb-6 grid min-w-0 gap-3 sm:grid-cols-3 sm:gap-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="min-w-0 rounded-2xl border border-border/80 bg-card p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-semibold text-muted-foreground">{card.label}</p>
                <p className="mt-2 font-jakarta text-[28px] font-extrabold leading-none tracking-tight text-foreground">
                  {card.value}
                </p>
              </div>
              <span
                className="grid size-11 place-items-center rounded-xl"
                style={{ background: card.tint, color: card.color }}
              >
                {card.icon}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Panel className="overflow-hidden !p-0">
        <div className="border-b border-border/80 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search
                className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                strokeWidth={2.1}
              />
              <Input
                placeholder="Search by doctor name, email, specialty, or clinic"
                className="!h-11 !rounded-xl !pl-10"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") runSearch();
                }}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                className="h-11 rounded-xl border border-border bg-card px-3 text-[13px] font-semibold text-foreground outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-100/80"
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                aria-label="Filter by specialty"
              >
                <option value="all">All specialties</option>
                {specialtyOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <div className="inline-flex rounded-xl border border-border bg-muted/30 p-1">
                {(["all", "active", "inactive"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setStatus(value);
                      setSpecialty("all");
                      void load(appliedQ, value);
                    }}
                    className={`rounded-lg px-3 py-2 text-[12.5px] font-bold capitalize transition-colors ${
                      status === value
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
              <Button type="button" className="!h-11 rounded-xl" onClick={runSearch}>
                Search
              </Button>
            </div>
          </div>
        </div>

        {error ? (
          <p className="border-b border-rose-200/70 bg-rose-50/70 px-4 py-3 text-sm text-rose-700 sm:px-5">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p className="border-b border-emerald-200/70 bg-emerald-50/70 px-4 py-3 text-sm text-emerald-700 sm:px-5">
            {notice}
          </p>
        ) : null}

        {loading ? (
          <div className="p-6">
            <EmptyNote>Loading doctors…</EmptyNote>
          </div>
        ) : visibleUsers.length === 0 ? (
          <div className="p-6">
            <EmptyNote>No doctors match this search.</EmptyNote>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="min-w-[880px] w-full text-sm">
              <thead className="bg-muted/40 text-left text-[11.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3.5 font-medium sm:px-5">Doctor</th>
                  <th className="px-5 py-3.5 font-medium">Specialty</th>
                  <th className="px-5 py-3.5 font-medium">Email</th>
                  <th className="px-5 py-3.5 font-medium">Phone</th>
                  <th className="px-5 py-3.5 font-medium">Status</th>
                  <th className="px-5 py-3.5 font-medium">Joined</th>
                  <th className="px-5 py-3.5 font-medium">Appointments</th>
                  <th className="px-5 py-3.5 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/80">
                {visibleUsers.map((user) => (
                  <tr key={user.id} className="transition-colors hover:bg-blue-50/40">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span
                          className="grid size-10 shrink-0 place-items-center rounded-xl text-[12px] font-bold text-white"
                          style={{
                            background: "linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)",
                          }}
                        >
                          {user.fullName
                            .replace(/^Dr\.\s+/i, "")
                            .split(" ")
                            .slice(0, 2)
                            .map((part) => part[0] || "")
                            .join("")
                            .toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{user.fullName}</p>
                          <p className="truncate font-mono text-[11px] text-muted-foreground">
                            {user.reference}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-foreground/90">{user.specialty || "—"}</td>
                    <td className="px-5 py-4 text-foreground/90">{user.email}</td>
                    <td className="px-5 py-4 text-foreground/90">{user.phone || "—"}</td>
                    <td className="px-5 py-4">
                      <Badge tone={user.isActive ? "success" : "destructive"} dot>
                        {user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-5 py-4 text-muted-foreground">{formatJoined(user.createdAt)}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-foreground">{user.totalAppointments}</p>
                      <p className="text-[11.5px] text-muted-foreground">
                        {user.upcomingAppointments} upcoming
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <Link
                          to="/admin/doctors/$userId"
                          params={{ userId: user.id }}
                          aria-label={`View ${user.fullName}`}
                          className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          title="View details"
                        >
                          <Eye className="size-4" strokeWidth={2.1} />
                        </Link>
                        <Link
                          to="/admin/doctors/$userId"
                          params={{ userId: user.id }}
                          aria-label={`Edit ${user.fullName}`}
                          className="grid size-9 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                          title="Edit profile"
                        >
                          <Pencil className="size-4" strokeWidth={2.1} />
                        </Link>
                        <button
                          type="button"
                          aria-label={user.isActive ? `Deactivate ${user.fullName}` : `Activate ${user.fullName}`}
                          title={user.isActive ? "Deactivate" : "Activate"}
                          onClick={() => void toggleStatus(user)}
                          className={`grid size-9 place-items-center rounded-lg border transition-colors ${
                            user.isActive
                              ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                              : "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {user.isActive ? (
                            <Pause className="size-4" strokeWidth={2.1} />
                          ) : (
                            <Play className="size-4" strokeWidth={2.1} />
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${user.fullName}`}
                          title="Delete doctor"
                          onClick={() => void deleteDoctor(user)}
                          className="grid size-9 place-items-center rounded-lg border border-rose-200 text-rose-600 transition-colors hover:bg-rose-50"
                        >
                          <Trash2 className="size-4" strokeWidth={2.1} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
