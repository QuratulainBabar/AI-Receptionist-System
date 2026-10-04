import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
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
  doctorProfileApi,
  doctorsApi,
  formatApiError,
  type ApiDoctorProfile,
  type ApiSpecialty,
  type ApiWeeklyHourSlot,
} from "@/lib/api";

export const Route = createFileRoute("/doctor/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Doctor portal" },
      {
        name: "description",
        content: "Update specialty, qualifications, fees, and weekly hours for patients and the phone AI.",
      },
    ],
  }),
  component: DoctorProfilePage,
});

const CONSULTATION_TYPES = ["In clinic", "Video call", "Both"] as const;

const DEFAULT_WEEKLY_HOURS: ApiWeeklyHourSlot[] = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
].map((day) => ({
  day,
  enabled: day !== "Saturday" && day !== "Sunday",
  startTime: "09:00",
  endTime: "17:00",
}));

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
};

function listToLines(values: string[] | null | undefined) {
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
    specialtyId: profile.specialtyId || "",
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
    weeklyHours:
      Array.isArray(profile.weeklyHours) && profile.weeklyHours.length > 0
        ? profile.weeklyHours
        : DEFAULT_WEEKLY_HOURS,
  };
}

function DoctorProfilePage() {
  const [form, setForm] = useState<FormState | null>(null);
  const [specialties, setSpecialties] = useState<ApiSpecialty[]>([]);
  const [meta, setMeta] = useState<{ fullName: string; email: string; reference: string } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;
    void Promise.all([doctorProfileApi.get(), doctorsApi.listSpecialties()])
      .then(([profileResult, specialtiesResult]) => {
        if (cancelled) return;
        setForm(profileToForm(profileResult.profile));
        setMeta({
          fullName: profileResult.profile.fullName,
          email: profileResult.profile.email,
          reference: profileResult.profile.reference,
        });
        setSpecialties(specialtiesResult.specialties ?? []);
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
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => (current ? { ...current, [key]: value } : current));
    setSuccess("");
  }

  function updateWeeklyHour(day: string, patch: Partial<ApiWeeklyHourSlot>) {
    setForm((current) => {
      if (!current) return current;
      return {
        ...current,
        weeklyHours: current.weeklyHours.map((slot) =>
          slot.day === day ? { ...slot, ...patch } : slot,
        ),
      };
    });
    setSuccess("");
  }

  async function saveProfile() {
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
      if (!form.specialtyId.trim()) {
        setError("Select a specialty.");
        return;
      }
      if (!form.clinic.trim() || !form.fee.trim()) {
        setError("Hospital name and consultation fee are required.");
        return;
      }

      const result = await doctorProfileApi.update({
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

      setForm(profileToForm(result.profile));
      setSuccess(
        "Profile saved. Super Admin Synthflow sync will push these verified details to the phone AI.",
      );
    } catch (err) {
      setError(formatApiError(err, "Unable to save doctor profile."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Doctor"
        title="My professional profile"
        description="These verified details appear for patients when they ask about you, and are included in the Synthflow doctors directory after Super Admin sync."
        actions={
          <Button onClick={() => void saveProfile()} disabled={!form || saving || loading}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
        }
      />

      {error ? <p className="mb-4 text-sm text-destructive">{error}</p> : null}
      {success ? <p className="mb-4 text-sm text-success">{success}</p> : null}

      {loading || !form ? (
        <EmptyNote>{loading ? "Loading profile…" : "Profile unavailable."}</EmptyNote>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <Panel className="space-y-4 p-4">
              <SectionLabel>Practice details</SectionLabel>
              {meta ? (
                <p className="text-sm text-muted-foreground">
                  {meta.fullName} · {meta.email} · {meta.reference}
                </p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
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
                    placeholder="e.g. Interventional cardiology"
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
                  <Input
                    value={form.clinic}
                    onChange={(e) => updateField("clinic", e.target.value)}
                    placeholder="Clinic or hospital name"
                  />
                </Field>
                <Field label="Consultation fee">
                  <Input
                    value={form.fee}
                    onChange={(e) => updateField("fee", e.target.value)}
                    placeholder="$60"
                  />
                </Field>
                <Field label="Location" hint="City, campus, or address patients should know.">
                  <Input
                    value={form.location}
                    onChange={(e) => updateField("location", e.target.value)}
                    placeholder="Northgate Medical Centre, Floor 2"
                  />
                </Field>
                <Field label="Spoken languages" hint="Comma or line separated.">
                  <Input
                    value={form.languages}
                    onChange={(e) => updateField("languages", e.target.value)}
                    placeholder="English, Urdu"
                  />
                </Field>
              </div>
            </Panel>

            <Panel className="space-y-4 p-4">
              <SectionLabel>Credentials & expertise</SectionLabel>
              <Field label="Qualifications" hint="One per line.">
                <Textarea
                  rows={3}
                  value={form.qualifications}
                  onChange={(e) => updateField("qualifications", e.target.value)}
                  placeholder="MBBS&#10;FCPS Cardiology"
                />
              </Field>
              <Field label="Certifications" hint="One per line.">
                <Textarea
                  rows={3}
                  value={form.certifications}
                  onChange={(e) => updateField("certifications", e.target.value)}
                  placeholder="Board certified&#10;BLS"
                />
              </Field>
              <Field label="Areas of expertise" hint="One per line.">
                <Textarea
                  rows={3}
                  value={form.areasOfExpertise}
                  onChange={(e) => updateField("areasOfExpertise", e.target.value)}
                  placeholder="Hypertension&#10;Arrhythmia"
                />
              </Field>
              <Field
                label="Professional bio"
                hint="Shared by the phone AI only when a patient asks about you."
              >
                <Textarea
                  rows={5}
                  value={form.about}
                  onChange={(e) => updateField("about", e.target.value)}
                  placeholder="Short professional summary for patients."
                />
              </Field>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel className="space-y-3 p-4">
              <SectionLabel>Available days and timings</SectionLabel>
              <p className="text-xs text-muted-foreground">
                Template for your usual weekly hours (also shown to the phone AI). Use Availability
                to generate and manage the actual bookable slots patients can reserve.
              </p>
              <div className="space-y-2">
                {form.weeklyHours.map((slot) => (
                  <div
                    key={slot.day}
                    className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded-xl border border-border/70 px-3 py-2"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={slot.enabled}
                        onChange={(e) => updateWeeklyHour(slot.day, { enabled: e.target.checked })}
                      />
                      {slot.day}
                    </label>
                    <Input
                      type="time"
                      className="h-9 w-[7.5rem]"
                      disabled={!slot.enabled}
                      value={slot.startTime}
                      onChange={(e) => updateWeeklyHour(slot.day, { startTime: e.target.value })}
                    />
                    <Input
                      type="time"
                      className="h-9 w-[7.5rem]"
                      disabled={!slot.enabled}
                      value={slot.endTime}
                      onChange={(e) => updateWeeklyHour(slot.day, { endTime: e.target.value })}
                    />
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-4">
              <SectionLabel>Phone AI note</SectionLabel>
              <p className="mt-2 text-sm text-muted-foreground">
                After Super Admin runs Synthflow sync, the receptionist agent receives this verified
                profile. It quotes specialty, fee, and slots for booking, and shares bio,
                qualifications, and hours only when the caller asks about you.
              </p>
            </Panel>
          </div>
        </div>
      )}
    </>
  );
}
