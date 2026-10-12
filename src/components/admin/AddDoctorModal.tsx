import { useEffect, useMemo, useState } from "react";
import { Button, Field, Input, Textarea } from "@/components/ui/primitives";
import {
  adminApi,
  doctorsApi,
  formatApiError,
  type ApiSpecialty,
  type ApiWeeklyHourSlot,
} from "@/lib/api";
import { ImagePlus, X } from "lucide-react";

const WEEKDAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const CONSULTATION_TYPES = ["In clinic", "Video call", "Both"] as const;

function defaultWeeklyHours(): ApiWeeklyHourSlot[] {
  return WEEKDAYS.map((day) => {
    const enabled = day !== "Saturday" && day !== "Sunday";
    return {
      day,
      enabled,
      startTime: "09:00",
      endTime: "17:00",
      sessions: [{ startTime: "09:00", endTime: "17:00" }],
    };
  });
}

function linesToList(value: string) {
  return value
    .split(/[\n,;|]+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

type FormState = {
  fullName: string;
  specialtyId: string;
  specialty: string;
  subSpecialty: string;
  phone: string;
  qualifications: string;
  certifications: string;
  experienceYears: string;
  about: string;
  areasOfExpertise: string;
  clinic: string;
  fee: string;
  consultationType: (typeof CONSULTATION_TYPES)[number];
  languages: string;
  location: string;
  email: string;
  password: string;
  isActive: boolean;
  weeklyHours: ApiWeeklyHourSlot[];
  isVerified: boolean;
  verificationNote: string;
};

const emptyForm = (): FormState => ({
  fullName: "",
  specialtyId: "",
  specialty: "",
  subSpecialty: "",
  phone: "",
  qualifications: "",
  certifications: "",
  experienceYears: "0",
  about: "",
  areasOfExpertise: "",
  clinic: "",
  fee: "",
  consultationType: "In clinic",
  languages: "English",
  location: "",
  email: "",
  password: "",
  isActive: true,
  weeklyHours: defaultWeeklyHours(),
  isVerified: false,
  verificationNote: "",
});

export function AddDoctorModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [specialties, setSpecialties] = useState<ApiSpecialty[]>([]);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(emptyForm());
    setPhotoFile(null);
    setPhotoPreview("");
    setError("");
    void doctorsApi
      .listSpecialties()
      .then((result) => setSpecialties(result.specialties))
      .catch(() => setSpecialties([]));
  }, [open]);

  useEffect(() => {
    return () => {
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const specialtyOptions = useMemo(
    () => specialties.filter((row) => row.name.toLowerCase() !== "unspecified"),
    [specialties],
  );

  if (!open) return null;

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateDay(day: string, patch: Partial<ApiWeeklyHourSlot>) {
    setForm((current) => ({
      ...current,
      weeklyHours: current.weeklyHours.map((row) => {
        if (row.day !== day) return row;
        const next = { ...row, ...patch };
        next.sessions = [{ startTime: next.startTime, endTime: next.endTime }];
        return next;
      }),
    }));
  }

  async function submit() {
    setError("");
    const fullName = form.fullName.trim().replace(/\s+/g, " ");
    if (fullName.length < 2) {
      setError("Full name is required.");
      return;
    }
    if (!form.email.trim()) {
      setError("Login email is required.");
      return;
    }
    if (form.password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (!form.specialtyId && !form.specialty.trim()) {
      setError("Select or enter a specialty.");
      return;
    }
    if (form.phone.trim() && form.phone.replace(/\D/g, "").length < 10) {
      setError("Phone number must include at least 10 digits, or leave it blank.");
      return;
    }

    setSaving(true);
    try {
      const created = await adminApi.createDoctor({
        fullName,
        email: form.email.trim().toLowerCase(),
        password: form.password,
        isActive: form.isActive,
        phone: form.phone.trim() || undefined,
        specialtyId: form.specialtyId || undefined,
        specialty: form.specialtyId ? undefined : form.specialty.trim() || undefined,
        subSpecialty: form.subSpecialty.trim() || undefined,
        qualifications: linesToList(form.qualifications),
        certifications: linesToList(form.certifications),
        experienceYears: Number(form.experienceYears) || 0,
        about: form.about.trim() || undefined,
        areasOfExpertise: linesToList(form.areasOfExpertise),
        clinic: form.clinic.trim() || undefined,
        fee: form.fee.trim() || undefined,
        consultationType: form.consultationType,
        languages: linesToList(form.languages),
        location: form.location.trim() || undefined,
        weeklyHours: form.weeklyHours,
        isVerified: form.isVerified,
        verificationNote: form.verificationNote.trim() || undefined,
      });

      if (photoFile && created.user?.id) {
        await adminApi.uploadDoctorPhoto(created.user.id, photoFile);
      }

      onCreated(created.message || `Doctor account created for ${fullName}.`);
      onClose();
    } catch (err) {
      setError(formatApiError(err, "Unable to create doctor."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/45 p-4 sm:p-6">
      <div className="my-4 w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div>
            <h2 className="font-jakarta text-lg font-bold text-slate-900">Add doctor</h2>
            <p className="mt-1 text-[13px] text-slate-500">
              Create a doctor account, profile, availability, and AI receptionist settings.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="max-h-[min(78vh,820px)] space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
          {error ? (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Doctor information
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Full name" required>
                  <Input
                    value={form.fullName}
                    onChange={(e) => setField("fullName", e.target.value)}
                    placeholder="Dr. Jane Doe"
                    className="!h-11 !rounded-xl"
                  />
                </Field>
              </div>
              <Field label="Specialty" required>
                <select
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  value={form.specialtyId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const match = specialtyOptions.find((row) => row.id === id);
                    setForm((current) => ({
                      ...current,
                      specialtyId: id,
                      specialty: match?.name || current.specialty,
                    }));
                  }}
                >
                  <option value="">Select specialty</option>
                  {specialtyOptions.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Or type specialty">
                <Input
                  value={form.specialty}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      specialty: e.target.value,
                      specialtyId: "",
                    }))
                  }
                  placeholder="e.g. Cardiology"
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Sub-specialty">
                <Input
                  value={form.subSpecialty}
                  onChange={(e) => setField("subSpecialty", e.target.value)}
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Phone number">
                <Input
                  value={form.phone}
                  onChange={(e) => setField("phone", e.target.value)}
                  placeholder="+1 555 010 1234"
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Years of experience">
                <Input
                  type="number"
                  min={0}
                  max={80}
                  value={form.experienceYears}
                  onChange={(e) => setField("experienceYears", e.target.value)}
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Hospital / clinic name">
                <Input
                  value={form.clinic}
                  onChange={(e) => setField("clinic", e.target.value)}
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Consultation fee">
                <Input
                  value={form.fee}
                  onChange={(e) => setField("fee", e.target.value)}
                  placeholder="e.g. 50"
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Consultation type">
                <select
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                  value={form.consultationType}
                  onChange={(e) =>
                    setField("consultationType", e.target.value as FormState["consultationType"])
                  }
                >
                  {CONSULTATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Location">
                <Input
                  value={form.location}
                  onChange={(e) => setField("location", e.target.value)}
                  placeholder="City, area"
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Qualifications" hint="One per line or comma-separated">
                  <Textarea
                    value={form.qualifications}
                    onChange={(e) => setField("qualifications", e.target.value)}
                    rows={2}
                    className="!rounded-xl"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Certifications" hint="One per line or comma-separated">
                  <Textarea
                    value={form.certifications}
                    onChange={(e) => setField("certifications", e.target.value)}
                    rows={2}
                    className="!rounded-xl"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Areas of expertise" hint="One per line or comma-separated">
                  <Textarea
                    value={form.areasOfExpertise}
                    onChange={(e) => setField("areasOfExpertise", e.target.value)}
                    rows={2}
                    className="!rounded-xl"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Languages" hint="One per line or comma-separated">
                  <Input
                    value={form.languages}
                    onChange={(e) => setField("languages", e.target.value)}
                    className="!h-11 !rounded-xl"
                  />
                </Field>
              </div>
              <div className="sm:col-span-2">
                <Field label="Bio">
                  <Textarea
                    value={form.about}
                    onChange={(e) => setField("about", e.target.value)}
                    rows={3}
                    placeholder="Short professional bio for patients and the AI receptionist"
                    className="!rounded-xl"
                  />
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Doctor login account
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Login email" required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="doctor@clinic.com"
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <Field label="Password" required>
                <Input
                  type="password"
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                  placeholder="At least 8 characters"
                  className="!h-11 !rounded-xl"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label="Account status">
                  <select
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
                    value={form.isActive ? "active" : "inactive"}
                    onChange={(e) => setField("isActive", e.target.value === "active")}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </Field>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Availability
            </h3>
            <p className="text-[12.5px] text-slate-500">
              Weekly working days and hours used for booking slots and the AI receptionist.
            </p>
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              {form.weeklyHours.map((row) => (
                <div
                  key={row.day}
                  className="grid grid-cols-[110px_1fr] items-center gap-2 sm:grid-cols-[140px_auto_1fr_auto_1fr]"
                >
                  <label className="inline-flex items-center gap-2 text-[13px] font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => updateDay(row.day, { enabled: e.target.checked })}
                    />
                    {row.day}
                  </label>
                  <span className="hidden text-[12px] text-slate-400 sm:inline">From</span>
                  <Input
                    type="time"
                    value={row.startTime}
                    disabled={!row.enabled}
                    onChange={(e) => updateDay(row.day, { startTime: e.target.value })}
                    className="!h-10 !rounded-lg"
                  />
                  <span className="hidden text-[12px] text-slate-400 sm:inline">To</span>
                  <Input
                    type="time"
                    value={row.endTime}
                    disabled={!row.enabled}
                    onChange={(e) => updateDay(row.day, { endTime: e.target.value })}
                    className="!h-10 !rounded-lg"
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">
              Doctor profile image
            </h3>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center hover:bg-slate-100/80">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="Doctor preview"
                  className="size-20 rounded-2xl object-cover"
                />
              ) : (
                <span className="grid size-12 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <ImagePlus className="size-5" />
                </span>
              )}
              <span className="text-[13px] font-semibold text-slate-700">
                {photoFile ? photoFile.name : "Upload JPG, PNG, or WebP (max 5MB)"}
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  if (photoPreview) URL.revokeObjectURL(photoPreview);
                  setPhotoFile(file);
                  setPhotoPreview(file ? URL.createObjectURL(file) : "");
                }}
              />
            </label>
          </section>

          <section className="space-y-3">
            <h3 className="text-[13px] font-bold uppercase tracking-[0.12em] text-slate-500">
              AI receptionist integration
            </h3>
            <p className="text-[12.5px] text-slate-500">
              Clinic phone AI uses verified doctor profiles. Contact phone and bio above are included in
              receptionist context when this doctor is synced.
            </p>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 px-3 py-3">
              <input
                type="checkbox"
                className="mt-1"
                checked={form.isVerified}
                onChange={(e) => setField("isVerified", e.target.checked)}
              />
              <span>
                <span className="block text-[13.5px] font-semibold text-slate-800">
                  Mark as verified for Synthflow sync
                </span>
                <span className="mt-0.5 block text-[12.5px] text-slate-500">
                  Only verified doctors are published to the clinic AI receptionist directory.
                </span>
              </span>
            </label>
            <Field label="Verification note">
              <Input
                value={form.verificationNote}
                onChange={(e) => setField("verificationNote", e.target.value)}
                placeholder="Optional note for admin records"
                className="!h-11 !rounded-xl"
              />
            </Field>
          </section>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
          <Button type="button" variant="outline" className="rounded-xl" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            className="rounded-xl"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving ? "Creating…" : "Create doctor"}
          </Button>
        </div>
      </div>
    </div>
  );
}
