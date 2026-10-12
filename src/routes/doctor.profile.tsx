import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Button,
  EmptyNote,
  Field,
  Input,
  PageHeader,
  Panel,
} from "@/components/ui/primitives";
import {
  doctorProfileApi,
  formatApiError,
  getApiBaseUrl,
  type ApiDoctorProfile,
} from "@/lib/api";
import { patchSession } from "@/lib/session";
import { cn } from "@/lib/utils";
import { Camera, Pencil, Trash2, Upload, UserRound } from "lucide-react";

export const Route = createFileRoute("/doctor/profile")({
  validateSearch: (search: Record<string, unknown>) => ({
    setup: search.setup === "1" || search.setup === 1 || search.setup === true ? ("1" as const) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "My profile — Doctor portal" },
      {
        name: "description",
        content:
          "Manage your professional profile for the clinic dashboard and AI phone receptionist.",
      },
    ],
  }),
  component: DoctorProfilePage,
});

const CONSULTATION_OPTIONS = [
  { value: "Video call", label: "Online" },
] as const;

type FormState = {
  fullName: string;
  phone: string;
  specialty: string;
  experienceYears: string;
  clinic: string;
  fee: string;
  consultationType: string;
};

function profileToForm(profile: ApiDoctorProfile): FormState {
  const incomplete = !profile.clinic?.trim() && !profile.fee?.trim();
  return {
    fullName: profile.fullName || "",
    phone: profile.phone || "",
    specialty: profile.specialty?.trim() || "",
    experienceYears:
      incomplete && !profile.experienceYears ? "" : String(profile.experienceYears ?? 0),
    clinic: profile.clinic || "",
    fee: profile.fee || "",
    consultationType: "Video call",
  };
}

function formsEqual(a: FormState, b: FormState) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function photoSrc(photoUrl: string | undefined | null) {
  const value = (photoUrl || "").trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("blob:")) {
    return value;
  }
  return `${getApiBaseUrl()}${value.startsWith("/") ? value : `/${value}`}`;
}

function ReadOnlyValue({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center rounded-xl border border-dashed border-border/80 bg-muted/30 px-3.5 text-[13.5px] font-medium text-foreground">
      {children || <span className="font-normal text-muted-foreground">—</span>}
    </div>
  );
}

