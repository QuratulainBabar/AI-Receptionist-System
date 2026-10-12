import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Badge,
  Button,
  EmptyNote,
  Field,
  Input,
  Panel,
} from "@/components/ui/primitives";
import {
  adminApi,
  authApi,
  formatApiError,
  getApiBaseUrl,
  type ApiUser,
} from "@/lib/api";
import { patchSession } from "@/lib/session";
import {
  Camera,
  Info,
  Lock,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  Save,
  Search,
  Shield,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from "lucide-react";

function photoSrc(photoUrl: string | undefined | null) {
  const value = (photoUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("blob:")) {
    return value;
  }
  return `${getApiBaseUrl()}${value.startsWith("/") ? value : `/${value}`}`;
}

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [{ title: "Settings — Super Admin" }],
  }),
  component: AdminSettingsPage,
});

type Tab = "general" | "notifications" | "users" | "security";

const SMS_CAPABILITIES = [
  {
    title: "Appointment reminders",
    description:
      "Clinic SMS reminders before a confirmed visit when the doctor enables this in their Settings.",
  },
  {
    title: "Appointment confirmations",
    description:
      "SMS when a visit is scheduled or confirmed, controlled in each doctor's Settings.",
  },
  {
    title: "Invoice payment links",
    description:
      "Doctors can text a secure payment link when sending an appointment invoice.",
  },
  {
    title: "Medical record uploads",
    description:
      "Doctors can text a secure upload link when requesting medical records.",
  },
];

function AdminSettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-6">
        <h1
          className="font-jakarta font-extrabold tracking-tight text-foreground"
          style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)", letterSpacing: "-0.03em" }}
        >
          Settings
        </h1>
        <p className="mt-2.5 max-w-2xl text-[14.5px] leading-relaxed" style={{ color: "#64748B" }}>
          Manage your Super Admin profile, review SMS capabilities, system users, and password security.
        </p>
      </header>

      <div className="mb-6 inline-flex max-w-full flex-wrap gap-1 rounded-2xl border border-border/80 bg-card p-1.5 shadow-sm">
        {(
          [
            ["general", "General"],
            ["notifications", "Notifications"],
            ["users", "Users & Roles"],
            ["security", "Security"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setTab(id);
              setNotice("");
              setError("");
            }}
            className={`rounded-xl px-4 py-2 text-[13.5px] font-bold transition-colors ${
              tab === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="mb-4 rounded-xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-sm text-rose-700">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
          {notice}
        </p>
      ) : null}

      {tab === "general" ? (
        <GeneralTab setError={setError} setNotice={setNotice} />
      ) : null}
      {tab === "notifications" ? <NotificationsTab /> : null}
      {tab === "users" ? (
        <UsersTab setError={setError} setNotice={setNotice} />
      ) : null}
      {tab === "security" ? (
        <SecurityTab setError={setError} setNotice={setNotice} />
      ) : null}
    </div>
  );
}

function GeneralTab({
  setError,
  setNotice,
}: {
  setError: (v: string) => void;
  setNotice: (v: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [localPreview, setLocalPreview] = useState("");
  const [statusLabel, setStatusLabel] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const result = await adminApi.getSettingsProfile();
        if (cancelled) return;
        const user = result.user;
        setFullName(user.fullName || "");
        setEmail(user.email || "");
        setPhone(user.phone || "");
        setPhotoUrl(user.photoUrl || "");
        setLocalPreview("");
        setStatusLabel(user.isActive ? "ACTIVE" : "INACTIVE");
        setRoleLabel(user.systemRoleLabel || "Super Admin");
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load profile."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [setError]);

  async function save() {
    setNotice("");
    setError("");
    const name = fullName.trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      setError("Full name must be at least 2 characters.");
      return;
    }
    if (phone.trim() && phone.replace(/\D/g, "").length < 10) {
      setError("Phone number must include at least 10 digits, or leave it blank.");
      return;
    }
    setSaving(true);
    try {
      const result = await adminApi.updateSettingsProfile({
        fullName: name,
        phone: phone.trim(),
      });
      setFullName(result.user.fullName);
      setPhone(result.user.phone || "");
      setEmail(result.user.email);
      setPhotoUrl(result.user.photoUrl || "");
      setStatusLabel(result.user.isActive ? "ACTIVE" : "INACTIVE");
      patchSession({ name: result.user.fullName });
      window.dispatchEvent(new Event("session-updated"));
      setNotice(result.message || "Profile settings saved.");
    } catch (err) {
      setError(formatApiError(err, "Unable to save profile."));
    } finally {
      setSaving(false);
    }
  }

  async function onPhotoSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Profile photo must be 5 MB or smaller.");
      return;
    }
    setPhotoBusy(true);
    setError("");
    setNotice("");
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    try {
      const result = await adminApi.uploadSettingsPhoto(file);
      setPhotoUrl(result.user.photoUrl || "");
      setLocalPreview("");
      setNotice(result.message || "Profile photo updated.");
      window.dispatchEvent(new Event("session-updated"));
    } catch (err) {
      setLocalPreview("");
      setError(formatApiError(err, "Unable to upload profile photo."));
    } finally {
      URL.revokeObjectURL(preview);
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!photoUrl && !localPreview) return;
    if (!window.confirm("Remove your profile photo?")) return;
    setPhotoBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await adminApi.removeSettingsPhoto();
      setPhotoUrl(result.user.photoUrl || "");
      setLocalPreview("");
      setNotice(result.message || "Profile photo removed.");
      window.dispatchEvent(new Event("session-updated"));
    } catch (err) {
      setError(formatApiError(err, "Unable to remove profile photo."));
    } finally {
      setPhotoBusy(false);
    }
  }

  if (loading) return <EmptyNote>Loading profile…</EmptyNote>;

  const previewUrl = localPreview || photoSrc(photoUrl);

  return (
    <Panel className="p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="relative shrink-0">
          <div className="grid size-20 place-items-center overflow-hidden rounded-2xl border border-border bg-primary/10 text-primary">
            {previewUrl ? (
              <img src={previewUrl} alt={fullName || "Super Admin"} className="size-full object-cover" />
            ) : (
              <UserRound className="size-9" strokeWidth={2.2} />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={photoBusy}
            className="absolute -bottom-1.5 -right-1.5 grid size-8 place-items-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:bg-secondary"
            aria-label="Upload profile photo"
          >
            <Camera className="size-3.5" strokeWidth={2} />
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => void onPhotoSelected(e)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[16px] font-bold tracking-tight text-foreground">User profile</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Your Super Admin account. Email and role cannot be changed here.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={photoBusy}
              onClick={() => fileRef.current?.click()}
              className="rounded-xl gap-2"
            >
              <Upload className="size-3.5" strokeWidth={2} />
              {previewUrl ? "Change photo" : "Upload photo"}
            </Button>
            {previewUrl ? (
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={photoBusy}
                onClick={() => void removePhoto()}
                className="rounded-xl gap-2"
              >
                <Trash2 className="size-3.5" strokeWidth={2} />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoComplete="name"
            className="!h-11 !rounded-xl"
          />
        </Field>
        <Field label="Email">
          <Input value={email} readOnly className="!h-11 !rounded-xl bg-muted/40" />
        </Field>
        <Field label="Phone" hint="Optional contact number for this admin account.">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="e.g. +1 555 010 1234"
            autoComplete="tel"
            className="!h-11 !rounded-xl"
          />
        </Field>
        <Field label="Status">
          <Input value={`${roleLabel} · ${statusLabel}`} readOnly className="!h-11 !rounded-xl bg-muted/40" />
        </Field>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={saving || photoBusy} className="rounded-xl gap-2">
          <Save className="size-4" strokeWidth={2.2} />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </Panel>
  );
}

function NotificationsTab() {
  return (
    <Panel className="p-5 sm:p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <MessageSquareText className="size-5" strokeWidth={2.2} />
        </span>
        <div>
          <h2 className="text-[16px] font-bold tracking-tight text-foreground">SMS notifications</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            This platform uses SMS for clinic messaging. Preferences are configured by each doctor in their
            Settings — not as a global Super Admin switch.
          </p>
        </div>
      </div>

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-blue-200/70 bg-blue-50/70 px-4 py-3 text-[13px] text-blue-900">
        <Info className="mt-0.5 size-4 shrink-0" strokeWidth={2.2} />
        <span>
          Email and browser push notifications are not part of this system. Missed-call SMS alerts are not
          implemented as a configurable preference. The events below are the SMS capabilities already wired
          into clinic workflows.
        </span>
      </div>

      <div className="divide-y divide-border/80 rounded-xl border border-border/70">
        {SMS_CAPABILITIES.map((item) => (
          <div key={item.title} className="px-4 py-3.5">
            <p className="text-[14px] font-semibold text-foreground">{item.title}</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">{item.description}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function UsersTab({
  setError,
  setNotice,
}: {
  setError: (v: string) => void;
  setNotice: (v: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ApiUser[]>([]);
  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [role, setRole] = useState<"all" | "doctor" | "clinic_staff" | "admin">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    password: "",
    role: "doctor" as "doctor",
  });

  const load = useCallback(
    async (nextQ = appliedQ, nextStatus = status, nextRole = role) => {
      setLoading(true);
      setError("");
      try {
        const result = await adminApi.listSystemUsers({
          q: nextQ || undefined,
          status: nextStatus,
          role: nextRole === "all" ? "all" : nextRole,
        });
        setUsers(result.users.filter((user) => user.systemRole !== "PATIENT"));
      } catch (err) {
        setError(formatApiError(err, "Unable to load system users."));
      } finally {
        setLoading(false);
      }
    },
    [appliedQ, status, role, setError],
  );

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(user: ApiUser) {
    if (user.systemRole === "SUPER_ADMIN") {
      setError("Super Admin accounts cannot be activated or deactivated from here.");
      return;
    }
    setNotice("");
    setError("");
    try {
      await adminApi.setStatus(user.id, !user.isActive);
      setNotice(
        user.isActive
          ? `${user.fullName} deactivated.`
          : `${user.fullName} activated.`,
      );
      await load();
    } catch (err) {
      setError(formatApiError(err, "Unable to update account status."));
    }
  }

  async function createUser() {
    setNotice("");
    setError("");
    if (form.fullName.trim().length < 2) {
      setError("Full name must be at least 2 characters.");
      return;
    }
    if (!form.email.trim()) {
      setError("Email is required.");
      return;
    }
    if (form.password.length < 8) {
      setError("Initial password must be at least 8 characters.");
      return;
    }
    setCreating(true);
    try {
      const result = await adminApi.createSystemUser({
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        role: form.role,
      });
      setNotice(result.message || "Account created.");
      setCreateOpen(false);
      setForm({ fullName: "", email: "", password: "", role: "doctor" });
      await load();
    } catch (err) {
      setError(formatApiError(err, "Unable to create account."));
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Panel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Users className="size-5" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-foreground">System users</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Manage doctors, clinic staff, and Super Admin accounts.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="rounded-xl gap-2"
            onClick={() => {
              setCreateOpen(true);
              setError("");
              setNotice("");
            }}
          >
            <Plus className="size-4" strokeWidth={2.2} />
            New user
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setAppliedQ(q.trim());
                }
              }}
              placeholder="Search users by name or email"
              className="h-10 rounded-xl pl-9"
            />
          </div>
          <select
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
          >
            <option value="all">All roles</option>
            <option value="doctor">Doctor</option>
            <option value="clinic_staff">Clinic Staff</option>
            <option value="admin">Super Admin</option>
          </select>
          <select
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
            value={status}
            onChange={(e) => setStatus(e.target.value as typeof status)}
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <Button
            type="button"
            variant="outline"
            className="rounded-xl"
            onClick={() => setAppliedQ(q.trim())}
          >
            Search
          </Button>
        </div>

        {loading ? (
          <div className="p-5">
            <EmptyNote>Loading users…</EmptyNote>
          </div>
        ) : users.length === 0 ? (
          <div className="p-5">
            <EmptyNote>No users match this filter.</EmptyNote>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {users.map((user) => {
              const isAdmin = user.systemRole === "SUPER_ADMIN";
              return (
                <li
                  key={user.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                      <Shield className="size-4.5" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-slate-900">{user.fullName}</p>
                        <Badge
                          className={
                            isAdmin
                              ? "bg-blue-50 text-blue-700"
                              : user.systemRole === "DOCTOR"
                                ? "bg-violet-50 text-violet-700"
                                : user.systemRole === "CLINIC_STAFF"
                                  ? "bg-amber-50 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                          }
                        >
                          {user.systemRoleLabel || user.role}
                        </Badge>
                        <Badge
                          className={
                            user.isActive ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                          }
                        >
                          {user.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-[13px] text-slate-500">{user.email}</p>
                      <p className="text-[12px] text-slate-400">
                        {user.reference}
                        {user.phone ? ` · ${user.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin ? (
                      <span className="text-[12px] font-semibold text-slate-400">Protected</span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-xl gap-1.5"
                        onClick={() => void toggleActive(user)}
                      >
                        {user.isActive ? (
                          <>
                            <Pause className="size-3.5" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <Play className="size-3.5" />
                            Activate
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-jakarta text-lg font-bold text-slate-900">Create account</h3>
                <p className="mt-1 text-[13px] text-slate-500">
                  Create a doctor login. Clinic staff are invited from a doctor&apos;s Team Members page.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="grid gap-3">
              <Field label="Email address" required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Initial password" required>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Full name" required>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                  placeholder="Jane Doe"
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="System role" required>
                <select
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  value={form.role}
                  onChange={() => setForm((f) => ({ ...f, role: "doctor" }))}
                >
                  <option value="doctor">Doctor</option>
                </select>
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-xl" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl"
                disabled={creating}
                onClick={() => void createUser()}
              >
                {creating ? "Creating…" : "Create account"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function SecurityTab({
  setError,
  setNotice,
}: {
  setError: (v: string) => void;
  setNotice: (v: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function savePassword() {
    setNotice("");
    setError("");
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }
    setSaving(true);
    try {
      const result = await authApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(result.message || "Password updated.");
    } catch (err) {
      setError(formatApiError(err, "Unable to update password."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <Panel className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Lock className="size-5" strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-[16px] font-bold tracking-tight text-foreground">Change password</h2>
            <p className="mt-0.5 text-[13px] text-muted-foreground">
              Update the password for this Super Admin account. Use at least 8 characters.
            </p>
          </div>
        </div>
        <div className="grid max-w-xl gap-4">
          <Field label="Current password" required>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              className="!h-11 !rounded-xl"
            />
          </Field>
          <Field label="New password" required>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="!h-11 !rounded-xl"
            />
          </Field>
          <Field label="Confirm new password" required>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="!h-11 !rounded-xl"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={() => void savePassword()} disabled={saving} className="rounded-xl gap-2">
            <Save className="size-4" strokeWidth={2.2} />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Panel>

      <Panel className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
            <Info className="size-5" strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-[16px] font-bold tracking-tight text-foreground">Other security controls</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
              Two-factor authentication, configurable session timeouts, and audit logs are not implemented in
              this application yet. Session lifetime is fixed by the server JWT configuration and cannot be
              changed from this page.
            </p>
          </div>
        </div>
      </Panel>
    </div>
  );
}
