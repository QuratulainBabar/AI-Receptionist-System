import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Lock, MessageSquareText, Save, UserRound } from "lucide-react";
import { Button, EmptyNote, Field, Input } from "@/components/ui/primitives";
import { Switch } from "@/components/ui/switch";
import {
  authApi,
  doctorProfileApi,
  doctorSettingsApi,
  formatApiError,
  type SmsPreferences,
} from "@/lib/api";
import { patchSession } from "@/lib/session";

export const Route = createFileRoute("/doctor/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Doctor portal" },
      { name: "description", content: "Manage your account, SMS notifications, and password." },
    ],
  }),
  component: DoctorSettingsPage,
});

type Tab = "general" | "notifications" | "security";

const SMS_OPTIONS: { key: keyof SmsPreferences; title: string; description: string }[] = [
  {
    key: "appointmentReminders",
    title: "Appointment reminders",
    description: "Text patients 3 days, 24 hours, and 6 hours before a confirmed visit.",
  },
  {
    key: "appointmentConfirmations",
    title: "Appointment confirmations",
    description: "Text the patient when you schedule and confirm a next visit.",
  },
  {
    key: "invoiceLinks",
    title: "Invoice payment links",
    description: "Text a secure payment link when you send an appointment invoice.",
  },
  {
    key: "recordUploads",
    title: "Medical record uploads",
    description: "Text the patient a secure link when you request medical records.",
  },
];

const DEFAULT_SMS: SmsPreferences = {
  appointmentReminders: true,
  appointmentConfirmations: true,
  invoiceLinks: true,
  recordUploads: true,
};

function DoctorSettingsPage() {
  const [tab, setTab] = useState<Tab>("general");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  const [sms, setSms] = useState<SmsPreferences>(DEFAULT_SMS);
  const [savingSms, setSavingSms] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [profileResult, smsResult] = await Promise.all([
          doctorProfileApi.get(),
          doctorSettingsApi.getSmsPreferences(),
        ]);
        if (cancelled) return;
        const profile = profileResult.profile;
        setFullName(profile.fullName || "");
        setEmail(profile.email || "");
        setPhone(profile.phone || "");
        setIsActive(profile.isActive !== false);
        setSms(smsResult.preferences);
      } catch (err) {
        if (!cancelled) setError(formatApiError(err, "Unable to load settings."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveProfile() {
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
    setSavingProfile(true);
    try {
      const result = await doctorProfileApi.update({ fullName: name, phone: phone.trim() });
      setFullName(result.profile.fullName);
      setPhone(result.profile.phone || "");
      setEmail(result.profile.email);
      setIsActive(result.profile.isActive !== false);
      patchSession({ name: result.profile.fullName });
      window.dispatchEvent(new Event("session-updated"));
      setNotice("Profile settings saved.");
    } catch (err) {
      setError(formatApiError(err, "Unable to save profile settings."));
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveSms() {
    setNotice("");
    setError("");
    setSavingSms(true);
    try {
      const result = await doctorSettingsApi.updateSmsPreferences(sms);
      setSms(result.preferences);
      setNotice(result.message || "SMS notification settings saved.");
    } catch (err) {
      setError(formatApiError(err, "Unable to save SMS settings."));
    } finally {
      setSavingSms(false);
    }
  }

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
    setSavingPassword(true);
    try {
      const result = await authApi.changePassword({ currentPassword, newPassword });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setNotice(result.message || "Password updated.");
    } catch (err) {
      setError(formatApiError(err, "Unable to update password."));
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6">
        <h1 className="font-jakarta text-[clamp(1.6rem,2.4vw,2rem)] font-extrabold tracking-tight text-foreground">
          Settings
        </h1>
        <p className="mt-1.5 text-[14.5px] text-muted-foreground">
          Manage your account, SMS notifications, and password.
        </p>
      </header>

      <div className="mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-border/80 bg-card p-1.5 shadow-sm scrollbar-thin">
        {(
          [
            ["general", "General"],
            ["notifications", "Notifications"],
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
            className={`shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-bold transition-colors sm:px-4 sm:text-[13.5px] ${
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

      {loading ? (
        <EmptyNote>Loading settings…</EmptyNote>
      ) : tab === "general" ? (
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <UserRound className="size-5" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-foreground">User profile</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Your account details. Email and status are managed by the clinic and cannot be changed here.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" required>
              <Input
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                autoComplete="name"
                className="!h-11 !rounded-xl"
              />
            </Field>
            <Field label="Email">
              <Input value={email} readOnly className="!h-11 !rounded-xl bg-muted/40" />
            </Field>
            <Field label="Phone" hint="Optional contact number. Leave blank if you do not want one on file.">
              <Input
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. +1 555 010 1234"
                autoComplete="tel"
                className="!h-11 !rounded-xl"
              />
            </Field>
            <Field label="Status">
              <Input
                value={isActive ? "ACTIVE" : "INACTIVE"}
                readOnly
                className="!h-11 !rounded-xl bg-muted/40"
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={() => void saveProfile()} disabled={savingProfile} className="rounded-xl">
              <Save className="size-4" strokeWidth={2.2} />
              {savingProfile ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </section>
      ) : tab === "notifications" ? (
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <MessageSquareText className="size-5" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-foreground">SMS notifications</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                SMS is the clinic messaging channel. These switches control the texts this system already sends to patients.
              </p>
            </div>
          </div>
          <div className="divide-y divide-border/80 rounded-xl border border-border/70">
            {SMS_OPTIONS.map((option) => (
              <label
                key={option.key}
                className="flex items-center justify-between gap-4 px-4 py-3.5"
              >
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold text-foreground">{option.title}</span>
                  <span className="mt-0.5 block text-[12.5px] leading-relaxed text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                <Switch
                  checked={sms[option.key]}
                  onCheckedChange={(checked) => setSms((current) => ({ ...current, [option.key]: checked }))}
                  aria-label={option.title}
                />
              </label>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={() => void saveSms()} disabled={savingSms} className="rounded-xl">
              <Save className="size-4" strokeWidth={2.2} />
              {savingSms ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Lock className="size-5" strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-[16px] font-bold tracking-tight text-foreground">Change password</h2>
              <p className="mt-0.5 text-[13px] text-muted-foreground">
                Update the password you use to sign in. Use at least 8 characters.
              </p>
            </div>
          </div>
          <div className="grid max-w-xl gap-4">
            <Field label="Current password" required>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                className="!h-11 !rounded-xl"
              />
            </Field>
            <Field label="New password" required>
              <Input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                className="!h-11 !rounded-xl"
              />
            </Field>
            <Field label="Confirm new password" required>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                className="!h-11 !rounded-xl"
              />
            </Field>
          </div>
          <div className="mt-5 flex justify-end">
            <Button type="button" onClick={() => void savePassword()} disabled={savingPassword} className="rounded-xl">
              <Save className="size-4" strokeWidth={2.2} />
              {savingPassword ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
