import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
import {
  doctorTeamApi,
  formatApiError,
  type ApiClinicPermissionKey,
  type ApiClinicPermissions,
  type ApiClinicStaffRole,
  type ApiTeamMember,
  type ApiTeamRoleOption,
} from "@/lib/api";
import { initials } from "@/lib/mock-data";
import {
  Check,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/team")({
  head: () => ({
    meta: [
      { title: "Team Members — Doctor portal" },
      {
        name: "description",
        content: "Add and manage clinic team members with role-based permissions.",
      },
    ],
  }),
  component: DoctorTeamPage,
});

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg, #3B82F6 0%, #2563EB 100%)",
  "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
  "linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)",
  "linear-gradient(135deg, #F43F5E 0%, #E11D48 100%)",
  "linear-gradient(135deg, #10B981 0%, #059669 100%)",
];

function avatarGradientFor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length]!;
}

const ROLE_BADGE: Record<string, string> = {
  RECEPTIONIST: "bg-sky-100 text-sky-800",
  CLINIC_ADMINISTRATOR: "bg-indigo-100 text-indigo-800",
  OFFICE_MANAGER: "bg-violet-100 text-violet-800",
  APPOINTMENT_COORDINATOR: "bg-cyan-100 text-cyan-800",
  NURSE: "bg-emerald-100 text-emerald-800",
  BILLING: "bg-amber-100 text-amber-900",
  ADDITIONAL_DOCTOR: "bg-blue-100 text-blue-900",
};

type FormState = {
  fullName: string;
  email: string;
  password: string;
  staffRole: ApiClinicStaffRole;
  status: "active" | "inactive";
  permissions: ApiClinicPermissions;
};

function emptyPermissions(): ApiClinicPermissions {
  return {
    appointments: false,
    patients: false,
    medicalReports: false,
    callTranscriptions: false,
    followUps: false,
    invoices: false,
    availability: false,
    clinicSettings: false,
    teamMembers: false,
  };
}