function DoctorProfilePage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const setupMode = search.setup === "1";
  const [profile, setProfile] = useState<ApiDoctorProfile | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [savedForm, setSavedForm] = useState<FormState | null>(null);
  const [editing, setEditing] = useState(setupMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [syncNote, setSyncNote] = useState("");
  const [localPreview, setLocalPreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(() => {
    if (!form || !savedForm) return false;
    return !formsEqual(form, savedForm);
  }, [form, savedForm]);

  const applyProfile = useCallback((next: ApiDoctorProfile) => {
    const mapped = profileToForm(next);
    setProfile(next);
    setForm(mapped);
    setSavedForm(mapped);
    setLocalPreview("");
  }, []);

  useEffect(() => {
    let cancelled = false;
    void doctorProfileApi
      .get()
      .then((result) => {
        if (cancelled) return;
        applyProfile(result.profile);
        if (setupMode) setEditing(true);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err, "Unable to load doctor profile."));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applyProfile, setupMode]);

  useEffect(() => {
    if (!dirty || !editing) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty, editing]);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSuccess("");
    setSyncNote("");
  }

  function cancelEdit() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    if (savedForm) setForm(savedForm);
    setEditing(false);
    setError("");
    setSuccess("");
    setLocalPreview("");
  }

  async function saveProfile() {
    if (!form) return;
    setSaving(true);
    setError("");
    setSuccess("");
    setSyncNote("");
    try {
      if (!form.fullName.trim() || form.fullName.trim().length < 2) {
        setError("Enter your full name (at least 2 characters).");
        return;
      }
      if (!form.specialty.trim()) {
        setError("Specialty is required.");
        return;
      }
      const years =
        form.experienceYears.trim() === "" ? Number.NaN : Number(form.experienceYears);
      if (!Number.isFinite(years) || years < 0 || years > 80) {
        setError("Enter years of experience between 0 and 80.");
        return;
      }
      if (!form.clinic.trim()) {
        setError("Clinic or hospital name is required.");
        return;
      }
      if (!form.fee.trim()) {
        setError("Consultation fee is required.");
        return;
      }
      if (form.phone.trim()) {
        const digits = form.phone.replace(/\D/g, "");
        if (digits.length < 10) {
          setError("Phone number must include at least 10 digits, or leave it blank.");
          return;
        }
      }

      const result = await doctorProfileApi.update({
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        specialty: form.specialty.trim(),
        experienceYears: Math.floor(years),
        clinic: form.clinic.trim(),
        fee: form.fee.trim(),
        consultationType: form.consultationType,
      });

      applyProfile(result.profile);
      patchSession({ name: result.profile.fullName });
      window.dispatchEvent(
        new CustomEvent("doctor-specialty-updated", { detail: result.profile.specialty }),
      );
      setEditing(false);
      setSuccess(result.message || "Profile saved.");
      if (result.synthflowSynced) {
        setSyncNote("AI receptionist is using your latest saved profile.");
      } else {
        setSyncNote(
          result.warning
            ? `Saved locally. AI sync pending: ${result.warning}`
            : "Saved locally. Create or sync the AI agent from My Clinic to push this profile to callers.",
        );
      }
      // Required profile fields saved → refresh access so full dashboard modules unlock.
      window.dispatchEvent(new Event("doctor-access-refresh"));
      if (setupMode) {
        await navigate({ to: "/doctor", search: { checkout: "success" }, replace: true });
        return;
      }
    } catch (err) {
      setError(formatApiError(err, "Unable to save doctor profile."));
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
    setSuccess("");
    const preview = URL.createObjectURL(file);
    setLocalPreview(preview);
    try {
      const result = await doctorProfileApi.uploadPhoto(file);
      applyProfile(result.profile);
      setSuccess(result.message || "Profile photo updated.");
      setSyncNote(
        result.synthflowSynced
          ? "AI receptionist profile refreshed."
          : result.warning || "Photo saved. AI sync may still be pending.",
      );
    } catch (err) {
      setLocalPreview("");
      setError(formatApiError(err, "Unable to upload profile photo."));
    } finally {
      URL.revokeObjectURL(preview);
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    if (!profile?.photoUrl && !localPreview) return;
    if (!window.confirm("Remove your profile photo?")) return;
    setPhotoBusy(true);
    setError("");
    try {
      const result = await doctorProfileApi.removePhoto();
      applyProfile(result.profile);
      setSuccess(result.message || "Profile photo removed.");
    } catch (err) {
      setError(formatApiError(err, "Unable to remove profile photo."));
    } finally {
      setPhotoBusy(false);
    }
  }

  const previewUrl = localPreview || photoSrc(profile?.photoUrl);

  return (
    <>
      <PageHeader
        title={setupMode ? "Set up your profile" : "My Profile"}
        description={
          setupMode
            ? "Complete your clinic profile to open the doctor dashboard."
            : "Manage your personal, professional, and clinic details. Saved changes sync to the AI phone receptionist."
        }
        actions={
          editing ? (
            <div className="flex flex-wrap gap-2">
              {!setupMode ? (
                <Button variant="outline" onClick={cancelEdit} disabled={saving}>
                  Cancel
                </Button>
              ) : null}
              <Button onClick={() => void saveProfile()} disabled={!form || saving || loading}>
                {saving ? "Saving…" : setupMode ? "Save & open dashboard" : "Save Changes"}
              </Button>
            </div>
          ) : (
            <Button
              onClick={() => {
                setEditing(true);
                setSuccess("");
                setSyncNote("");
              }}
              disabled={!form || loading}
            >
              <Pencil className="size-3.5" strokeWidth={2.2} />
              Edit Profile
            </Button>
          )
        }
      />

      {error ? (
        <p className="mb-4 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700">
          {success}
          {syncNote ? (
            <span className="mt-1 block text-[12.5px] text-emerald-700/80">{syncNote}</span>
          ) : null}
        </p>
      ) : null}
      {!success && syncNote ? (
        <p className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-800">
          {syncNote}
        </p>
      ) : null}
      {editing && dirty ? (
        <p className="mb-4 text-[12.5px] font-medium text-amber-700">You have unsaved changes.</p>
      ) : null}

      {loading || !form || !profile ? (
        <EmptyNote>{loading ? "Loading profile…" : "Profile unavailable."}</EmptyNote>
      ) : (
        <Panel className="space-y-6 p-5 md:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div className="relative shrink-0">
              <div
                className="grid size-28 place-items-center overflow-hidden rounded-2xl border border-border bg-muted text-muted-foreground"
                style={{ boxShadow: "0 8px 24px -12px rgba(37, 99, 235, 0.35)" }}
              >
                {previewUrl ? (
                  <img src={previewUrl} alt={form.fullName} className="size-full object-cover" />
                ) : (
                  <UserRound className="size-12 opacity-50" strokeWidth={1.6} />
                )}
              </div>
              {editing ? (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoBusy}
                  className="absolute -bottom-2 -right-2 grid size-9 place-items-center rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:bg-secondary"
                  aria-label="Change profile photo"
                >
                  <Camera className="size-4" strokeWidth={2} />
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => void onPhotoSelected(e)}
              />
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <h2 className="font-sans text-[22px] font-bold tracking-tight text-foreground">
                {form.fullName || "Doctor"}
              </h2>
              <p className="text-sm text-muted-foreground">
                {form.specialty || "Specialty not set"}
                {form.clinic ? ` · ${form.clinic}` : ""}
              </p>
              {editing ? (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={photoBusy}
                    onClick={() => fileRef.current?.click()}
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
                    >
                      <Trash2 className="size-3.5" strokeWidth={2} />
                      Remove
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Full name" hint="Shown on the dashboard and to the phone AI.">
              {editing ? (
                <Input
                  value={form.fullName}
                  onChange={(e) => updateField("fullName", e.target.value)}
                  placeholder="Dr. Jane Smith"
                />
              ) : (
                <ReadOnlyValue>{form.fullName}</ReadOnlyValue>
              )}
            </Field>
            <Field label="Email" hint="Managed by your account login.">
              <ReadOnlyValue>{profile.email}</ReadOnlyValue>
            </Field>
            <Field label="Phone number" hint="Optional personal contact number.">
              {editing ? (
                <Input
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  placeholder="+1 555 0100"
                />
              ) : (
                <ReadOnlyValue>{form.phone || "Not set"}</ReadOnlyValue>
              )}
            </Field>
            <Field label="Specialty" hint="Required for the AI receptionist.">
              {editing ? (
                <Input
                  value={form.specialty}
                  onChange={(e) => updateField("specialty", e.target.value)}
                  placeholder="e.g. Cardiologist"
                />
              ) : (
                <ReadOnlyValue>{form.specialty || "Not set"}</ReadOnlyValue>
              )}
            </Field>
            <Field label="Years of experience">
              {editing ? (
                <Input
                  type="number"
                  min={0}
                  max={80}
                  value={form.experienceYears}
                  onChange={(e) => updateField("experienceYears", e.target.value)}
                  placeholder="e.g. 12"
                />
              ) : (
                <ReadOnlyValue>
                  {form.experienceYears === "" ? "Not set" : `${form.experienceYears} years`}
                </ReadOnlyValue>
              )}
            </Field>
            <Field label="Hospital / clinic name">
              {editing ? (
                <Input
                  value={form.clinic}
                  onChange={(e) => updateField("clinic", e.target.value)}
                  placeholder="Enter hospital or clinic name"
                />
              ) : (
                <ReadOnlyValue>{form.clinic || "Not set"}</ReadOnlyValue>
              )}
            </Field>
            <Field label="Consultation fee">
              {editing ? (
                <Input
                  value={form.fee}
                  onChange={(e) => updateField("fee", e.target.value)}
                  placeholder="e.g. 150"
                />
              ) : (
                <ReadOnlyValue>{form.fee || "Not set"}</ReadOnlyValue>
              )}
            </Field>
            <Field label="Consultation type">
              {editing ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {CONSULTATION_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => updateField("consultationType", option.value)}
                      className={cn(
                        "h-11 rounded-xl border text-[12.5px] font-semibold transition",
                        form.consultationType === option.value
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border bg-card text-muted-foreground hover:bg-secondary",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              ) : (
                <ReadOnlyValue>
                  {CONSULTATION_OPTIONS.find((o) => o.value === form.consultationType)?.label ||
                    form.consultationType}
                </ReadOnlyValue>
              )}
            </Field>
          </div>
        </Panel>
      )}
    </>
  );
}
