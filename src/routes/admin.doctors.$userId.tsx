import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Badge,
  Button,
  EmptyNote,
  Field,
  Input,
  PageHeader,
  Panel,
  SectionLabel,
  Textarea,
} from "@/components/ui/primitives";
import {
  adminApi,
  doctorsApi,
  formatApiError,
  type ApiAdminDoctorSlot,
  type ApiDoctorProfile,
  type ApiSpecialty,
  type ApiSubscription,
  type ApiUser,
  type ApiWeeklyHourSlot,
} from "@/lib/api";

export const Route = createFileRoute("/admin/doctors/$userId")({
  head: () => ({
    meta: [{ title: "Doctor CRM — Super Admin" }],
  }),
  component: AdminDoctorDetails,
});

const CONSULTATION_TYPES = ["In clinic", "Video call", "Both"] as const;

type FormState = {
  specialtyId: string;
  subSpecialty: string;
  qualifications: string;
  certifications: string;
  experienceYears: string;
  about: string;
  areasOfExpertise: string;
  clinic: string;
  fee: string;
  consultationType: string;
  languages: string;
  location: string;
  weeklyHours: ApiWeeklyHourSlot[];
  verificationNote: string;
};

function listToLines(values: string[] | undefined) {
  return (values ?? []).join("\n");
}