function DoctorTeamPage() {
  const [members, setMembers] = useState<ApiTeamMember[]>([]);
  const [roles, setRoles] = useState<ApiTeamRoleOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ApiTeamMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  async function refresh() {
    const [membersResult, rolesResult] = await Promise.all([
      doctorTeamApi.list(),
      doctorTeamApi.listRoles(),
    ]);
    setMembers(membersResult.members);
    setRoles(rolesResult.roles);
  }

  useEffect(() => {
    let cancelled = false;
    void refresh()
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load team members."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter !== "all" && m.staffRole !== roleFilter) return false;
      if (statusFilter !== "all" && m.status !== statusFilter) return false;
      if (searchQ.trim()) {
        const q = searchQ.toLowerCase();
        const hay = `${m.fullName} ${m.email} ${m.staffRoleLabel} ${m.reference}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [members, roleFilter, statusFilter, searchQ]);

  const activeCount = members.filter((m) => m.status === "active").length;

  function openCreate() {
    const defaultRole = roles[0];
    setEditing(null);
    setForm({
      fullName: "",
      email: "",
      password: "",
      staffRole: defaultRole?.id || "RECEPTIONIST",
      status: "active",
      permissions: defaultRole?.defaultPermissions || emptyPermissions(),
    });
    setModalOpen(true);
    setError("");
    setSuccess("");
  }

  function openEdit(member: ApiTeamMember) {
    setEditing(member);
    setForm({
      fullName: member.fullName,
      email: member.email,
      password: "",
      staffRole: member.staffRole,
      status: member.status,
      permissions: { ...member.permissions },
    });
    setModalOpen(true);
    setError("");
    setSuccess("");
  }

  function applyRoleDefaults(roleId: ApiClinicStaffRole) {
    const option = roles.find((r) => r.id === roleId);
    setForm((current) =>
      current
        ? {
            ...current,
            staffRole: roleId,
            permissions: option?.defaultPermissions || emptyPermissions(),
          }
        : current,
    );
  }

  async function submitForm() {
    if (!form) return;
    if (!form.fullName.trim() || !form.email.trim()) {
      setError("Full name and email are required.");
      return;
    }
    if (!editing && form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (editing && form.password && form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");
    try {
      if (editing) {
        const result = await doctorTeamApi.update(editing.id, {
          fullName: form.fullName.trim(),
          staffRole: form.staffRole,
          permissions: form.permissions,
          status: form.status,
          ...(form.password ? { password: form.password } : {}),
        });
        setSuccess(result.message || "Team member updated.");
      } else {
        const result = await doctorTeamApi.create({
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          staffRole: form.staffRole,
          permissions: form.permissions,
          status: form.status,
        });
        setSuccess(result.message || "Team member added.");
      }
      await refresh();
      setModalOpen(false);
      setForm(null);
      setEditing(null);
    } catch (err) {
      setError(formatApiError(err, "Unable to save team member."));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(member: ApiTeamMember) {
    setBusyId(member.id);
    setError("");
    setSuccess("");
    try {
      const next = member.status === "active" ? "inactive" : "active";
      const result = await doctorTeamApi.update(member.id, { status: next });
      setMembers((current) => current.map((row) => (row.id === member.id ? result.member : row)));
      setSuccess(result.message || `Member marked ${next}.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to update status."));
    } finally {
      setBusyId(null);
    }
  }

  async function removeMember(member: ApiTeamMember) {
    if (!window.confirm(`Remove ${member.fullName} from your clinic team?`)) return;
    setBusyId(member.id);
    setError("");
    setSuccess("");
    try {
      const result = await doctorTeamApi.remove(member.id);
      setMembers((current) => current.filter((row) => row.id !== member.id));
      setSuccess(result.message || "Team member removed.");
    } catch (err) {
      setError(formatApiError(err, "Unable to remove team member."));
    } finally {
      setBusyId(null);
    }
  }

  const selectedRole = roles.find((r) => r.id === form?.staffRole);
  const permissionEntries = selectedRole
    ? (Object.keys(selectedRole.permissionLabels) as ApiClinicPermissionKey[])
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Users"
        title="Team Members"
        description="Manage clinic staff and team members with access to appointments, patients, billing, and clinic settings."
        actions={
          <Button onClick={openCreate} disabled={loading || !roles.length}>
            <Plus className="size-4" />
            Add Team Member
          </Button>
        }
      />

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      <Panel className="mb-5 border border-sky-100 bg-sky-50/40 p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(0,0.8fr)_minmax(0,0.8fr)]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by name, email, or role…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              className="h-12 w-full rounded-xl border border-sky-200/80 bg-white pl-11 pr-4 text-[13.5px] outline-none focus:ring-2 focus:ring-blue-500/25"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-12 rounded-xl border border-sky-200/80 bg-white px-4 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-blue-500/25"
          >
            <option value="all">All roles</option>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.label}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-12 rounded-xl border border-sky-200/80 bg-white px-4 text-[13.5px] font-medium outline-none focus:ring-2 focus:ring-blue-500/25"
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </Panel>

      <Panel className="overflow-hidden border border-sky-100 p-0">
        <div className="flex items-center gap-2 border-b border-sky-100 bg-gradient-to-r from-sky-50 to-blue-50/50 px-5 py-4">
          <ShieldCheck className="size-4 text-blue-600" />
          <h3 className="text-[14px] font-semibold text-slate-900">
            Active Team Members ({activeCount})
          </h3>
        </div>

        {loading ? (
          <div className="p-6">
            <EmptyNote>Loading team members…</EmptyNote>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-6">
            <EmptyNote>
              No team members yet. Click Add Team Member to invite clinic staff.
            </EmptyNote>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[800px] md:min-w-[960px]">
              <thead>
                <tr className="border-b border-sky-100">
                  <th className="px-5 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">Member</SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">Role & permissions</SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">Status</SectionLabel>
                  </th>
                  <th className="px-3 py-3.5 text-left">
                    <SectionLabel className="text-[10.5px]">Date added</SectionLabel>
                  </th>
                  <th className="px-5 py-3.5 text-right">
                    <SectionLabel className="text-[10.5px]">Actions</SectionLabel>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((member) => (
                  <tr
                    key={member.id}
                    className="border-b border-slate-100 transition-colors hover:bg-sky-50/40"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="grid size-10 place-items-center rounded-full text-[12.5px] font-bold text-white"
                          style={{ background: avatarGradientFor(member.fullName) }}
                        >
                          {initials(member.fullName)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold text-foreground">
                            {member.fullName}
                          </p>
                          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                            {member.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <span
                        className={cn(
                          "inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-bold",
                          ROLE_BADGE[member.staffRole] || "bg-slate-100 text-slate-700",
                        )}
                      >
                        {member.staffRoleLabel}
                      </span>
                      <p className="mt-1.5 max-w-[260px] text-[11.5px] text-muted-foreground">
                        {Object.entries(member.permissions)
                          .filter(([, on]) => on)
                          .map(([key]) => key)
                          .slice(0, 4)
                          .join(", ")}
                        {Object.values(member.permissions).filter(Boolean).length > 4 ? "…" : ""}
                      </p>
                    </td>
                    <td className="px-3 py-4">
                      <Badge tone={member.status === "active" ? "success" : "muted"} dot>
                        {member.status === "active" ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-3 py-4 text-[13px] text-slate-700">{member.dateAdded}</td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          title="Edit"
                          disabled={busyId === member.id}
                          onClick={() => openEdit(member)}
                          className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === member.id}
                          onClick={() => void toggleStatus(member)}
                        >
                          {member.status === "active" ? "Deactivate" : "Activate"}
                        </Button>
                        <button
                          type="button"
                          title="Remove"
                          disabled={busyId === member.id}
                          onClick={() => void removeMember(member)}
                          className="grid size-9 place-items-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="size-3.5" />
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

      {modalOpen && form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]"
            aria-label="Close"
            onClick={() => !saving && setModalOpen(false)}
          />
          <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-sky-100 bg-white shadow-2xl scrollbar-thin">
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-sky-100 bg-white px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-blue-50 text-blue-700">
                    <UserPlus className="size-4" />
                  </span>
                  <h3 className="text-[16px] font-semibold text-slate-900">
                    {editing ? "Edit Team Member" : "Add Team Member"}
                  </h3>
                </div>
                <p className="mt-1 text-[12.5px] text-slate-500">
                  Add staff to collaborate on clinic operations with role-based permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => !saving && setModalOpen(false)}
                className="grid size-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <Field label="Full name" required>
                <Input
                  placeholder="e.g. Jane Doe"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                />
              </Field>
              <Field label="Email address" required>
                <Input
                  type="email"
                  placeholder="staff@clinic.com"
                  value={form.email}
                  disabled={Boolean(editing)}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </Field>
              <Field
                label={editing ? "New password (optional)" : "Password"}
                required={!editing}
                hint={editing ? "Leave blank to keep the current password." : "Minimum 8 characters."}
              >
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </Field>
              <Field label="Team member role" required>
                <select
                  value={form.staffRole}
                  onChange={(e) => applyRoleDefaults(e.target.value as ApiClinicStaffRole)}
                  className="h-12 w-full rounded-xl border-2 border-transparent bg-input-fill px-4 text-[13.5px] outline-none focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.label}
                    </option>
                  ))}
                </select>
              </Field>
              {selectedRole ? (
                <p className="rounded-xl border border-sky-100 bg-sky-50/60 px-3 py-2 text-[12.5px] text-slate-600">
                  {selectedRole.description}
                </p>
              ) : null}

              <div>
                <SectionLabel>Permissions</SectionLabel>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {permissionEntries.map((key) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-[12.5px] font-medium text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(form.permissions[key])}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            permissions: { ...form.permissions, [key]: e.target.checked },
                          })
                        }
                        className="size-4 rounded border-slate-300 text-blue-600"
                      />
                      {selectedRole?.permissionLabels[key] || key}
                    </label>
                  ))}
                </div>
              </div>

              <Field label="Account status">
                <select
                  value={form.status}
                  onChange={(e) =>
                    setForm({ ...form, status: e.target.value as "active" | "inactive" })
                  }
                  className="h-12 w-full rounded-xl border-2 border-transparent bg-input-fill px-4 text-[13.5px] outline-none focus-visible:border-blue-500/30 focus-visible:bg-card focus-visible:ring-4 focus-visible:ring-blue-500/10"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </Field>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-2 border-t border-sky-100 bg-white px-5 py-4">
              <Button variant="outline" disabled={saving} onClick={() => setModalOpen(false)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void submitForm()}>
                <Check className="size-4" />
                {saving ? "Saving…" : editing ? "Save changes" : "Add Team Member"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