function linesToList(value: string) {
  return value
    .split(/[\n,;|]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function profileToForm(profile: ApiDoctorProfile): FormState {
  return {
    specialtyId: profile.specialtyId,
    subSpecialty: profile.subSpecialty || "",
    qualifications: listToLines(profile.qualifications),
    certifications: listToLines(profile.certifications),
    experienceYears: String(profile.experienceYears ?? 0),
    about: profile.about || "",
    areasOfExpertise: listToLines(profile.areasOfExpertise),
    clinic: profile.clinic || "",
    fee: profile.fee || "",
    consultationType: profile.consultationType || "In clinic",
    languages: listToLines(profile.languages),
    location: profile.location || "",
    weeklyHours: profile.weeklyHours || [],
    verificationNote: profile.verificationNote || "",
  };
}

function AdminDoctorDetails() {
  const { userId } = Route.useParams();
  const [user, setUser] = useState<ApiUser | null>(null);
  const [profile, setProfile] = useState<ApiDoctorProfile | null>(null);
  const [subscription, setSubscription] = useState<ApiSubscription | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [specialties, setSpecialties] = useState<ApiSpecialty[]>([]);
  const [openSlots, setOpenSlots] = useState<ApiAdminDoctorSlot[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [crm, specialtyResult, slotsResult] = await Promise.all([
        adminApi.getDoctorCrm(userId),
        doctorsApi.listSpecialties().catch(() => ({ specialties: [] as ApiSpecialty[] })),
        adminApi.listDoctorOpenSlots(userId).catch(() => ({ slots: [] as ApiAdminDoctorSlot[] })),
      ]);
      setUser(crm.user);
      setProfile(crm.profile);
      setSubscription(crm.subscription);
      setForm(crm.profile ? profileToForm(crm.profile) : null);
      setSpecialties(specialtyResult.specialties);
      setOpenSlots(slotsResult.slots);
    } catch (err) {
      setError(formatApiError(err, "Unable to load doctor CRM."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [userId]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSuccess("");
  }

  async function toggleAccountStatus() {
    if (!user) return;
    try {
      const result = await adminApi.setStatus(user.id, !user.isActive);
      setUser(result.user);
      setSuccess(result.user.isActive ? "Doctor account activated." : "Doctor account deactivated.");
    } catch (err) {
      setError(formatApiError(err, "Unable to update account status."));
    }
  }

  async function saveCrm() {
    if (!form) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const years = Number(form.experienceYears);
      if (!Number.isFinite(years) || years < 0 || years > 80) {
        setError("Enter years of experience between 0 and 80.");
        return;
      }
      const result = await adminApi.updateDoctorCrm(userId, {
        specialtyId: form.specialtyId,
        subSpecialty: form.subSpecialty.trim(),
        qualifications: linesToList(form.qualifications),
        certifications: linesToList(form.certifications),
        experienceYears: Math.floor(years),
        about: form.about.trim(),
        areasOfExpertise: linesToList(form.areasOfExpertise),
        clinic: form.clinic.trim(),
        fee: form.fee.trim(),
        consultationType: form.consultationType,
        languages: linesToList(form.languages),
        location: form.location.trim(),
        weeklyHours: form.weeklyHours,
      });
      setUser(result.user);
      setProfile(result.profile);
      setForm(result.profile ? profileToForm(result.profile) : null);
      setSuccess(result.message || "Doctor CRM profile saved and synced to the phone AI.");
      const slotsResult = await adminApi.listDoctorOpenSlots(userId).catch(() => ({ slots: [] }));
      setOpenSlots(slotsResult.slots);
    } catch (err) {
      setError(formatApiError(err, "Unable to save doctor CRM profile."));
    } finally {
      setSaving(false);
    }
  }

  async function generateBookableSlots() {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await adminApi.generateDoctorSlots(userId, 2);
      const slotsResult = await adminApi.listDoctorOpenSlots(userId);
      setOpenSlots(slotsResult.slots);
      setSuccess(result.message || `Created ${result.created} bookable slots.`);
    } catch (err) {
      setError(formatApiError(err, "Unable to generate bookable slots from weekly hours."));
    } finally {
      setSaving(false);
    }
  }

  async function setVerification(isVerified: boolean) {
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const result = await adminApi.setDoctorVerification(
        userId,
        isVerified,
        form?.verificationNote?.trim() || "",
      );
      setUser(result.user);
      setProfile(result.profile);
      setForm(result.profile ? profileToForm(result.profile) : null);
      setSuccess(result.message || (isVerified ? "Doctor verified." : "Verification removed."));
    } catch (err) {
      setError(formatApiError(err, "Unable to update verification."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Doctor CRM"
        title={user?.fullName ?? "Doctor details"}
        description={
          user
            ? `${user.reference} · ${user.email}`
            : "Account, clinical profile, and Synthflow verification."
        }
        actions={
          <>
            <Link to="/admin/doctors">
              <Button variant="outline">Back to list</Button>
            </Link>
            {user ? (
              <Button variant={user.isActive ? "danger" : "primary"} onClick={() => void toggleAccountStatus()}>
                {user.isActive ? "Deactivate account" : "Activate account"}
              </Button>
            ) : null}
          </>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-primary">{success}</p> : null}
      {loading ? <EmptyNote>Loading doctor CRM…</EmptyNote> : null}

      {user ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Panel className="p-4">
            <SectionLabel>Account</SectionLabel>
            <dl className="mt-3 space-y-2 text-[13px]">
              <div className="flex justify-between gap-2 border-b border-border pb-2">
                <dt className="text-muted-foreground">Full name</dt>
                <dd className="font-medium">{user.fullName}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border pb-2">
                <dt className="text-muted-foreground">Email</dt>
                <dd>{user.email}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border pb-2">
                <dt className="text-muted-foreground">Reference</dt>
                <dd className="font-mono text-[11px]">{user.reference}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">Portal access</dt>
                <dd>
                  <Badge tone={user.isActive ? "success" : "destructive"}>
                    {user.isActive ? "Active" : "Inactive"}
                  </Badge>
                </dd>
              </div>
            </dl>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Subscription</SectionLabel>
            {subscription ? (
              <dl className="mt-3 space-y-2 text-[13px]">
                <div className="flex justify-between gap-2 border-b border-border pb-2">
                  <dt className="text-muted-foreground">Plan</dt>
                  <dd className="font-medium">{subscription.planName}</dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border pb-2">
                  <dt className="text-muted-foreground">Amount</dt>
                  <dd>
                    {subscription.amountLabel} / {subscription.billingCycleLabel.toLowerCase()}
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border pb-2">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <Badge tone={subscription.status === "ACTIVE" || subscription.status === "TRIALING" ? "success" : "warning"}>
                      {subscription.statusLabel}
                    </Badge>
                  </dd>
                </div>
                <div className="flex justify-between gap-2 border-b border-border pb-2">
                  <dt className="text-muted-foreground">Start date</dt>
                  <dd>
                    {subscription.currentPeriodStart
                      ? new Date(subscription.currentPeriodStart).toLocaleDateString()
                      : "—"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted-foreground">Next billing</dt>
                  <dd>
                    {subscription.currentPeriodEnd
                      ? new Date(subscription.currentPeriodEnd).toLocaleDateString()
                      : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No Stripe subscription on this doctor yet.</p>
            )}
            <Link to="/admin/subscriptions">
              <Button variant="outline" size="sm" className="mt-3">
                Manage subscriptions
              </Button>
            </Link>
          </Panel>

          <Panel className="space-y-3 p-4">
            <SectionLabel>Verification (Synthflow)</SectionLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={profile?.isVerified ? "success" : "warning"}>
                {profile?.isVerified ? "Verified for phone AI" : "Not verified"}
              </Badge>
              {profile?.verifiedAt ? (
                <span className="text-xs text-muted-foreground">
                  Since {new Date(profile.verifiedAt).toLocaleString()}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Verification is a CRM flag. Active doctors are included in the Synthflow directory when Super Admin syncs.
            </p>
            {form ? (
              <Field label="Verification note">
                <Textarea
                  rows={2}
                  value={form.verificationNote}
                  onChange={(e) => updateField("verificationNote", e.target.value)}
                  placeholder="Optional note for CRM audit"
                />
              </Field>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={saving || Boolean(profile?.isVerified)}
                onClick={() => void setVerification(true)}
              >
                Verify doctor
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!profile || saving || !profile.isVerified}
                onClick={() => void setVerification(false)}
              >
                Remove verification
              </Button>
            </div>
          </Panel>
        </div>
      ) : null}

      {!loading && !profile ? (
        <EmptyNote>
          Creating a clinical profile for this doctor. Refresh if the form does not appear.
        </EmptyNote>
      ) : null}

      {form && profile ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionLabel>Clinical CRM profile</SectionLabel>
            <Button onClick={() => void saveCrm()} disabled={saving}>
              {saving ? "Saving…" : "Save CRM profile"}
            </Button>
          </div>

          <Panel className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Specialty">
              <select
                className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
                value={form.specialtyId}
                onChange={(e) => updateField("specialtyId", e.target.value)}
              >
                {specialties.map((specialty) => (
                  <option key={specialty.id} value={specialty.id}>
                    {specialty.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Sub-specialty">
              <Input
                value={form.subSpecialty}
                onChange={(e) => updateField("subSpecialty", e.target.value)}
              />
            </Field>
            <Field label="Years of experience">
              <Input
                type="number"
                min={0}
                max={80}
                value={form.experienceYears}
                onChange={(e) => updateField("experienceYears", e.target.value)}
              />
            </Field>
            <Field label="Consultation type">
              <select
                className="h-11 w-full rounded-xl border border-transparent bg-input-fill px-3.5 text-sm"
                value={form.consultationType}
                onChange={(e) => updateField("consultationType", e.target.value)}
              >
                {CONSULTATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hospital name">
              <Input value={form.clinic} onChange={(e) => updateField("clinic", e.target.value)} />
            </Field>
            <Field label="Consultation fee">
              <Input value={form.fee} onChange={(e) => updateField("fee", e.target.value)} />
            </Field>
            <Field label="Location">
              <Input value={form.location} onChange={(e) => updateField("location", e.target.value)} />
            </Field>
            <Field label="Spoken languages">
              <Input value={form.languages} onChange={(e) => updateField("languages", e.target.value)} />
            </Field>
            <Field label="Qualifications">
              <Textarea
                rows={3}
                value={form.qualifications}
                onChange={(e) => updateField("qualifications", e.target.value)}
              />
            </Field>
            <Field label="Certifications">
              <Textarea
                rows={3}
                value={form.certifications}
                onChange={(e) => updateField("certifications", e.target.value)}
              />
            </Field>
            <Field label="Areas of expertise">
              <Textarea
                rows={3}
                value={form.areasOfExpertise}
                onChange={(e) => updateField("areasOfExpertise", e.target.value)}
              />
            </Field>
            <Field label="Professional bio">
              <Textarea rows={3} value={form.about} onChange={(e) => updateField("about", e.target.value)} />
            </Field>
          </Panel>

          <Panel className="p-4">
            <SectionLabel>Weekly hours template</SectionLabel>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p className="mt-1 text-xs text-muted-foreground">
                {profile.weeklyHoursSummary || "No weekly hours set"}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                onClick={() => void generateBookableSlots()}
              >
                Generate bookable slots
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Phone AI books from generated 30-minute slots, not the weekly template alone. Save CRM
              or generate slots after changing hours.
            </p>
            {openSlots.length ? (
              <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                {openSlots.slice(0, 8).map((slot) => (
                  <li key={slot.id}>
                    {slot.date} · {slot.time}
                  </li>
                ))}
                {openSlots.length > 8 ? <li>+{openSlots.length - 8} more open slots</li> : null}
              </ul>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">No bookable slots yet — generate them for the phone AI.</p>
            )}
            <div className="mt-3 space-y-2">
              {form.weeklyHours.map((slot) => (
                <div
                  key={slot.day}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl border border-border/70 px-3 py-2"
                >
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={slot.enabled}
                      onChange={(e) =>
                        updateField(
                          "weeklyHours",
                          form.weeklyHours.map((row) =>
                            row.day === slot.day ? { ...row, enabled: e.target.checked } : row,
                          ),
                        )
                      }
                    />
                    {slot.day}
                  </label>
                  <Input
                    type="time"
                    className="h-9 w-[7.5rem]"
                    disabled={!slot.enabled}
                    value={slot.startTime}
                    onChange={(e) =>
                      updateField(
                        "weeklyHours",
                        form.weeklyHours.map((row) =>
                          row.day === slot.day ? { ...row, startTime: e.target.value } : row,
                        ),
                      )
                    }
                  />
                  <Input
                    type="time"
                    className="h-9 w-[7.5rem]"
                    disabled={!slot.enabled}
                    value={slot.endTime}
                    onChange={(e) =>
                      updateField(
                        "weeklyHours",
                        form.weeklyHours.map((row) =>
                          row.day === slot.day ? { ...row, endTime: e.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </Panel>
        </div>
      ) : null}
    </>
  );
}
